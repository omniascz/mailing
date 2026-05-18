/**
 * AI analytics routes (#269, #270).
 *
 *   POST /api/v1/ai-analytics/ask       — NL question → query plan + result
 *   POST /api/v1/ai-analytics/plan      — NL question → query plan only (dry-run)
 *   POST /api/v1/ai-analytics/execute   — execute a supplied SQL via the sandbox
 *   GET  /api/v1/ai-analytics/schema    — whitelisted table/column surface
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ask, plan } from '../../services/ai-analytics/nl-query.js';
import {
  executeSandboxedQuery,
  injectOrgFilter,
  listSchema,
  ALLOWED_TABLES,
} from '../../services/ai-analytics/sandbox.js';
import { AppError } from '../../lib/app-error.js';

const AskSchema = z.object({
  question: z.string().min(3).max(1000),
  previousSummary: z.string().max(500).optional(),
  timeoutMs: z.number().int().min(100).max(30_000).optional(),
  maxRows: z.number().int().min(1).max(10_000).optional(),
});

const aiAnalyticsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/ai-analytics/schema', {
    preHandler: [app.authenticate],
    schema: { tags: ['AI Analytics'] },
  }, async (_req, reply) => {
    return reply.send({ data: listSchema() });
  });

  app.post('/api/v1/ai-analytics/ask', {
    preHandler: [app.authenticate],
    schema: { tags: ['AI Analytics'] },
  }, async (req, reply) => {
    const body = AskSchema.parse(req.body);
    const result = await ask(req.user!.orgId, body);
    return reply.send({ data: result });
  });

  app.post('/api/v1/ai-analytics/plan', {
    preHandler: [app.authenticate],
    schema: { tags: ['AI Analytics'] },
  }, async (req, reply) => {
    const body = AskSchema.parse(req.body);
    const result = await plan(req.user!.orgId, body);
    return reply.send({ data: result });
  });

  app.post('/api/v1/ai-analytics/execute', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner', 'editor')],
    schema: { tags: ['AI Analytics'] },
  }, async (req, reply) => {
    const body = z.object({
      sql: z.string().min(10).max(10_000),
      primaryTable: z.string().min(1).max(64),
      timeoutMs: z.number().int().min(100).max(30_000).optional(),
      maxRows: z.number().int().min(1).max(10_000).optional(),
    }).parse(req.body);
    if (!ALLOWED_TABLES[body.primaryTable]) {
      throw AppError.badRequest(`Unknown primary table: ${body.primaryTable}`);
    }
    const wrapped = injectOrgFilter(body.sql, body.primaryTable, req.user!.orgId);
    const result = await executeSandboxedQuery(req.user!.orgId, wrapped, {
      timeoutMs: body.timeoutMs,
      maxRows: body.maxRows,
    });
    return reply.send({ data: result });
  });
};

export default aiAnalyticsRoutes;
