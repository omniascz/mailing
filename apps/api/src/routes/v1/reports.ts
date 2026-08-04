/**
 * Custom report builder routes.
 *
 *  GET    /api/v1/reports/metrics          — available metrics + dimensions (for UI)
 *  GET    /api/v1/reports                   — list saved reports
 *  POST   /api/v1/reports                   — create a saved report
 *  GET    /api/v1/reports/:id               — retrieve
 *  PATCH  /api/v1/reports/:id               — update
 *  DELETE /api/v1/reports/:id               — delete
 *  GET    /api/v1/reports/:id/run           — run a saved report (query: from,to,campaignId)
 *  POST   /api/v1/reports/run               — run an ad-hoc definition
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listReports,
  getReport,
  createReport,
  updateReport,
  deleteReport,
  runReport,
  runSavedReport,
  REPORT_METRICS,
  REPORT_DIMENSIONS,
} from '../../services/report-builder/index.js';

const metricEnum = z.enum(REPORT_METRICS as [string, ...string[]]);
const dimensionEnum = z.enum(REPORT_DIMENSIONS as [string, ...string[]]);

const definitionSchema = z.object({
  metrics: z.array(metricEnum).min(1).max(REPORT_METRICS.length),
  dimension: dimensionEnum,
  campaignId: z.string().uuid().optional(),
  rangeDays: z.number().int().min(1).max(730).optional(),
});

const runOptsSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  campaignId: z.string().uuid().optional(),
});

const reportRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/reports/metrics',
    { preHandler: [app.authenticate], schema: { tags: ['Reports'] } },
    async (_req, reply) => {
      return reply.send({ data: { metrics: REPORT_METRICS, dimensions: REPORT_DIMENSIONS } });
    },
  );

  app.get(
    '/api/v1/reports',
    { preHandler: [app.authenticate], schema: { tags: ['Reports'] } },
    async (req, reply) => {
      return reply.send({ data: await listReports(req.user!.orgId) });
    },
  );

  app.post(
    '/api/v1/reports',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Reports'] },
    },
    async (req, reply) => {
      const body = z
        .object({ name: z.string().min(1).max(255), definition: definitionSchema })
        .parse(req.body);
      return reply.code(201).send({
        data: await createReport(
          req.user!.orgId,
          body.name,
          body.definition as Parameters<typeof createReport>[2],
        ),
      });
    },
  );

  // Ad-hoc run — no saved definition needed.
  app.post(
    '/api/v1/reports/run',
    { preHandler: [app.authenticate], schema: { tags: ['Reports'] } },
    async (req, reply) => {
      const body = z
        .object({
          definition: definitionSchema,
          from: z.coerce.date().optional(),
          to: z.coerce.date().optional(),
          campaignId: z.string().uuid().optional(),
        })
        .parse(req.body);
      const data = await runReport(
        req.user!.orgId,
        body.definition as Parameters<typeof runReport>[1],
        { from: body.from, to: body.to, campaignId: body.campaignId },
      );
      return reply.send({ data });
    },
  );

  app.get(
    '/api/v1/reports/:id',
    { preHandler: [app.authenticate], schema: { tags: ['Reports'] } },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getReport(req.user!.orgId, id) });
    },
  );

  app.patch(
    '/api/v1/reports/:id',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Reports'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          name: z.string().min(1).max(255).optional(),
          definition: definitionSchema.optional(),
        })
        .parse(req.body);
      return reply.send({
        data: await updateReport(req.user!.orgId, id, body as Parameters<typeof updateReport>[2]),
      });
    },
  );

  app.delete(
    '/api/v1/reports/:id',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Reports'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteReport(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  app.get(
    '/api/v1/reports/:id/run',
    { preHandler: [app.authenticate], schema: { tags: ['Reports'] } },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const opts = runOptsSchema.parse(req.query);
      return reply.send({ data: await runSavedReport(req.user!.orgId, id, opts) });
    },
  );
};

export default reportRoutes;
