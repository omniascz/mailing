/**
 * CDP source connector routes (#263).
 *
 *  GET    /api/v1/cdp/sources                — list configured sources
 *  POST   /api/v1/cdp/sources                — create source
 *  PATCH  /api/v1/cdp/sources/:id            — update config/cron/status
 *  DELETE /api/v1/cdp/sources/:id            — delete source
 *  POST   /api/v1/cdp/sources/:id/sync       — trigger manual sync
 *  GET    /api/v1/cdp/sources/:id/runs       — list sync runs
 *
 *  POST   /api/v1/cdp/sources/:id/webhook    — inbound push webhook (no session — HMAC verified)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { cdpSources, cdpSyncRuns } from '../../../db/schema/cdp-sources.js';
import { AppError } from '../../../lib/app-error.js';
import {
  runSync,
  listConnectors,
  isConnectorAvailable,
  CONNECTOR_CATALOG,
} from '../../../services/cdp/connectors/index.js';
import { upsertContactFromCdp } from '../../../services/cdp/source-sync.js';
import { checkWebhookSignature } from '../../../lib/webhook-signature.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Header the push sender presents. Same name this product signs OUTBOUND
 *  activations with (services/cdp/activation.ts:deliverWebhook), so a customer
 *  wiring ForgeMsg→ForgeMsg sees one convention rather than two. */
const CDP_SIGNATURE_HEADER = 'x-forgemsg-signature';

/**
 * HMAC-SHA256 of the exact bytes received, compared in constant time.
 *
 * Two encodings are accepted for one reason each: bare hex is what our own
 * outbound activation emits, and `sha256=<hex>` is what every sender that
 * copied GitHub/Meta emits. Both are the same digest; refusing one of them
 * would be a compatibility trap, not a security property.
 */
function verifyCdpSignature(rawBody: string, presented: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const offered = presented.startsWith('sha256=') ? presented.slice(7) : presented;
  // timingSafeEqual throws on a length mismatch, which would both 500 the route
  // and leak the length. Hex of a fixed-width digest is always 64 chars, so a
  // different length is simply wrong.
  if (offered.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(offered, 'utf8'), Buffer.from(expected, 'utf8'));
}

