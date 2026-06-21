import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  extractAndSaveBrandVoice,
  listBrandVoiceProfiles,
  setActiveBrandVoice,
  deleteBrandVoiceProfile,
  getActiveBrandVoice,
} from '../../services/ai/brand-voice.js';

export default async function brandVoiceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // GET /api/v1/brand-voice — list all profiles
  app.get('/api/v1/brand-voice', async (req) => {
    return { data: await listBrandVoiceProfiles(req.user!.orgId) };
  });

  // GET /api/v1/brand-voice/active — get active profile
  app.get('/api/v1/brand-voice/active', async (req) => {
    const profile = await getActiveBrandVoice(req.user!.orgId);
    return { data: profile };
  });

  // POST /api/v1/brand-voice/analyze — extract brand voice from samples and save
  app.post('/api/v1/brand-voice/analyze', async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1).max(100).default('Default'),
        samples: z.array(z.string().min(50)).min(1).max(10),
      })
      .parse(req.body);
    const profile = await extractAndSaveBrandVoice(req.user!.orgId, body.name, body.samples);
    return reply.status(201).send({ data: profile });
  });

  // POST /api/v1/brand-voice/:id/activate — set this as the active profile
  app.post('/api/v1/brand-voice/:id/activate', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await setActiveBrandVoice(req.user!.orgId, id);
    return reply.status(204).send();
  });

  // DELETE /api/v1/brand-voice/:id
  app.delete('/api/v1/brand-voice/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await deleteBrandVoiceProfile(req.user!.orgId, id);
    return reply.status(204).send();
  });
}
