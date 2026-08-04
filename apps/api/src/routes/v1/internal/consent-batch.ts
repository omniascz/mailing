/**
 * Internal consent batch check — returns the subset of contact IDs that must
 * NOT receive a send under the campaign's GDPR processing purpose.
 *
 * Mirrors /internal/holdout/check-batch and /internal/suppressions/check-batch:
 * one round-trip per batch instead of N, same unauthenticated internal-network
 * posture, same `{ data: … }` envelope.
 *
 * Three outcomes, deliberately distinguishable by the caller:
 *
 *   1. FEATURE OFF   — the org has no active processing purpose at all.
 *                      → 200 { blocked: [], featureEnabled: false }
 *                      Orgs that never adopted purposes keep sending.
 *
 *   2. ENFORCING     — the campaign names a live purpose.
 *                      → 200 { blocked: [...], featureEnabled: true }
 *
 *   3. CONFIG ERROR  — the campaign names a purpose that is missing or
 *                      archived. This is a misconfiguration, not an opt-out,
 *                      so it blocks the whole batch rather than silently
 *                      letting it through.
 *                      → 200 { blocked: <every id>, configError: true, message }
 *
 * Case 3 returns HTTP 200 on purpose. A non-2xx would be indistinguishable
 * from a transient fault, and the worker fails OPEN on transient faults to
 * match the other three pre-checks — which would invert the intent exactly
 * when the configuration is broken.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, inArray, desc } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { processingPurposes, contactGdprConsents } from '../../../db/schema/index.js';
import { getBatchBlockedContacts } from '../../../services/gdpr/send-guardrail.js';

/** Why a contact was blocked — surfaced so the worker can log a real reason. */
type BlockReason = 'no_consent' | 'consent_revoked' | 'consent_expired';

const internalConsentBatchRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/consent/check-batch',
    {
      schema: { tags: ['Internal'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          orgId: z.string().uuid(),
          contactIds: z.array(z.string().uuid()).max(1000),
          processingPurposeId: z.string().uuid().nullable().optional(),
        })
        .parse(req.body);

      if (body.contactIds.length === 0) {
        return reply.send({ data: { blocked: [], reasons: {}, featureEnabled: true } });
      }

      // ── 1. Feature off: the org configured no purposes at all ──────────────
      const activePurposes = await db
        .select({ id: processingPurposes.id, slug: processingPurposes.slug })
        .from(processingPurposes)
        .where(
          and(eq(processingPurposes.orgId, body.orgId), eq(processingPurposes.archived, false)),
        );

      if (activePurposes.length === 0) {
        return reply.send({ data: { blocked: [], reasons: {}, featureEnabled: false } });
      }

      // The org enforces purposes but this campaign names none. Send-time
      // validation rejects that, so reaching here means an in-flight campaign
      // enqueued before the purpose existed. Treat as feature-off for the
      // batch rather than blocking a send the operator already approved.
      if (!body.processingPurposeId) {
        return reply.send({
          data: { blocked: [], reasons: {}, featureEnabled: true, missingPurpose: true },
        });
      }

      // ── 3. Config error: named purpose is gone or archived ────────────────
      const purpose = activePurposes.find((p) => p.id === body.processingPurposeId);
      if (!purpose) {
        return reply.send({
          data: {
            blocked: body.contactIds,
            reasons: {},
            featureEnabled: true,
            configError: true,
            message: `Processing purpose ${body.processingPurposeId} is missing or archived for org ${body.orgId} — blocking the batch rather than sending without consent.`,
          },
        });
      }

      // ── 2. Enforcing ──────────────────────────────────────────────────────
      const blockedSet = await getBatchBlockedContacts(body.orgId, body.contactIds, purpose.slug);
      const blocked = body.contactIds.filter((id) => blockedSet.has(id));

      // Derive a per-contact reason for the blocked subset only, so the worker
      // can log something better than "blocked". One extra query, scoped to
      // contacts we already know are blocked.
      const reasons: Record<string, BlockReason> = {};
      if (blocked.length > 0) {
        const rows = await db
          .select({
            contactId: contactGdprConsents.contactId,
            granted: contactGdprConsents.granted,
            revokedAt: contactGdprConsents.revokedAt,
            expiresAt: contactGdprConsents.expiresAt,
            grantedAt: contactGdprConsents.grantedAt,
          })
          .from(contactGdprConsents)
          .where(
            and(
              eq(contactGdprConsents.orgId, body.orgId),
              eq(contactGdprConsents.purposeId, purpose.id),
              inArray(contactGdprConsents.contactId, blocked),
            ),
          )
          .orderBy(desc(contactGdprConsents.grantedAt));

        const latest = new Map<string, (typeof rows)[number]>();
        for (const r of rows) if (!latest.has(r.contactId)) latest.set(r.contactId, r);

        const now = new Date();
        for (const id of blocked) {
          const row = latest.get(id);
          if (!row) reasons[id] = 'no_consent';
          else if (row.revokedAt) reasons[id] = 'consent_revoked';
          else if (!row.granted) reasons[id] = 'no_consent';
          else if (row.expiresAt && row.expiresAt < now) reasons[id] = 'consent_expired';
          else reasons[id] = 'no_consent';
        }
      }

      return reply.send({ data: { blocked, reasons, featureEnabled: true } });
    },
  );
};

export default internalConsentBatchRoutes;
