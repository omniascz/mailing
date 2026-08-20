/**
 * Sending domain management routes:
 *  - GET    /api/v1/domains                     — list org's sending domains
 *  - POST   /api/v1/domains                     — add a new domain (generates DKIM keys)
 *  - GET    /api/v1/domains/:id                 — get domain with DNS record status
 *  - DELETE /api/v1/domains/:id                 — remove a domain
 *  - POST   /api/v1/domains/:id/dkim            — (re)generate DKIM key pair
 *  - GET    /api/v1/domains/:id/dns-records      — list all required DNS records
 *  - POST   /api/v1/domains/:id/verify          — trigger DNS verification for all records
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { sendingDomains, dkimKeys } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import {
  generateDkimKeyPair,
  importDkimPrivateKey,
  verifyDkimDns,
  buildDkimDnsRecord,
} from '../../services/domains/dkim.js';
import {
  rotateDkimKey,
  createInitialKey,
  verifyAndPromotePending,
  generateSelector,
  getRotationStatus,
} from '../../services/domains/dkim-rotation.js';
import { buildDnsRecords, verifyDnsRecords } from '../../services/domains/dns-records.js';
import { runQualityCheck } from '../../services/domains/quality-check.js';
import { getDomainWarmupStatus, getWarmupQuota } from '../../services/domains/warmup-scheduler.js';
import { sendTransactionalEmail } from '../../lib/queues.js';

const domainParam = z.object({ id: z.string().uuid() });

const DMARC_REPORT_EMAIL = process.env.DMARC_REPORT_EMAIL ?? 'dmarc-reports@forgemsg.com';

export default async function domainRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * GET /api/v1/domains
   * List all sending domains for this organisation.
   */
  app.get(
    '/api/v1/domains',
    { schema: { tags: ['Domains'], summary: 'List sending domains' } },
    async (req) => {
      const rows = await db
        .select()
        .from(sendingDomains)
        .where(eq(sendingDomains.orgId, req.user!.orgId))
        .orderBy(desc(sendingDomains.createdAt));

      // Never expose the private key
      return { data: rows.map(sanitise) };
    },
  );

  /**
   * POST /api/v1/domains
   * Add a new sending domain. Automatically generates a DKIM key pair.
   *
   * Body: { domain: string, mailSubdomain?: string }
   */
  app.post(
    '/api/v1/domains',
    { schema: { tags: ['Domains'], summary: 'Add sending domain' } },
    async (req, reply) => {
      const { domain, mailSubdomain, dkimKeyType } = z
        .object({
          domain: z
            .string()
            .min(4)
            .max(253)
            .regex(/^[a-z0-9.-]+$/i, 'Invalid domain'),
          mailSubdomain: z.string().min(4).max(253).optional(),
          // rsa (default, universally supported) or ed25519 (RFC 8463).
          dkimKeyType: z.enum(['rsa', 'ed25519']).optional(),
        })
        .parse(req.body);

      const sub = mailSubdomain ?? `mail.${domain}`;

      // Generate DKIM key pair (algorithm per request; defaults to RSA).
      const keyPair = await generateDkimKeyPair(dkimKeyType ?? 'rsa');

      const row = await db
        .transaction(async (tx) => {
          const [inserted] = await tx
            .insert(sendingDomains)
            .values({ orgId: req.user!.orgId, domain, mailSubdomain: sub })
            .returning();
          // The DKIM key lives in dkim_keys as the source of truth; createInitialKey
          // inserts it (pending) and syncs the sending_domains mirror. The mirror
          // columns are never written directly here — only by the rotation service.
          await createInitialKey(tx, {
            orgId: req.user!.orgId,
            domainId: inserted!.id,
            selector: generateSelector(new Date()),
            privateKeyPem: keyPair.privateKeyPem,
            publicKeyBase64: keyPair.publicKeyBase64,
            keyType: keyPair.keyType,
          });
          const [fresh] = await tx
            .select()
            .from(sendingDomains)
            .where(eq(sendingDomains.id, inserted!.id))
            .limit(1);
          return fresh!;
        })
        .catch((err: Error) => {
          if (err.message.includes('sending_domains_org_domain_idx')) {
            throw AppError.conflict(
              `Domain "${domain}" is already registered for this organisation`,
            );
          }
          throw err;
        });

      return reply.code(201).send({ data: sanitise(row) });
    },
  );

  /**
   * GET /api/v1/domains/:id
   * Get a single domain (without private key).
   */
  app.get(
    '/api/v1/domains/:id',
    { schema: { tags: ['Domains'], summary: 'Get sending domain' } },
    async (req) => {
      const { id } = domainParam.parse(req.params);
      const [row] = await db
        .select()
        .from(sendingDomains)
        .where(and(eq(sendingDomains.id, id), eq(sendingDomains.orgId, req.user!.orgId)))
        .limit(1);
      if (!row) throw AppError.notFound('Sending domain');
      return { data: sanitise(row) };
    },
  );

  /**
   * DELETE /api/v1/domains/:id
   */
  app.delete(
    '/api/v1/domains/:id',
    { schema: { tags: ['Domains'], summary: 'Remove sending domain' } },
    async (req, reply) => {
      const { id } = domainParam.parse(req.params);
      const [row] = await db
        .delete(sendingDomains)
        .where(and(eq(sendingDomains.id, id), eq(sendingDomains.orgId, req.user!.orgId)))
        .returning();
      if (!row) throw AppError.notFound('Sending domain');
      return reply.code(204).send();
    },
  );

  /**
   * POST /api/v1/domains/:id/dkim
   * Rotate the DKIM key pair for a domain — WITHOUT an unsigned window.
   *
   * Generates a new key as `pending`. The current `active` key keeps signing
   * mail until the customer publishes the new record and calls /verify, which
   * promotes the new key and retires the old. A second call returns the existing
   * pending unchanged (idempotent); `?force=true` starts a fresh one.
   */
  app.post(
    '/api/v1/domains/:id/dkim',
    { schema: { tags: ['Domains'], summary: 'Generate / rotate DKIM key pair' } },
    async (req) => {
      const { id } = domainParam.parse(req.params);
      const [existing] = await db
        .select({ id: sendingDomains.id, byo: sendingDomains.dkimByo })
        .from(sendingDomains)
        .where(and(eq(sendingDomains.id, id), eq(sendingDomains.orgId, req.user!.orgId)))
        .limit(1);
      if (!existing) throw AppError.notFound('Sending domain');

      const { force } = z.object({ force: z.coerce.boolean().optional() }).parse(req.query);
      if (existing.byo && !force) {
        throw AppError.badRequest(
          'This domain uses an imported (BYODKIM) key. Pass ?force=true to overwrite with a generated key.',
        );
      }

      const result = await rotateDkimKey(req.user!.orgId, id, { force });

      return {
        data: {
          selector: result.key.selector,
          dnsRecord: result.dnsRecord,
          reused: result.reused,
          message: result.reused
            ? `A rotation is already pending on selector ${result.key.selector}. Publish that record, then call POST /api/v1/domains/${id}/verify. Pass ?force=true to start over.`
            : `Publish the DNS TXT record, then call POST /api/v1/domains/${id}/verify. Your current key keeps signing until then.`,
        },
      };
    },
  );

  /**
   * POST /api/v1/domains/:id/dkim/import — BYODKIM.
   * Import a customer-supplied DKIM private key + selector. The public key is
   * derived and returned as the DNS record the customer must publish.
   */
  app.post(
    '/api/v1/domains/:id/dkim/import',
    {
      preHandler: [app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Domains'], summary: 'Import your own DKIM key (BYODKIM)' },
    },
    async (req) => {
      const { id } = domainParam.parse(req.params);
      const body = z
        .object({
          selector: z
            .string()
            .regex(/^[a-z0-9._-]+$/i)
            .max(63),
          privateKey: z.string().min(64),
        })
        .parse(req.body);

      const [existing] = await db
        .select({ id: sendingDomains.id, domain: sendingDomains.domain })
        .from(sendingDomains)
        .where(and(eq(sendingDomains.id, id), eq(sendingDomains.orgId, req.user!.orgId)))
        .limit(1);
      if (!existing) throw AppError.notFound('Sending domain');

      let imported;
      try {
        imported = importDkimPrivateKey(body.privateKey);
      } catch (err) {
        throw AppError.badRequest((err as Error).message);
      }

      // BYODKIM rides the same lifecycle: the imported key enters as `pending`
      // and /verify promotes it, so importing a new key over a verified one is a
      // rotation with no unsigned window either. The `dkim_byo` flag is set so
      // the generate-rotate endpoint refuses to clobber it without ?force.
      const dnsRecord = await db
        .transaction(async (tx) => {
          await tx
            .delete(dkimKeys)
            .where(and(eq(dkimKeys.domainId, id), eq(dkimKeys.status, 'pending')));
          await createInitialKey(tx, {
            orgId: req.user!.orgId,
            domainId: id,
            selector: body.selector,
            privateKeyPem: imported.privateKeyPem,
            publicKeyBase64: imported.publicKeyBase64,
            keyType: imported.keyType,
            isByo: true,
          });
          await tx.update(sendingDomains).set({ dkimByo: true }).where(eq(sendingDomains.id, id));
          return buildDkimDnsRecord(
            body.selector,
            existing.domain,
            imported.publicKeyBase64,
            imported.keyType,
          );
        })
        .catch((err: Error) => {
          if (err.message.includes('dkim_keys_domain_selector_uq')) {
            throw AppError.conflict(
              `Selector "${body.selector}" is already in use for this domain (an active or retiring key holds it). Choose another selector.`,
            );
          }
          throw err;
        });

      return {
        data: {
          selector: body.selector,
          dnsRecord,
          byo: true,
          message: `Publish the DNS TXT record, then call POST /api/v1/domains/${id}/verify`,
        },
      };
    },
  );

  /**
   * GET /api/v1/domains/:id/dkim/rotation
   * The state of a DKIM rotation so the customer knows exactly what to do:
   *   - active:   the selector signing mail right now (and when it verified)
   *   - pending:  a new selector awaiting DNS publication, with the record to add
   *   - retiring: old selectors still in DNS, each with the date it becomes
   *               safe to DELETE — without this list the zone silently accretes
   *               dead _domainkey TXT records over successive rotations.
   */
  app.get(
    '/api/v1/domains/:id/dkim/rotation',
    { schema: { tags: ['Domains'], summary: 'DKIM rotation status' } },
    async (req) => {
      const { id } = domainParam.parse(req.params);
      const [exists] = await db
        .select({ id: sendingDomains.id })
        .from(sendingDomains)
        .where(and(eq(sendingDomains.id, id), eq(sendingDomains.orgId, req.user!.orgId)))
        .limit(1);
      if (!exists) throw AppError.notFound('Sending domain');
      return { data: await getRotationStatus(req.user!.orgId, id) };
    },
  );

  /**
   * GET /api/v1/domains/:id/dns-records
   * Return all required DNS records (with current verification status from DB).
   */
  app.get(
    '/api/v1/domains/:id/dns-records',
    { schema: { tags: ['Domains'], summary: 'Get required DNS records' } },
    async (req) => {
      const { id } = domainParam.parse(req.params);
      const [domain] = await db
        .select()
        .from(sendingDomains)
        .where(and(eq(sendingDomains.id, id), eq(sendingDomains.orgId, req.user!.orgId)))
        .limit(1);
      if (!domain) throw AppError.notFound('Sending domain');

      const records = buildDnsRecords({
        domain: domain.domain,
        mailSubdomain: domain.mailSubdomain ?? `mail.${domain.domain}`,
        dkimSelector: domain.dkimSelector,
        dkimPublicKey: domain.dkimPublicKey ?? '',
        dkimKeyType: (domain.dkimKeyType as 'rsa' | 'ed25519' | undefined) ?? 'rsa',
        dmarcEmail: DMARC_REPORT_EMAIL,
      });

      // Overlay persisted verification state
      return {
        data: records.map((r) => {
          if (r.purpose.startsWith('DKIM')) {
            return {
              ...r,
              verified: domain.dkimVerified,
              lastCheckedAt: domain.dkimVerifiedAt?.toISOString() ?? null,
            };
          }
          if (r.purpose.startsWith('SPF')) {
            return {
              ...r,
              verified: domain.spfVerified,
              lastCheckedAt: domain.spfVerifiedAt?.toISOString() ?? null,
            };
          }
          if (r.purpose.startsWith('DMARC')) {
            return {
              ...r,
              verified: domain.dmarcVerified,
              lastCheckedAt: domain.dmarcVerifiedAt?.toISOString() ?? null,
            };
          }
          if (r.purpose.startsWith('Return-Path')) {
            return {
              ...r,
              verified: domain.returnPathVerified,
              lastCheckedAt: domain.returnPathVerifiedAt?.toISOString() ?? null,
            };
          }
          return r;
        }),
      };
    },
  );

  /**
   * POST /api/v1/domains/:id/verify
   * Perform live DNS lookups for all records and persist results.
   *
   * Returns per-record status and overall `isVerified` flag.
   */
  app.post(
    '/api/v1/domains/:id/verify',
    { schema: { tags: ['Domains'], summary: 'Verify DNS records' } },
    async (req) => {
      const { id } = domainParam.parse(req.params);
      const [domain] = await db
        .select()
        .from(sendingDomains)
        .where(and(eq(sendingDomains.id, id), eq(sendingDomains.orgId, req.user!.orgId)))
        .limit(1);
      if (!domain) throw AppError.notFound('Sending domain');

      if (!domain.dkimPublicKey) {
        throw AppError.badRequest('Generate DKIM keys first via POST /api/v1/domains/:id/dkim');
      }

      const records = buildDnsRecords({
        domain: domain.domain,
        mailSubdomain: domain.mailSubdomain ?? `mail.${domain.domain}`,
        dkimSelector: domain.dkimSelector,
        dkimPublicKey: domain.dkimPublicKey,
        dmarcEmail: DMARC_REPORT_EMAIL,
      });

      const { records: checked, allVerified } = await verifyDnsRecords(records);

      // Promote a pending rotation key whose DNS is now live: pending → active,
      // old active → retiring, mirror moves to the new key. Runs before the
      // DKIM check below so that check reads the freshly-promoted mirror.
      const promotion = await verifyAndPromotePending(req.user!.orgId, id);
      const [afterPromo] = promotion.promoted
        ? await db
            .select({ selector: sendingDomains.dkimSelector, pub: sendingDomains.dkimPublicKey })
            .from(sendingDomains)
            .where(eq(sendingDomains.id, id))
            .limit(1)
        : [{ selector: domain.dkimSelector, pub: domain.dkimPublicKey }];

      // Targeted DKIM verification against the current (possibly just-promoted)
      // active selector.
      const dkimOk = await verifyDkimDns(
        afterPromo!.selector,
        domain.domain,
        afterPromo!.pub ?? domain.dkimPublicKey,
      );

      const spfRec = checked.find((r) => r.purpose.startsWith('SPF'));
      const dmarcRec = checked.find((r) => r.purpose.startsWith('DMARC'));
      const rpRec = checked.find((r) => r.purpose.startsWith('Return-Path'));

      const now = new Date();
      const nowOrNull = (ok: boolean | undefined) => (ok ? now : null);

      await db
        .update(sendingDomains)
        .set({
          spfVerified: spfRec?.verified ?? false,
          spfVerifiedAt: nowOrNull(spfRec?.verified),
          dkimVerified: dkimOk,
          dkimVerifiedAt: dkimOk ? now : null,
          dmarcVerified: dmarcRec?.verified ?? false,
          dmarcVerifiedAt: nowOrNull(dmarcRec?.verified),
          returnPathVerified: rpRec?.verified ?? false,
          returnPathVerifiedAt: nowOrNull(rpRec?.verified),
          isVerified: allVerified && dkimOk,
          updatedAt: now,
        })
        .where(eq(sendingDomains.id, id));

      return {
        data: {
          records: checked.map((r) =>
            r.purpose.startsWith('DKIM') ? { ...r, verified: dkimOk } : r,
          ),
          allVerified: allVerified && dkimOk,
        },
      };
    },
  );

  // ── Quality check (Sprint E.9) ──────────────────────────────────────────────

  /**
   * GET /api/v1/domains/:id/quality-check
   * Consolidated readiness report — runs all 4 mandatory DNS checks (SPF /
   * DKIM / DMARC / Return-Path) plus 3 advisory checks (DMARC policy
   * enforcement, DMARC rua aggregate reporting, BIMI readiness). Returns
   * { ready, errorCount, warningCount, checks[] } where ready=true means
   * every error-severity check passed.
   */
  app.get(
    '/api/v1/domains/:id/quality-check',
    {
      schema: {
        tags: ['Domains'],
        summary: 'Run consolidated authentication + deliverability checks',
      },
    },
    async (req, reply) => {
      const { id } = domainParam.parse(req.params);
      const report = await runQualityCheck(req.user!.orgId, id);
      return reply.send({ data: report });
    },
  );

  /**
   * POST /api/v1/domains/:id/send-test
   * Enqueue a self-addressed test email from this sending domain to the
   * caller's account email. Useful after DNS propagation to verify the
   * end-to-end pipeline (queue → worker → MTA gRPC → SMTP) is working
   * and to inspect SPF/DKIM/DMARC headers on the received message.
   *
   * Body: { to?: string }  // defaults to caller's session email
   */
  app.post(
    '/api/v1/domains/:id/send-test',
    { schema: { tags: ['Domains'], summary: 'Send a test email from this domain' } },
    async (req, reply) => {
      const { id } = domainParam.parse(req.params);
      const { to } = z
        .object({ to: z.string().email().optional() })
        .parse((req.body as Record<string, unknown>) ?? {});

      const orgId = req.user!.orgId;
      const recipient = to ?? req.user!.email;

      const [row] = await db
        .select()
        .from(sendingDomains)
        .where(and(eq(sendingDomains.id, id), eq(sendingDomains.orgId, orgId)))
        .limit(1);
      if (!row) throw AppError.notFound('Sending domain');

      const fromLocal = process.env.DOI_FROM_EMAIL?.split('@')[0] || 'no-reply';
      const fromAddress = `${fromLocal}@${row.domain}`;
      const sentAt = new Date().toISOString();

      const messageId = await sendTransactionalEmail({
        to: recipient,
        from: fromAddress,
        fromName: 'Mailforge test',
        subject: `Mailforge test from ${row.domain}`,
        html: `<p>This is a test from <strong>${row.domain}</strong>.</p>
<p>If it landed in the inbox (not spam), your sending domain is working. Check the headers to confirm SPF, DKIM and DMARC pass.</p>
<p style="color:#888;font-size:12px">Sent at ${sentAt}</p>`,
        text: `Mailforge test from ${row.domain}\n\nIf this landed in your inbox, your sending domain is working.\nSent at ${sentAt}`,
        orgId,
      });

      return reply.code(202).send({
        data: { messageId, sentTo: recipient, from: fromAddress },
      });
    },
  );

  // ── Public reputation badge opt-in (#440) ───────────────────────────────────

  app.patch(
    '/api/v1/domains/:id/public-badge',
    {
      schema: { tags: ['Domains'], summary: 'Toggle the public reputation badge for this domain' },
    },
    async (req, reply) => {
      const { id } = domainParam.parse(req.params);
      const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
      const orgId = req.user!.orgId;

      const [updated] = await db
        .update(sendingDomains)
        .set({ publicBadgeEnabled: enabled, updatedAt: new Date() })
        .where(and(eq(sendingDomains.id, id), eq(sendingDomains.orgId, orgId)))
        .returning({
          id: sendingDomains.id,
          domain: sendingDomains.domain,
          publicBadgeEnabled: sendingDomains.publicBadgeEnabled,
        });
      if (!updated) throw AppError.notFound('Sending domain');

      return reply.send({ data: updated });
    },
  );

  // ── Warmup status (#220) ────────────────────────────────────────────────────

  app.get(
    '/api/v1/domains/:id/warmup',
    { schema: { tags: ['Domains'], summary: 'Get warmup status and daily quota for a domain' } },
    async (req) => {
      const { id } = domainParam.parse(req.params);
      const orgId = req.user!.orgId;
      const status = await getDomainWarmupStatus(orgId, id);
      // Include full warmup ramp for display
      const ramp = Array.from({ length: 30 }, (_, i) => ({
        day: i + 1,
        quota: getWarmupQuota(i + 1),
      }));
      return { data: { ...status, ramp } };
    },
  );
}

// ─── Helper: strip private key ────────────────────────────────────────────────

function sanitise(row: typeof sendingDomains.$inferSelect) {
  const { dkimPrivateKey: _priv, ...safe } = row;
  void _priv;
  return safe;
}
