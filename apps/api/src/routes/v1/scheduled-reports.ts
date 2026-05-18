import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createScheduledReport, listScheduledReports,
  deleteScheduledReport, runDueReports,
} from '../../services/scheduled-reports/index.js';

const scheduledReportRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/scheduled-reports', {
    preHandler: [app.authenticate],
    schema: { tags: ['ScheduledReports'] },
  }, async (req, reply) => {
    return reply.send({ data: await listScheduledReports(req.user!.orgId) });
  });

  app.post('/api/v1/scheduled-reports', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
    schema: { tags: ['ScheduledReports'] },
  }, async (req, reply) => {
    const body = z.object({
      name: z.string().min(1).max(255),
      reportType: z.enum(['org_overview', 'campaign_summary', 'list_growth', 'rfm_distribution']),
      frequency: z.enum(['daily', 'weekly', 'monthly']),
      recipients: z.array(z.string().email()).min(1).max(20),
      params: z.record(z.unknown()).optional(),
    }).parse(req.body);
    return reply.code(201).send({ data: await createScheduledReport(req.user!.orgId, body) });
  });

  app.delete('/api/v1/scheduled-reports/:id', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
    schema: { tags: ['ScheduledReports'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await deleteScheduledReport(req.user!.orgId, id);
    return reply.code(204).send();
  });

  app.post('/api/v1/scheduled-reports/run-due', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
    schema: { tags: ['ScheduledReports'] },
  }, async (_req, reply) => {
    return reply.send({ data: await runDueReports() });
  });
};

export default scheduledReportRoutes;
