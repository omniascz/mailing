import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BENCHMARKS, getBenchmark, compareToBenchmark } from '../../services/benchmarks/index.js';

const benchmarkRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/benchmarks',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Benchmarks'] },
    },
    async (_req, reply) => {
      return reply.send({ data: BENCHMARKS });
    },
  );

  app.get(
    '/api/v1/benchmarks/:industry',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Benchmarks'] },
    },
    async (req, reply) => {
      const { industry } = z.object({ industry: z.string().min(1) }).parse(req.params);
      return reply.send({ data: getBenchmark(industry) });
    },
  );

  app.post(
    '/api/v1/benchmarks/compare',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Benchmarks'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          industry: z.string(),
          stats: z.object({
            openRate: z.number(),
            clickRate: z.number(),
            bounceRate: z.number(),
            unsubRate: z.number(),
          }),
        })
        .parse(req.body);
      return reply.send({ data: compareToBenchmark(body.stats, body.industry) });
    },
  );
};

export default benchmarkRoutes;
