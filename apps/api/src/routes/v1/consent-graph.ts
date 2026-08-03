import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { consentEvents } from '../../db/schema/consent-graph.js';

export default async function consentGraphRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /** Full consent timeline for one contact — GDPR proof-of-consent export. */
  app.get('/api/v1/consent-graph/:contactId', async (req) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    const rows = await db
      .select()
      .from(consentEvents)
      .where(and(eq(consentEvents.orgId, req.user!.orgId), eq(consentEvents.contactId, contactId)))
      .orderBy(desc(consentEvents.occurredAt));
    return { data: rows };
  });

  /** Record a consent event manually or from integration. */
  const eventSchema = z.object({
    contactId: z.string().uuid(),
    eventType: z.enum([
      'opt_in',
      'double_opt_in',
      'opt_out',
      'preference_update',
      'purpose_added',
      'purpose_removed',
      'consent_withdrawn',
      'data_export',
      're_consent',
    ]),
    legalBasis: z
      .enum(['consent', 'legitimate_interest', 'contract', 'legal_obligation'])
      .default('consent'),
    channel: z.string().optional(),
    purposeCode: z.string().optional(),
    consentVersion: z.string().optional(),
    source: z.string().default('api'),
    sourceUrl: z.string().url().optional(),
    proofPayload: z.record(z.unknown()).optional(),
  });

  app.post('/api/v1/consent-graph/events', async (req, reply) => {
    const body = eventSchema.parse(req.body);
    const [row] = await db
      .insert(consentEvents)
      .values({
        orgId: req.user!.orgId,
        ...body,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  /** Batch record consent events (e.g. bulk import). */
  app.post('/api/v1/consent-graph/events/batch', async (req) => {
    const body = z.object({ events: z.array(eventSchema).min(1).max(1000) }).parse(req.body);
    const orgId = req.user!.orgId;
    await db.insert(consentEvents).values(body.events.map((e) => ({ orgId, ...e })));
    return { data: { inserted: body.events.length } };
  });

  /** GDPR Art. 17 — full consent audit for an org (DPA export). */
  app.get('/api/v1/consent-graph/audit', async (req) => {
    const q = z
      .object({
        dateFrom: z.string().datetime().optional(),
        eventType: z.string().optional(),
        purposeCode: z.string().optional(),
      })
      .parse(req.query);

    const conds = [eq(consentEvents.orgId, req.user!.orgId)];
    if (q.dateFrom) conds.push(gte(consentEvents.occurredAt, new Date(q.dateFrom)));
    if (q.eventType)
      conds.push(
        eq(
          consentEvents.eventType,
          q.eventType as (typeof consentEvents.$inferSelect)['eventType'],
        ),
      );
    if (q.purposeCode) conds.push(eq(consentEvents.purposeCode, q.purposeCode));

    const rows = await db
      .select()
      .from(consentEvents)
      .where(and(...conds))
      .orderBy(desc(consentEvents.occurredAt))
      .limit(5000);

    return { data: rows, total: rows.length };
  });

  /** Summary: current consent status for a contact. */
  app.get('/api/v1/consent-graph/:contactId/summary', async (req) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    const rows = await db
      .select()
      .from(consentEvents)
      .where(and(eq(consentEvents.orgId, req.user!.orgId), eq(consentEvents.contactId, contactId)))
      .orderBy(desc(consentEvents.occurredAt));

    const latestByChannel: Record<string, (typeof rows)[number]> = {};
    for (const row of rows) {
      const key = row.channel ?? '__all__';
      if (!latestByChannel[key]) latestByChannel[key] = row;
    }

    const hasActiveConsent = Object.values(latestByChannel).some(
      (e) =>
        e.eventType === 'opt_in' || e.eventType === 'double_opt_in' || e.eventType === 're_consent',
    );

    return {
      data: {
        contactId,
        hasActiveConsent,
        latestEventPerChannel: latestByChannel,
        totalEvents: rows.length,
        firstConsentAt: rows[rows.length - 1]?.occurredAt ?? null,
        lastEventAt: rows[0]?.occurredAt ?? null,
      },
    };
  });
}
