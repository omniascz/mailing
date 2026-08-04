import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { redis } from '@forgemsg/shared/redis';

interface DepStatus {
  status: 'ok' | 'fail';
  latencyMs?: number;
  error?: string;
}

async function pingDb(): Promise<DepStatus> {
  const start = Date.now();
  try {
    await db.execute(sql`select 1`);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'fail', error: (err as Error).message };
  }
}

async function pingRedis(): Promise<DepStatus> {
  const start = Date.now();
  try {
    const pong = await redis.ping();
    return pong === 'PONG'
      ? { status: 'ok', latencyMs: Date.now() - start }
      : { status: 'fail', error: `unexpected reply: ${pong}` };
  } catch (err) {
    return { status: 'fail', error: (err as Error).message };
  }
}

export default async function healthRoutes(app: FastifyInstance) {
  /**
   * GET /health
   * Liveness — process is up and responding. Cheap, doesn't touch any
   * external system. Use this for orchestrator restart loops + Vercel
   * standalone health probe.
   */
  app.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Liveness probe',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
              uptime: { type: 'number' },
            },
          },
        },
      },
    },
    async () => ({
      status: 'ok',
      service: 'forgemsg-api',
      uptime: process.uptime(),
    }),
  );

  /**
   * GET /health/ready
   * Readiness — process is up AND can reach its dependencies. Use this
   * for Better Stack uptime checks and as the gate before routing live
   * traffic post-deploy. 503 if any critical dep is down so load
   * balancers can drain instances mid-incident.
   *
   * Note: we deliberately don't surface error strings on a 503 response
   * to prevent connection-string leaks via probe scraping; the API logs
   * the underlying error with full context. The detail payload is
   * sanitized to status + latency only.
   */
  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['System'],
        summary: 'Readiness probe (DB + Redis ping)',
      },
    },
    async (req, reply) => {
      const [database, cache] = await Promise.all([pingDb(), pingRedis()]);
      const allOk = database.status === 'ok' && cache.status === 'ok';
      if (!allOk) {
        req.log.warn({ database, cache }, 'Readiness probe failed');
      }
      return reply.status(allOk ? 200 : 503).send({
        status: allOk ? 'ok' : 'degraded',
        service: 'forgemsg-api',
        uptime: process.uptime(),
        checks: {
          database: { status: database.status, latencyMs: database.latencyMs },
          cache: { status: cache.status, latencyMs: cache.latencyMs },
        },
      });
    },
  );
}
