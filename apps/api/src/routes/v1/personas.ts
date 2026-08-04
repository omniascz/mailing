import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  inferPersona,
  upsertPersona,
  getPersona,
  listPersonaSegment,
} from '../../services/ai/persona-inference.js';

export default async function personasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/api/v1/personas/segments', async (req) => {
    const q = z
      .object({ persona: z.string(), limit: z.coerce.number().int().min(1).max(500).default(100) })
      .parse(req.query);
    const rows = await listPersonaSegment(req.user!.orgId, q.persona, q.limit);
    return { data: rows };
  });

  app.get('/api/v1/personas/:contactId', async (req) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    const row = await getPersona(req.user!.orgId, contactId);
    return { data: row };
  });

  app.post('/api/v1/personas/:contactId/infer', async (req) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    const body = z
      .object({ useAi: z.boolean().default(true) })
      .optional()
      .parse(req.body);
    const result = await inferPersona(req.user!.orgId, contactId, body?.useAi ?? true);
    await upsertPersona(req.user!.orgId, contactId);
    return { data: result };
  });

  app.post('/api/v1/personas/batch-infer', async (req) => {
    const body = z.object({ contactIds: z.array(z.string().uuid()).max(100) }).parse(req.body);
    const results = await Promise.allSettled(
      body.contactIds.map((id) => upsertPersona(req.user!.orgId, id)),
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    return { data: { succeeded, failed: body.contactIds.length - succeeded } };
  });
}
