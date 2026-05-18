import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { researchKeywords, listKeywords, getSuggestedKeywords } from '../../../services/seo/keyword-research.js';

const seoKeywordsRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };

  app.get('/api/v1/seo/keywords', auth, async (req, reply) => {
    const q = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(req.query);
    const data = await listKeywords(req.user!.orgId, q);
    return reply.send({ data });
  });

  app.post('/api/v1/seo/keywords/research', auth, async (req, reply) => {
    const body = z.object({
      keywords: z.array(z.string().min(1).max(500)).min(1).max(100),
      language: z.string().max(8).default('en'),
      country: z.string().max(4).default('US'),
      enrichWithAi: z.boolean().default(true),
    }).parse(req.body);
    const data = await researchKeywords(req.user!.orgId, body);
    return reply.send({ data });
  });

  app.post('/api/v1/seo/keywords/suggestions', auth, async (req, reply) => {
    const body = z.object({
      seedKeyword: z.string().min(1).max(500),
      language: z.string().max(8).default('en'),
      country: z.string().max(4).default('US'),
    }).parse(req.body);
    const data = await getSuggestedKeywords(req.user!.orgId, body.seedKeyword, body.language, body.country);
    return reply.send({ data });
  });
};

export default seoKeywordsRoutes;
