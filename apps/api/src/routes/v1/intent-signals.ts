/**
 * Buyer intent signals routes (#333).
 *
 *  GET  /api/v1/intent-signals                    — list signals (filterable)
 *  POST /api/v1/intent-signals                    — ingest a signal
 *  GET  /api/v1/intent-signals/scores             — aggregate scores per contact/domain
 *  GET  /api/v1/contacts/:id/intent-score         — intent score for a contact
 *  POST /api/v1/intent-signals/batch              — ingest up to 500 signals at once
 *  POST /api/v1/intent-signals/compute-scores     — trigger score recomputation (internal-ish)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, gte, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { intentSignals, intentScores } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

const signalTypeEnum = z.enum([
  'pricing_page_visit',
  'case_study_view',
  'demo_request_page',
  'comparison_page',
  'product_page_visit',
  'content_download',
  'webinar_attended',
  'bombora_surge',
  'sixsense_intent',
  'job_posting_signal',
  'tech_stack_change',
  'funding_event',
  'executive_change',
  'email_click_buying_signal',
  'chat_started',
  'trial_started',
]);

const sourceEnum = z.enum(['first_party', 'bombora', '6sense', 'clearbit', 'manual']);

const signalSchema = z.object({
  contactId: z.string().uuid().optional(),
  accountDomain: z.string().max(255).optional(),
  signalType: signalTypeEnum,
  source: sourceEnum.default('first_party'),
  score: z.number().int().min(0).max(100).default(50),
  sourceUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
  detectedAt: z.string().datetime().optional(),
});

/** Signal type weights for composite score computation */
const SIGNAL_WEIGHTS: Record<string, number> = {
  pricing_page_visit: 20,
  demo_request_page: 30,
  comparison_page: 25,
  trial_started: 35,
  chat_started: 15,
  bombora_surge: 25,
  sixsense_intent: 25,
  funding_event: 10,
  content_download: 8,
  case_study_view: 8,
  product_page_visit: 5,
  webinar_attended: 12,
  job_posting_signal: 5,
  tech_stack_change: 10,
  executive_change: 8,
  email_click_buying_signal: 18,
};

async function recomputeScore(
  orgId: string,
  contactId: string | null,
  accountDomain: string | null,
) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const conditions = [eq(intentSignals.orgId, orgId), gte(intentSignals.detectedAt, thirtyDaysAgo)];
  if (contactId) conditions.push(eq(intentSignals.contactId, contactId));
  if (accountDomain) conditions.push(eq(intentSignals.accountDomain, accountDomain));

  const rows = await db
    .select()
    .from(intentSignals)
    .where(and(...conditions));

  const breakdown: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const weight = SIGNAL_WEIGHTS[r.signalType] ?? 5;
    breakdown[r.signalType] = (breakdown[r.signalType] ?? 0) + weight;
    total += weight;
  }
  const score = Math.min(100, total);

  await db
    .insert(intentScores)
    .values({
      orgId,
      contactId: contactId ?? undefined,
      accountDomain: accountDomain ?? undefined,
      score,
      breakdown,
    })
    .onConflictDoUpdate({
      target: contactId ? intentScores.contactId : intentScores.accountDomain,
      set: { score, breakdown, updatedAt: new Date(), computedAt: new Date() },
    });
}

