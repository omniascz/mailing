import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listRules,
  upsertRule,
  getFallbackLog,
} from '../../services/campaigns/channel-fallback.js';
import { channelFallbackRules } from '../../db/schema/channel-fallback.js';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { AppError } from '../../lib/app-error.js';

export default async function channelFallbackRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /** GET /api/v1/channel-fallback/rules */
  app.get('/api/v1/channel-fallback/rules', async (req) => {
    const rules = await listRules(req.user!.orgId);
    return { data: rules };
  });

  const ruleSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(100),
    primaryChannel: z.enum(['email']).default('email'),
    trigger: z.enum(['hard_bounce', 'soft_bounce', 'no_open_days', 'undelivered']),
    triggerParam: z.number().int().min(1).max(365).optional(),
    fallbackChannel: z.enum(['sms', 'whatsapp', 'push']),
    fallbackTemplateId: z.string().uuid().optional(),
    enabled: z.boolean().default(true),
  });

  /** POST /api/v1/channel-fallback/rules */
  app.post('/api/v1/channel-fallback/rules', async (req, reply) => {
    const body = ruleSchema.parse(req.body);
    const rule = await upsertRule(req.user!.orgId, body);
    return reply.status(201).send({ data: rule });
  });

  /** PUT /api/v1/channel-fallback/rules/:id */
  app.put('/api/v1/channel-fallback/rules/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = ruleSchema.parse({ ...(req.body as object), id });
    const rule = await upsertRule(req.user!.orgId, body);
    return { data: rule };
  });

  /** DELETE /api/v1/channel-fallback/rules/:id */
  app.delete('/api/v1/channel-fallback/rules/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [row] = await db.select({ id: channelFallbackRules.id }).from(channelFallbackRules)
      .where(and(eq(channelFallbackRules.id, id), eq(channelFallbackRules.orgId, req.user!.orgId)))
      .limit(1);
    if (!row) throw AppError.notFound('Rule not found');
    await db.delete(channelFallbackRules)
      .where(and(eq(channelFallbackRules.id, id), eq(channelFallbackRules.orgId, req.user!.orgId)));
    return reply.status(204).send();
  });

  /** GET /api/v1/channel-fallback/log */
  app.get('/api/v1/channel-fallback/log', async (req) => {
    const q = z.object({
      contactId: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(req.query);
    const log = await getFallbackLog(req.user!.orgId, q.contactId, q.limit);
    return { data: log };
  });
}
