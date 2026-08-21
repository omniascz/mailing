/**
 * Meta Webhooks handler (shared for Instagram + Facebook Messenger).
 *
 *   GET  /webhook/meta   — Meta webhook verification challenge
 *   POST /webhook/meta   — Incoming events (messages, DLRs, read receipts)
 *
 *   GET    /api/v1/meta/pages             — list registered page mappings
 *   POST   /api/v1/meta/pages             — register a page → org mapping
 *   DELETE /api/v1/meta/pages/:pageId     — remove mapping
 *
 * The webhook URL registered in the Meta Developer Console must be:
 *   https://api.yourdomain.com/webhook/meta
 *
 * orgId is now resolved from the Page ID via the meta_page_mappings table.
 * If not found, falls back to META_ORG_ID env var for single-tenant deployments.
 *
 * Security: Meta signs payloads with SHA-256 HMAC using the App Secret.
 * We verify the X-Hub-Signature-256 header before processing.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { processInstagramWebhook } from '../../../services/inbox/instagram.js';
import type { MetaWebhookPayload } from '../../../services/inbox/instagram.js';
import { processMessengerWebhook } from '../../../services/inbox/messenger.js';
import type { MessengerWebhookPayload } from '../../../services/inbox/messenger.js';
import { db } from '../../../db/client.js';
import { metaPageMappings } from '../../../db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { env } from '../../../config/env.js';
import { metaWebhookEnabled } from '../../../lib/webhook-switches.js';

const verifyQuery = z.object({
  'hub.mode': z.string(),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string(),
});

export default async function metaWebhookRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };
  const adminAuth = { preHandler: [app.authenticate, app.requireRole('admin', 'owner')] };

  // ── Verification handshake (GET) ──────────────────────────────────────────
  // The two /webhook/meta routes are off by default; verifySignature below
  // returns true when META_APP_SECRET is unset. Gated here rather than by
  // skipping the whole route file, because this file also serves the
  // authenticated /api/v1/meta/pages admin surface, which is unaffected.
  app.get('/webhook/meta', async (req, reply) => {
    if (!metaWebhookEnabled()) {
      return reply.code(404).send({
        code: 'INTEGRATION_DISABLED',
        message: 'Meta webhooks is disabled. Set ENABLE_META_WEBHOOK=true to enable.',
      });
    }
    const query = verifyQuery.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: 'Missing hub params' });
    }

    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = query.data;
    const expected = env.META_WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === expected) {
      return reply.send(challenge);
    }

    return reply.code(403).send({ error: 'Forbidden' });
  });

  // ── Event delivery (POST) ─────────────────────────────────────────────────
  app.post('/webhook/meta', { config: { rawBody: true } }, async (req, reply) => {
    if (!metaWebhookEnabled()) {
      return reply.code(404).send({
        code: 'INTEGRATION_DISABLED',
        message: 'Meta webhooks is disabled. Set ENABLE_META_WEBHOOK=true to enable.',
      });
    }
    // Verify HMAC signature
    const signature = (req.headers['x-hub-signature-256'] as string | undefined) ?? '';
    if (!verifySignature(req, signature)) {
      return reply.code(403).send({ error: 'Invalid signature' });
    }

    const payload = req.body as MetaWebhookPayload | MessengerWebhookPayload;

    // Resolve orgId from page mapping table
    const orgId = await resolveOrgId(payload);
    if (!orgId) {
      // Unknown page — acknowledge but don't process
      return reply.send({ status: 'ok', warning: 'Page not registered' });
    }

    // Process asynchronously — Meta expects a fast 200 OK
    void handlePayload(orgId, payload);

    return reply.send({ status: 'ok' });
  });

  // ── Page mapping CRUD ─────────────────────────────────────────────────────

  const pageBodySchema = z.object({
    pageId: z.string().min(1).max(64),
    channel: z.enum(['instagram', 'messenger']),
    pageName: z.string().max(255).optional(),
    accessToken: z.string().max(512).optional(),
  });

  app.get('/api/v1/meta/pages', auth, async (req, reply) => {
    const rows = await db
      .select()
      .from(metaPageMappings)
      .where(eq(metaPageMappings.orgId, req.user!.orgId));
    return reply.send({ data: rows });
  });

  app.post('/api/v1/meta/pages', adminAuth, async (req, reply) => {
    const body = pageBodySchema.parse(req.body);
    const [row] = await db
      .insert(metaPageMappings)
      .values({ ...body, orgId: req.user!.orgId })
      .onConflictDoUpdate({
        target: [metaPageMappings.pageId, metaPageMappings.channel],
        set: {
          pageName: body.pageName,
          accessToken: body.accessToken,
          active: true,
          updatedAt: new Date(),
        },
      })
      .returning();
    return reply.code(201).send({ data: row });
  });

  app.delete('/api/v1/meta/pages/:pageId', adminAuth, async (req, reply) => {
    const { pageId } = req.params as { pageId: string };
    await db
      .update(metaPageMappings)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(metaPageMappings.orgId, req.user!.orgId), eq(metaPageMappings.pageId, pageId)));
    return reply.code(204).send();
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveOrgId(
  payload: MetaWebhookPayload | MessengerWebhookPayload,
): Promise<string | null> {
  // Extract page ID from payload
  let pageId: string | null = null;
  try {
    const p = payload as unknown as Record<string, unknown>;
    const entries = (p['entry'] as Array<Record<string, unknown>> | undefined) ?? [];
    if (entries.length > 0) {
      pageId = String(entries[0]?.['id'] ?? '');
    }
  } catch {
    // ignore
  }

  // Look up in meta_page_mappings
  if (pageId) {
    const [mapping] = await db
      .select({ orgId: metaPageMappings.orgId })
      .from(metaPageMappings)
      .where(and(eq(metaPageMappings.pageId, pageId), eq(metaPageMappings.active, true)))
      .limit(1);

    if (mapping) return mapping.orgId;
  }

  // Fallback to env var (single-tenant / dev)
  return process.env['META_ORG_ID'] ?? null;
}

async function handlePayload(
  orgId: string,
  payload: MetaWebhookPayload | MessengerWebhookPayload,
): Promise<void> {
  try {
    if (payload.object === 'instagram') {
      await processInstagramWebhook(orgId, payload as MetaWebhookPayload);
    } else if (payload.object === 'page') {
      await processMessengerWebhook(orgId, payload as MessengerWebhookPayload);
    }
  } catch (err) {
    console.error('[meta-webhook] processing error:', err);
  }
}

function verifySignature(req: FastifyRequest, signature: string): boolean {
  const appSecret = process.env['META_APP_SECRET'];
  if (!appSecret) return true; // Skip verification in dev

  const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!raw) return false;

  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(raw).digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
