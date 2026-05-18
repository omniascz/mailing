import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  seedDefaultControls, listControls, updateControl,
  runAccessReview, listAccessReviews,
  setRetentionPolicy, listRetentionPolicies, enforceRetention,
  complianceReport, RETENTION_RESOURCES,
} from '../../services/compliance/index.js';

const complianceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/compliance/controls', {
    preHandler: [app.authenticate],
    schema: { tags: ['Compliance'] },
  }, async (req, reply) => {
    return reply.send({ data: await listControls(req.user!.orgId) });
  });

  app.post('/api/v1/compliance/controls/seed', {
    preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
    schema: { tags: ['Compliance'] },
  }, async (req, reply) => {
    return reply.send({ data: await seedDefaultControls(req.user!.orgId) });
  });

  app.patch('/api/v1/compliance/controls/:id', {
    preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
    schema: { tags: ['Compliance'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      implemented: z.boolean().optional(),
      evidenceUrl: z.string().url().max(1024).optional(),
      evidenceNotes: z.string().optional(),
      ownerUserId: z.string().uuid().nullable().optional(),
      nextReviewAt: z.coerce.date().optional(),
    }).parse(req.body);
    return reply.send({ data: await updateControl(req.user!.orgId, id, body) });
  });

  app.post('/api/v1/compliance/access-reviews', {
    preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
    schema: { tags: ['Compliance'] },
  }, async (req, reply) => {
    const body = z.object({ findings: z.string().optional() }).parse(req.body ?? {});
    return reply.send({ data: await runAccessReview(req.user!.orgId, req.user!.userId, body.findings) });
  });

  app.get('/api/v1/compliance/access-reviews', {
    preHandler: [app.authenticate],
    schema: { tags: ['Compliance'] },
  }, async (req, reply) => {
    return reply.send({ data: await listAccessReviews(req.user!.orgId) });
  });

  app.post('/api/v1/compliance/retention-policies', {
    preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
    schema: { tags: ['Compliance'] },
  }, async (req, reply) => {
    const body = z.object({
      resource: z.enum(RETENTION_RESOURCES as [string, ...string[]]),
      retentionDays: z.number().int().min(1).max(3650),
    }).parse(req.body);
    return reply.send({ data: await setRetentionPolicy(req.user!.orgId, body.resource, body.retentionDays) });
  });

  app.get('/api/v1/compliance/retention-policies', {
    preHandler: [app.authenticate],
    schema: { tags: ['Compliance'] },
  }, async (req, reply) => {
    return reply.send({ data: await listRetentionPolicies(req.user!.orgId) });
  });

  app.post('/api/v1/compliance/retention/enforce', {
    preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
    schema: { tags: ['Compliance'] },
  }, async (req, reply) => {
    return reply.send({ data: await enforceRetention(req.user!.orgId) });
  });

  app.get('/api/v1/compliance/report', {
    preHandler: [app.authenticate],
    schema: { tags: ['Compliance'] },
  }, async (req, reply) => {
    return reply.send({ data: await complianceReport(req.user!.orgId) });
  });
};

export default complianceRoutes;
