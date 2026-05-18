import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listRules, upsertRule, deleteRule } from '../../services/frequency-capping/index.js';

const channelSchema = z.enum(['email', 'sms', 'push', 'whatsapp', 'voice', 'all']);

const upsertSchema = z.object({
  channel: channelSchema,
  maxCount: z.number().int().positive(),
  periodHours: z.number().int().positive().max(24 * 365),
});

export default async function frequencyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireRole('admin', 'owner'));

  app.get(
    '/api/v1/frequency-rules',
    { schema: { tags: ['Frequency'], summary: 'List org frequency rules' } },
    async (req) => ({ data: await listRules(req.user!.orgId) }),
  );

  app.put(
    '/api/v1/frequency-rules',
    { schema: { tags: ['Frequency'], summary: 'Upsert a frequency rule' } },
    async (req) => {
      const body = upsertSchema.parse(req.body);
      return { data: await upsertRule(req.user!.orgId, body) };
    },
  );

  app.delete(
    '/api/v1/frequency-rules/:channel',
    { schema: { tags: ['Frequency'], summary: 'Delete a frequency rule' } },
    async (req, reply) => {
      const { channel } = z.object({ channel: channelSchema }).parse(req.params);
      await deleteRule(req.user!.orgId, channel);
      return reply.code(204).send();
    },
  );
}
