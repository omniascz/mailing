/**
 * AI Agents routes
 *
 *  POST /api/v1/ai-agents/build-campaign — one-shot campaign builder
 *  GET  /api/v1/ai-agents               — list agents
 *  POST /api/v1/ai-agents               — create agent
 *  POST /api/v1/ai-agents/:id/run       — trigger agent run
 *  GET  /api/v1/ai-agents/:id/runs      — list runs for agent
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { aiAgents, aiAgentRuns } from '../../db/schema/index.js';
import {
  buildCampaign,
  type CampaignBuildInput,
} from '../../services/ai-agents/campaign-builder.js';
import { runAgent } from '../../services/ai-agents/runner.js';
import {
  analyzeLossPatterns,
  scoreOpenDeals,
  getStageVelocity,
} from '../../services/ai-agents/deal-health.js';
import {
  findProspects,
  researchAccount,
  draftOutreach,
  type Icp,
  type OutreachDraftInput,
} from '../../services/ai-agents/prospecting.js';
import { runSupportAgent, persistAgentDraft } from '../../services/ai-agents/customer-support.js';
import { generateContent, type ContentAgentInput } from '../../services/ai-agents/content.js';
import { AppError } from '../../lib/app-error.js';

const buildCampaignBodySchema = z.object({
  goal: z.string().min(10).max(500),
  audienceDescription: z.string().min(5).max(500),
  brandVoice: z.string().max(200).optional(),
  productContext: z.string().max(500).optional(),
  channelPreference: z.enum(['email', 'sms', 'whatsapp', 'viber']).optional(),
  language: z.string().max(5).optional(),
});

const createAgentBodySchema = z.object({
  name: z.string().min(1).max(255),
  agentType: z.string().min(1).max(50),
  goal: z.string().min(1),
  description: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  schedule: z.string().max(100).optional(),
});

export default async function aiAgentRoutes(app: FastifyInstance) {
  // POST /api/v1/ai-agents/build-campaign — one-shot campaign builder (no agent record)
  app.post(
    '/api/v1/ai-agents/build-campaign',
    {
      schema: { tags: ['AI Agents'] },
    },
    async (request, reply) => {
      const { orgId } = request as unknown as { orgId: string };
      const body = buildCampaignBodySchema.parse(request.body);
      const result = await buildCampaign(orgId, body as CampaignBuildInput);
      return reply.send({ data: result });
    },
  );

  // GET /api/v1/ai-agents — list agents
  app.get(
    '/api/v1/ai-agents',
    {
      schema: { tags: ['AI Agents'] },
    },
    async (request, reply) => {
      const { orgId } = request as unknown as { orgId: string };
      const agents = await db
        .select()
        .from(aiAgents)
        .where(eq(aiAgents.orgId, orgId))
        .orderBy(desc(aiAgents.createdAt));
      return reply.send({ data: agents });
    },
  );

  // POST /api/v1/ai-agents — create agent
  app.post(
    '/api/v1/ai-agents',
    {
      schema: { tags: ['AI Agents'] },
    },
    async (request, reply) => {
      const { orgId } = request as unknown as { orgId: string };
      const body = createAgentBodySchema.parse(request.body);
      const [agent] = await db
        .insert(aiAgents)
        .values({
          ...body,
          orgId,
          config: body.config ?? {},
        })
        .returning();
      return reply.code(201).send({ data: agent });
    },
  );

  // POST /api/v1/ai-agents/:id/run — trigger agent run
  app.post(
    '/api/v1/ai-agents/:id/run',
    {
      schema: { tags: ['AI Agents'] },
    },
    async (request, reply) => {
      const { orgId } = request as unknown as { orgId: string };
      const { id } = request.params as { id: string };
      const body = request.body as { context?: Record<string, unknown> } | undefined;

      const result = await runAgent({ agentId: id, orgId, context: body?.context });
      if (result.status === 'failed') {
        throw new AppError({
          code: 'AGENT_RUN_FAILED',
          message: result.error ?? 'Agent run failed',
          statusCode: 500,
        });
      }
      return reply.send({ data: result });
    },
  );

  // GET /api/v1/ai-agents/deal-health/loss-analysis — Deal Health agent (#332)
  app.get(
    '/api/v1/ai-agents/deal-health/loss-analysis',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['AI Agents'] },
    },
    async (request, reply) => {
      const { orgId } = request.user!;
      const q = z
        .object({
          windowDays: z.coerce.number().int().min(30).max(720).optional(),
          force: z.coerce.boolean().optional(),
        })
        .parse(request.query);
      return reply.send({ data: await analyzeLossPatterns(orgId, q) });
    },
  );

  app.get(
    '/api/v1/ai-agents/deal-health/scores',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['AI Agents'] },
    },
    async (request, reply) => {
      const { orgId } = request.user!;
      const q = z
        .object({
          limit: z.coerce.number().int().min(1).max(2000).optional(),
          notifyOnRisk: z.coerce.boolean().optional(),
        })
        .parse(request.query);
      return reply.send({ data: await scoreOpenDeals(orgId, q) });
    },
  );

  // ─── Prospecting Agent (#329) ─────────────────────────────────────────────
  app.post(
    '/api/v1/ai-agents/prospecting/find',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['AI Agents'] },
    },
    async (request, reply) => {
      const { orgId } = request.user!;
      const body = z
        .object({
          icp: z.object({
            industries: z.array(z.string().max(100)).max(20).optional(),
            minRevenue: z.number().nonnegative().optional(),
            maxRevenue: z.number().nonnegative().optional(),
            minEmployees: z.number().int().nonnegative().optional(),
            maxEmployees: z.number().int().nonnegative().optional(),
            countries: z.array(z.string().length(2)).max(50).optional(),
            descriptor: z.string().max(500).optional(),
          }),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .parse(request.body);
      const matches = await findProspects(orgId, body.icp as Icp, { limit: body.limit });
      return reply.send({ data: matches });
    },
  );

  app.get(
    '/api/v1/ai-agents/prospecting/accounts/:id/research',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['AI Agents'] },
    },
    async (request, reply) => {
      const { orgId } = request.user!;
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const q = z.object({ force: z.coerce.boolean().optional() }).parse(request.query);
      return reply.send({ data: await researchAccount(orgId, id, q) });
    },
  );

  app.post(
    '/api/v1/ai-agents/prospecting/contacts/:id/outreach',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['AI Agents'] },
    },
    async (request, reply) => {
      const { orgId } = request.user!;
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = z
        .object({
          channel: z.enum(['email', 'sms', 'linkedin']),
          tone: z.enum(['casual', 'professional', 'direct']).optional(),
          language: z.string().min(2).max(8).optional(),
          goal: z.string().max(500).optional(),
          valueProp: z.string().max(500).optional(),
          callToAction: z.string().max(200).optional(),
        })
        .parse(request.body);
      return reply.send({ data: await draftOutreach(orgId, id, body as OutreachDraftInput) });
    },
  );

  // ─── Content Agent (#331) ─────────────────────────────────────────────────
  app.post(
    '/api/v1/ai-agents/content/generate',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['AI Agents'] },
    },
    async (request, reply) => {
      const { orgId } = request.user!;
      const body = z
        .object({
          format: z.enum(['blog', 'landing', 'email', 'podcast_script']),
          topic: z.string().min(3).max(500),
          goal: z.string().max(500).optional(),
          brandVoice: z.string().max(500).optional(),
          audience: z.string().max(300).optional(),
          product: z
            .object({
              name: z.string().max(200).optional(),
              description: z.string().max(1000).optional(),
              features: z.array(z.string().max(200)).max(30).optional(),
              price: z.string().max(50).optional(),
              url: z.string().url().max(500).optional(),
            })
            .optional(),
          keywords: z.array(z.string().max(80)).max(30).optional(),
          language: z.string().min(2).max(8).optional(),
          tone: z.string().max(80).optional(),
          length: z.enum(['short', 'medium', 'long']).optional(),
          callToAction: z.string().max(200).optional(),
        })
        .parse(request.body);
      return reply.send({ data: await generateContent(orgId, body as ContentAgentInput) });
    },
  );

  // ─── Customer Support Agent (#330) ────────────────────────────────────────
  app.post(
    '/api/v1/ai-agents/support/tickets/:id/run',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['AI Agents'] },
    },
    async (request, reply) => {
      const { orgId } = request.user!;
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = z
        .object({
          autoReplyThreshold: z.number().min(0).max(1).optional(),
          draftThreshold: z.number().min(0).max(1).optional(),
          topK: z.number().int().min(1).max(20).optional(),
          language: z.string().min(2).max(8).optional(),
          persistDraft: z.boolean().optional(),
        })
        .parse(request.body ?? {});

      const result = await runSupportAgent(orgId, id, body);
      if (body.persistDraft && result.outcome === 'suggest_draft') {
        await persistAgentDraft(id, result);
      }
      return reply.send({ data: result });
    },
  );

  app.get(
    '/api/v1/ai-agents/deal-health/stage-velocity',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['AI Agents'] },
    },
    async (request, reply) => {
      const { orgId } = request.user!;
      const { pipelineId } = z.object({ pipelineId: z.string().uuid() }).parse(request.query);
      return reply.send({ data: await getStageVelocity(orgId, pipelineId) });
    },
  );

  // GET /api/v1/ai-agents/:id — get single agent
  app.get(
    '/api/v1/ai-agents/:id',
    {
      schema: { tags: ['AI Agents'] },
    },
    async (request, reply) => {
      const { orgId } = request as unknown as { orgId: string };
      const { id } = request.params as { id: string };
      const [agent] = await db
        .select()
        .from(aiAgents)
        .where(and(eq(aiAgents.id, id), eq(aiAgents.orgId, orgId)))
        .limit(1);
      if (!agent) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Agent not found', statusCode: 404 });
      }
      return reply.send({ data: agent });
    },
  );

  // GET /api/v1/ai-agents/:id/runs — list runs for agent
  app.get(
    '/api/v1/ai-agents/:id/runs',
    {
      schema: { tags: ['AI Agents'] },
    },
    async (request, reply) => {
      const { orgId } = request as unknown as { orgId: string };
      const { id } = request.params as { id: string };
      const runs = await db
        .select()
        .from(aiAgentRuns)
        .where(and(eq(aiAgentRuns.agentId, id), eq(aiAgentRuns.orgId, orgId)))
        .orderBy(desc(aiAgentRuns.createdAt))
        .limit(50);
      return reply.send({ data: runs });
    },
  );
}
