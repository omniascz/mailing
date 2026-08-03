import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getContactEmailThread,
  getContactEngagementSummary,
} from '../../services/contacts/email-thread.js';

export default async function emailThreadRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /** GET /api/v1/contacts/:contactId/email-thread */
  app.get('/api/v1/contacts/:contactId/email-thread', async (req) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
      .parse(req.query);

    const result = await getContactEmailThread(req.user!.orgId, contactId, q.limit, q.cursor);
    return { data: result.messages, nextCursor: result.nextCursor };
  });

  /** GET /api/v1/contacts/:contactId/engagement-summary */
  app.get('/api/v1/contacts/:contactId/engagement-summary', async (req) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    const summary = await getContactEngagementSummary(req.user!.orgId, contactId);
    return { data: summary };
  });
}
