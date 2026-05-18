/**
 * Deliverability routes (#397).
 *
 *   POST /api/v1/deliverability/graymail/sweep        — trigger a sweep now
 *   GET  /api/v1/deliverability/health-score          — org composite health
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sweepOrg } from '../../services/deliverability/graymail.js';
import { computeOrgHealth } from '../../services/deliverability/health-score.js';

const deliverabilityRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/deliverability/graymail/sweep', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
    schema: { tags: ['Deliverability'], summary: 'Run a graymail classification sweep now' },
  }, async (req) => {
    const result = await sweepOrg(req.user!.orgId);
    return { data: result };
  });

  app.get('/api/v1/deliverability/health-score', {
    preHandler: [app.authenticate],
    schema: { tags: ['Deliverability'], summary: 'Composite email-health score for this org' },
  }, async (req) => {
    const query = z.object({
      days: z.coerce.number().int().min(1).max(365).optional(),
      domain: z.string().min(1).max(255).optional(),
      ip: z.string().min(3).max(45).optional(),
    }).parse(req.query);

    const result = await computeOrgHealth({
      orgId: req.user!.orgId,
      ...(query.days != null ? { days: query.days } : {}),
      ...(query.domain ? { domain: query.domain } : {}),
      ...(query.ip ? { ip: query.ip } : {}),
    });
    return { data: result };
  });
};

export default deliverabilityRoutes;
