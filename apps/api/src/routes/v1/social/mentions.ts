import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  addMonitoringKeyword, listMonitoringKeywords, removeMonitoringKeyword,
  listMentions, updateMentionStatus,
} from '../../../services/social/monitoring.js';
import { bridgeMentionToInbox } from '../../../services/social/inbox-bridge.js';

const socialMentionRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };

  // ── Mentions ──────────────────────────────────────────────────────────────
  app.get('/api/v1/social/mentions', auth, async (req, reply) => {
    const q = z.object({
      status: z.string().optional(),
      platform: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);
    const data = await listMentions(req.user!.orgId, q);
    return reply.send({ data });
  });

  app.patch('/api/v1/social/mentions/:mentionId', auth, async (req, reply) => {
    const { mentionId } = z.object({ mentionId: z.string().uuid() }).parse(req.params);
    const { status } = z.object({ status: z.enum(['new', 'read', 'replied', 'ignored']) }).parse(req.body);
    const data = await updateMentionStatus(req.user!.orgId, mentionId, status);
    return reply.send({ data });
  });

  // Route mention to Universal Inbox (creates a helpdesk ticket)
  app.post('/api/v1/social/mentions/:mentionId/to-inbox', auth, async (req, reply) => {
    const { mentionId } = z.object({ mentionId: z.string().uuid() }).parse(req.params);
    const { eq, and } = await import('drizzle-orm');
    const { db } = await import('../../../db/client.js');
    const { socialMentions } = await import('../../../db/schema/index.js');
    const [mention] = await db.select().from(socialMentions).where(and(eq(socialMentions.orgId, req.user!.orgId), eq(socialMentions.id, mentionId)));
    if (!mention) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Mention not found' });
    const result = await bridgeMentionToInbox(req.user!.orgId, { ...mention, rawData: mention.rawData as Record<string, unknown> });
    return reply.send({ data: result });
  });

  // ── Monitoring keywords ───────────────────────────────────────────────────
  app.get('/api/v1/social/monitoring/keywords', auth, async (req, reply) => {
    const data = await listMonitoringKeywords(req.user!.orgId);
    return reply.send({ data });
  });

  app.post('/api/v1/social/monitoring/keywords', auth, async (req, reply) => {
    const body = z.object({
      keyword: z.string().min(1).max(255),
      platforms: z.array(z.string()).default([]),
    }).parse(req.body);
    const data = await addMonitoringKeyword(req.user!.orgId, body.keyword, body.platforms);
    return reply.code(201).send({ data });
  });

  app.delete('/api/v1/social/monitoring/keywords/:keywordId', auth, async (req, reply) => {
    const { keywordId } = z.object({ keywordId: z.string().uuid() }).parse(req.params);
    await removeMonitoringKeyword(req.user!.orgId, keywordId);
    return reply.code(204).send();
  });
};

export default socialMentionRoutes;
