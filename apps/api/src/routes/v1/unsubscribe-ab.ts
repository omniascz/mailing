import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  unsubscribeExperiments,
  unsubscribeVariants,
} from '../../db/schema/unsubscribe-experiments.js';
import {
  assignVariant,
  recordImpression,
  recordOutcome,
  analyzeExperiment,
  declareWinner,
} from '../../services/contacts/unsubscribe-ab.js';
import { AppError } from '../../lib/app-error.js';

export default async function unsubscribeAbRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /** GET /api/v1/unsubscribe-experiments */
  app.get('/api/v1/unsubscribe-experiments', async (req) => {
    const rows = await db
      .select()
      .from(unsubscribeExperiments)
      .where(eq(unsubscribeExperiments.orgId, req.user!.orgId));
    return { data: rows };
  });

  const expSchema = z.object({
    name: z.string().min(1).max(100),
    status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
  });

  /** POST /api/v1/unsubscribe-experiments */
  app.post('/api/v1/unsubscribe-experiments', async (req, reply) => {
    const body = expSchema.parse(req.body);
    const [row] = await db
      .insert(unsubscribeExperiments)
      .values({ orgId: req.user!.orgId, name: body.name })
      .returning();
    return reply.status(201).send({ data: row });
  });

  /** PUT /api/v1/unsubscribe-experiments/:id */
  app.put('/api/v1/unsubscribe-experiments/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = expSchema.parse(req.body);
    const [row] = await db
      .update(unsubscribeExperiments)
      .set({ ...body, updatedAt: new Date() })
      .where(
        and(eq(unsubscribeExperiments.id, id), eq(unsubscribeExperiments.orgId, req.user!.orgId)),
      )
      .returning();
    return { data: row };
  });

  const variantFlows = z.enum([
    'immediate_unsub',
    'offer_pause',
    'offer_downgrade',
    'offer_preferences',
    'offer_reason',
  ]);

  /** POST /api/v1/unsubscribe-experiments/:id/variants */
  app.post('/api/v1/unsubscribe-experiments/:experimentId/variants', async (req, reply) => {
    const { experimentId } = z.object({ experimentId: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).max(100),
        flow: variantFlows,
        headline: z.string().max(200).optional(),
        bodyText: z.string().max(1000).optional(),
        ctaLabel: z.string().max(50).optional(),
        pauseDays: z.number().int().min(1).max(365).optional(),
        trafficWeight: z.number().min(0.05).max(1).default(0.5),
        isControl: z.boolean().default(false),
      })
      .parse(req.body);

    const [row] = await db
      .insert(unsubscribeVariants)
      .values({ orgId: req.user!.orgId, experimentId, ...body })
      .returning();
    return reply.status(201).send({ data: row });
  });

  /** GET /api/v1/unsubscribe-experiments/:id/variants */
  app.get('/api/v1/unsubscribe-experiments/:id/variants', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const rows = await db
      .select()
      .from(unsubscribeVariants)
      .where(
        and(
          eq(unsubscribeVariants.experimentId, id),
          eq(unsubscribeVariants.orgId, req.user!.orgId),
        ),
      );
    return { data: rows };
  });

  /** GET /api/v1/unsubscribe-experiments/assign — assign variant for a contact */
  app.get('/api/v1/unsubscribe-experiments/assign', async (req) => {
    const q = z.object({ contactId: z.string().uuid() }).parse(req.query);
    const variant = await assignVariant(req.user!.orgId, q.contactId);
    return { data: variant };
  });

  /** POST /api/v1/unsubscribe-experiments/variants/:variantId/impression */
  app.post('/api/v1/unsubscribe-experiments/variants/:variantId/impression', async (req) => {
    const { variantId } = z.object({ variantId: z.string().uuid() }).parse(req.params);
    await recordImpression(variantId);
    return { ok: true };
  });

  /** POST /api/v1/unsubscribe-experiments/variants/:variantId/outcome */
  app.post('/api/v1/unsubscribe-experiments/variants/:variantId/outcome', async (req) => {
    const { variantId } = z.object({ variantId: z.string().uuid() }).parse(req.params);
    const body = z.object({ saved: z.boolean() }).parse(req.body);
    await recordOutcome(variantId, body.saved);
    return { ok: true };
  });

  /** GET /api/v1/unsubscribe-experiments/:id/analysis */
  app.get('/api/v1/unsubscribe-experiments/:id/analysis', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const analysis = await analyzeExperiment(req.user!.orgId, id);
    return { data: analysis };
  });

  /** POST /api/v1/unsubscribe-experiments/:id/declare-winner */
  app.post('/api/v1/unsubscribe-experiments/:id/declare-winner', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ winnerVariantId: z.string().uuid() }).parse(req.body);
    const exp = await declareWinner(req.user!.orgId, id, body.winnerVariantId);
    if (!exp) throw AppError.notFound('Experiment not found');
    return { data: exp };
  });
}