export default async function intentSignalRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/api/v1/intent-signals', async (req) => {
    const orgId = req.user!.orgId;
    const q = z
      .object({
        contactId: z.string().uuid().optional(),
        accountDomain: z.string().optional(),
        signalType: signalTypeEnum.optional(),
        source: sourceEnum.optional(),
        since: z.string().datetime().optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(req.query);

    const conditions = [eq(intentSignals.orgId, orgId)];
    if (q.contactId) conditions.push(eq(intentSignals.contactId, q.contactId));
    if (q.accountDomain) conditions.push(eq(intentSignals.accountDomain, q.accountDomain));
    if (q.signalType) conditions.push(eq(intentSignals.signalType, q.signalType));
    if (q.source) conditions.push(eq(intentSignals.source, q.source));
    if (q.since) conditions.push(gte(intentSignals.detectedAt, new Date(q.since)));

    const rows = await db
      .select()
      .from(intentSignals)
      .where(and(...conditions))
      .orderBy(desc(intentSignals.detectedAt))
      .limit(q.limit);

    return { data: rows, total: rows.length };
  });

  app.post('/api/v1/intent-signals', async (req, reply) => {
    const orgId = req.user!.orgId;
    const body = signalSchema.parse(req.body);

    if (!body.contactId && !body.accountDomain) {
      throw AppError.badRequest('Provide contactId or accountDomain');
    }

    const [row] = await db
      .insert(intentSignals)
      .values({
        orgId,
        contactId: body.contactId ?? null,
        accountDomain: body.accountDomain ?? null,
        signalType: body.signalType,
        source: body.source,
        score: body.score,
        sourceUrl: body.sourceUrl ?? null,
        metadata: body.metadata ?? {},
        detectedAt: body.detectedAt ? new Date(body.detectedAt) : new Date(),
      })
      .returning();

    // Async score recompute (fire-and-forget)
    recomputeScore(orgId, body.contactId ?? null, body.accountDomain ?? null).catch(() => {});

    return reply.code(201).send({ data: row });
  });

  app.post('/api/v1/intent-signals/batch', async (req, reply) => {
    const orgId = req.user!.orgId;
    const { signals } = z
      .object({ signals: z.array(signalSchema).min(1).max(500) })
      .parse(req.body);

    const rows = signals.map((s) => ({
      orgId,
      contactId: s.contactId ?? null,
      accountDomain: s.accountDomain ?? null,
      signalType: s.signalType,
      source: s.source,
      score: s.score,
      sourceUrl: s.sourceUrl ?? null,
      metadata: s.metadata ?? {},
      detectedAt: s.detectedAt ? new Date(s.detectedAt) : new Date(),
    }));

    const inserted = await db
      .insert(intentSignals)
      .values(rows)
      .returning({ id: intentSignals.id });
    return reply.code(201).send({ data: { inserted: inserted.length } });
  });

  app.get('/api/v1/intent-signals/scores', async (req) => {
    const orgId = req.user!.orgId;
    const q = z
      .object({
        minScore: z.coerce.number().int().min(0).max(100).default(0),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);

    const rows = await db
      .select()
      .from(intentScores)
      .where(and(eq(intentScores.orgId, orgId), sql`${intentScores.score} >= ${q.minScore}`))
      .orderBy(desc(intentScores.score))
      .limit(q.limit);

    return { data: rows };
  });

  app.get('/api/v1/contacts/:id/intent-score', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const orgId = req.user!.orgId;

    const [row] = await db
      .select()
      .from(intentScores)
      .where(and(eq(intentScores.orgId, orgId), eq(intentScores.contactId, id)))
      .limit(1);

    // Return 0-score if not computed yet
    return { data: row ?? { contactId: id, score: 0, breakdown: {}, computedAt: null } };
  });

  app.post('/api/v1/intent-signals/compute-scores', async (req) => {
    const orgId = req.user!.orgId;

    // Find distinct contactIds that have signals in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const distinctContacts = await db
      .selectDistinct({ contactId: intentSignals.contactId })
      .from(intentSignals)
      .where(and(eq(intentSignals.orgId, orgId), gte(intentSignals.detectedAt, thirtyDaysAgo)));

    const contactIds = distinctContacts
      .map((r) => r.contactId)
      .filter((id): id is string => id !== null);

    // Recompute in batches of 50
    let computed = 0;
    for (let i = 0; i < contactIds.length; i += 50) {
      const batch = contactIds.slice(i, i + 50);
      await Promise.all(batch.map((cid) => recomputeScore(orgId, cid, null)));
      computed += batch.length;
    }

    return { data: { computed } };
  });
}