const cdpSourceRoutes: FastifyPluginAsync = async (app) => {
  // ── Connector catalog ─────────────────────────────────────────────────────────
  // Lets the UI offer only usable connectors instead of surfacing kinds that
  // would fail on first sync.

  app.get(
    '/api/v1/cdp/connectors',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CDP Sources'], summary: 'List connectors + availability status' },
    },
    async (_req, reply) => {
      return reply.send({ data: listConnectors() });
    },
  );

  // ── List sources ────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/cdp/sources',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CDP Sources'] },
    },
    async (req, reply) => {
      const rows = await db
        .select({
          id: cdpSources.id,
          name: cdpSources.name,
          kind: cdpSources.kind,
          direction: cdpSources.direction,
          status: cdpSources.status,
          syncCron: cdpSources.syncCron,
          lastSyncAt: cdpSources.lastSyncAt,
          lastError: cdpSources.lastError,
          createdAt: cdpSources.createdAt,
        })
        .from(cdpSources)
        .where(eq(cdpSources.orgId, req.user!.orgId))
        .orderBy(desc(cdpSources.createdAt));
      return reply.send({ data: rows });
    },
  );

  // ── Create source ───────────────────────────────────────────────────────────

  app.post(
    '/api/v1/cdp/sources',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['CDP Sources'] },
    },
    async (req, reply) => {
      const body = sourceSchema.parse(req.body);
      // Reject connectors that aren't built yet up front — otherwise the source
      // is created but silently fails on first sync.
      if (!isConnectorAvailable(body.kind)) {
        throw AppError.badRequest(
          `Connector '${CONNECTOR_CATALOG[body.kind]?.label ?? body.kind}' is not yet available. ` +
            `Available: ${listConnectors()
              .filter((c) => c.status !== 'planned')
              .map((c) => c.kind)
              .join(', ')}.`,
        );
      }
      const [row] = await db
        .insert(cdpSources)
        .values({
          orgId: req.user!.orgId,
          ...body,
        })
        .returning();
      return reply.code(201).send({ data: row });
    },
  );

  // ── Update source ───────────────────────────────────────────────────────────

  app.patch(
    '/api/v1/cdp/sources/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['CDP Sources'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = sourceSchema.partial().parse(req.body);
      if (body.kind !== undefined && !isConnectorAvailable(body.kind)) {
        throw AppError.badRequest(
          `Connector '${CONNECTOR_CATALOG[body.kind]?.label ?? body.kind}' is not yet available.`,
        );
      }
      const [row] = await db
        .update(cdpSources)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(cdpSources.id, id), eq(cdpSources.orgId, req.user!.orgId)))
        .returning();
      if (!row) throw AppError.notFound('CDP source');
      return reply.send({ data: row });
    },
  );

  // ── Delete source ───────────────────────────────────────────────────────────

  app.delete(
    '/api/v1/cdp/sources/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['CDP Sources'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const [row] = await db
        .delete(cdpSources)
        .where(and(eq(cdpSources.id, id), eq(cdpSources.orgId, req.user!.orgId)))
        .returning({ id: cdpSources.id });
      if (!row) throw AppError.notFound('CDP source');
      return reply.send({ data: { deleted: true } });
    },
  );

  // ── Manual sync ─────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/cdp/sources/:id/sync',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['CDP Sources'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const [source] = await db
        .select({ id: cdpSources.id, orgId: cdpSources.orgId })
        .from(cdpSources)
        .where(and(eq(cdpSources.id, id), eq(cdpSources.orgId, req.user!.orgId)))
        .limit(1);
      if (!source) throw AppError.notFound('CDP source');

      // Run async — return immediately with run status
      runSync(source.id).catch(() => {});
      return reply.send({ data: { triggered: true } });
    },
  );

  // ── Sync run history ────────────────────────────────────────────────────────

  app.get(
    '/api/v1/cdp/sources/:id/runs',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CDP Sources'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
        })
        .parse(req.query);

      // `cdp_sync_runs` carries its own org_id, so the tenant check is a column
      // comparison rather than a lookup through the source. Without it this
      // listed another tenant's sync history — row counts, error strings and
      // timings — for any source UUID. Every sibling route in this file already
      // resolves the source with `eq(cdpSources.orgId, req.user!.orgId)` before
      // touching it; this one read straight from the child table.
      const rows = await db
        .select()
        .from(cdpSyncRuns)
        .where(and(eq(cdpSyncRuns.sourceId, id), eq(cdpSyncRuns.orgId, req.user!.orgId)))
        .orderBy(desc(cdpSyncRuns.startedAt))
        .limit(query.limit);

      return reply.send({ data: rows });
    },
  );

  // ── Inbound push webhook (no session — sources POST events here) ───────────
  //
  // The docstring above this route used to say "no auth — HMAC verified" and
  // there was no HMAC verification in the handler. Anyone who learned a source
  // UUID could POST 500 contact records straight into that source's org: the
  // handler reads `source.orgId` from the row it just loaded, so the caller
  // chose the tenant by choosing the id in the URL.
  //
  // Fail-closed via lib/webhook-signature.ts (#86), the same gate the six
  // e-commerce receivers and Calendly use. A source with no
  // `config.webhookSecret` is REFUSED, not waved through — and that has a
  // consequence worth stating plainly: any push source configured before this
  // change has no secret, so it starts answering 401
  // WEBHOOK_SECRET_NOT_CONFIGURED until an operator sets one through
  // `PATCH /api/v1/cdp/sources/:id`. That is the honest form of what the route
  // was already doing, which was accepting every caller without checking any
  // of them. The secret lives in the existing `config` jsonb — no migration,
  // and `sourceSchema.config` is already `z.record(z.unknown())`.

  app.post(
    '/api/v1/cdp/sources/:id/webhook',
    {
      schema: { tags: ['CDP Sources'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const [source] = await db.select().from(cdpSources).where(eq(cdpSources.id, id)).limit(1);
      if (!source || source.direction !== 'push') {
        return reply.code(404).send({ error: 'Not found' });
      }

      // The exact bytes, from the global buffer parser in index.ts. A
      // re-serialised JSON.stringify(req.body) reorders keys and drops
      // whitespace, so it can never reproduce the sender's digest — several
      // receivers in this repo carry that fallback and it is a permanent
      // signature failure dressed up as a default. Absent rawBody (a body that
      // did not arrive as application/json) is a refusal.
      const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
      const config = source.config as Record<string, unknown>;
      const header = req.headers[CDP_SIGNATURE_HEADER];
      const sig = checkWebhookSignature({
        integration: 'CDP push source',
        secret: config['webhookSecret'] as string | undefined,
        signature: Array.isArray(header) ? header[0] : header,
        rawBody: rawBody ? rawBody.toString('utf8') : '',
        verify: (body, presented, secret) =>
          rawBody !== undefined && verifyCdpSignature(body, presented, secret),
      });
      if (!sig.ok) {
        req.log.warn({ sourceId: source.id, code: sig.code }, '[cdp] push webhook refused');
        return reply.code(sig.status).send({ code: sig.code, message: sig.message });
      }

      // Accept a batch of contact records
      const payload = z
        .object({
          contacts: z
            .array(
              z.object({
                externalId: z.string(),
                email: z.string().email().optional(),
                firstName: z.string().optional(),
                lastName: z.string().optional(),
                phone: z.string().optional(),
                traits: z.record(z.unknown()).optional(),
              }),
            )
            .max(500),
        })
        .parse(req.body);

      let upserted = 0;
      for (const c of payload.contacts) {
        await upsertContactFromCdp(source.orgId, { ...c, source: source.kind }).catch(() => {});
        upserted++;
      }

      await db
        .update(cdpSources)
        .set({ lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(cdpSources.id, id));

      return reply.send({ data: { received: upserted } });
    },
  );
};

// ─── Validation schema ────────────────────────────────────────────────────────

const sourceSchema = z.object({
  name: z.string().min(1).max(255),
  kind: z.enum([
    'hubspot',
    'salesforce',
    'pipedrive',
    'shopify',
    'woocommerce',
    'bigcommerce',
    'stripe',
    'zendesk',
    'intercom',
    'freshdesk',
    'meta_ads',
    'google_ads',
    'tiktok_ads',
    'google_analytics',
    'segment',
    'mixpanel',
    'webhook',
    'http_pull',
  ]),
  direction: z.enum(['pull', 'push']).default('pull'),
  config: z.record(z.unknown()).default({}),
  status: z.enum(['active', 'paused']).default('active'),
  syncCron: z.string().max(64).default('0 * * * *'),
});

export default cdpSourceRoutes;
