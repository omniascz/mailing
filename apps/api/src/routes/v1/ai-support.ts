/**
 * Aura Support Agent routes (#248)
 *
 *  POST /api/v1/ai-support/summarize         — summarize ticket conversation
 *  POST /api/v1/ai-support/tone-adjust       — rewrite message in desired tone
 *  POST /api/v1/ai-support/note-to-message   — convert agent note → customer reply
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { summarizeConversation } from '../../services/ai-support/summarize.js';
import { adjustTone } from '../../services/ai-support/tone-adjust.js';
import { noteToMessage } from '../../services/ai-support/note-to-message.js';

const aiSupportRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/ai-support/summarize', {
    preHandler: [app.authenticate],
    schema: { tags: ['AI Support'] },
  }, async (req, reply) => {
    const { ticketId } = z.object({ ticketId: z.string().uuid() }).parse(req.body);
    const result = await summarizeConversation(req.user!.orgId, ticketId);
    return reply.send({ data: result });
  });

  app.post('/api/v1/ai-support/tone-adjust', {
    preHandler: [app.authenticate],
    schema: { tags: ['AI Support'] },
  }, async (req, reply) => {
    const body = z.object({
      text: z.string().min(1).max(4000),
      tone: z.enum(['formal', 'friendly', 'empathetic', 'concise', 'professional']),
    }).parse(req.body);
    const result = await adjustTone(req.user!.orgId, body.text, body.tone);
    return reply.send({ data: result });
  });

  app.post('/api/v1/ai-support/note-to-message', {
    preHandler: [app.authenticate],
    schema: { tags: ['AI Support'] },
  }, async (req, reply) => {
    const body = z.object({
      note: z.string().min(1).max(2000),
      ticketSubject: z.string().max(512).optional(),
      tone: z.string().max(64).optional(),
    }).parse(req.body);
    const result = await noteToMessage(req.user!.orgId, body.note, {
      ticketSubject: body.ticketSubject,
      tone: body.tone,
    });
    return reply.send({ data: result });
  });
};

export default aiSupportRoutes;
