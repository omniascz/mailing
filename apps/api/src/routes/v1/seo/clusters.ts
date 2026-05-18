import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listClusters, getClusterWithPages, createCluster, updateCluster, deleteCluster,
  listClusterPages, addClusterPage, updateClusterPage, deleteClusterPage,
} from '../../../services/seo/clusters.js';

const seoClustersRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };

  // ── Clusters ──────────────────────────────────────────────────────────────
  app.get('/api/v1/seo/clusters', auth, async (req, reply) => {
    const data = await listClusters(req.user!.orgId);
    return reply.send({ data });
  });

  app.get('/api/v1/seo/clusters/:clusterId', auth, async (req, reply) => {
    const { clusterId } = z.object({ clusterId: z.string().uuid() }).parse(req.params);
    const data = await getClusterWithPages(req.user!.orgId, clusterId);
    return reply.send({ data });
  });

  app.post('/api/v1/seo/clusters', auth, async (req, reply) => {
    const body = z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      status: z.enum(['draft', 'active', 'archived']).optional(),
    }).parse(req.body);
    const data = await createCluster(req.user!.orgId, body);
    return reply.code(201).send({ data });
  });

  app.patch('/api/v1/seo/clusters/:clusterId', auth, async (req, reply) => {
    const { clusterId } = z.object({ clusterId: z.string().uuid() }).parse(req.params);
    const body = z.object({
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      status: z.enum(['draft', 'active', 'archived']).optional(),
    }).parse(req.body);
    const data = await updateCluster(req.user!.orgId, clusterId, body);
    return reply.send({ data });
  });

  app.delete('/api/v1/seo/clusters/:clusterId', auth, async (req, reply) => {
    const { clusterId } = z.object({ clusterId: z.string().uuid() }).parse(req.params);
    await deleteCluster(req.user!.orgId, clusterId);
    return reply.code(204).send();
  });

  // ── Cluster pages ─────────────────────────────────────────────────────────
  app.get('/api/v1/seo/clusters/:clusterId/pages', auth, async (req, reply) => {
    const { clusterId } = z.object({ clusterId: z.string().uuid() }).parse(req.params);
    const data = await listClusterPages(req.user!.orgId, clusterId);
    return reply.send({ data });
  });

  app.post('/api/v1/seo/clusters/:clusterId/pages', auth, async (req, reply) => {
    const { clusterId } = z.object({ clusterId: z.string().uuid() }).parse(req.params);
    const body = z.object({
      pageType: z.enum(['pillar', 'spoke']).optional(),
      title: z.string().min(1).max(500),
      url: z.string().url().optional(),
      targetKeyword: z.string().max(255).optional(),
      status: z.enum(['idea', 'planned', 'in_progress', 'published']).optional(),
      wordCount: z.number().int().positive().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const data = await addClusterPage(req.user!.orgId, clusterId, body);
    return reply.code(201).send({ data });
  });

  app.patch('/api/v1/seo/clusters/:clusterId/pages/:pageId', auth, async (req, reply) => {
    const { pageId } = z.object({ clusterId: z.string().uuid(), pageId: z.string().uuid() }).parse(req.params);
    const body = z.object({
      title: z.string().max(500).optional(),
      url: z.string().url().optional(),
      targetKeyword: z.string().max(255).optional(),
      pageType: z.enum(['pillar', 'spoke']).optional(),
      status: z.enum(['idea', 'planned', 'in_progress', 'published']).optional(),
      wordCount: z.number().int().positive().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const data = await updateClusterPage(req.user!.orgId, pageId, body);
    return reply.send({ data });
  });

  app.delete('/api/v1/seo/clusters/:clusterId/pages/:pageId', auth, async (req, reply) => {
    const { pageId } = z.object({ clusterId: z.string().uuid(), pageId: z.string().uuid() }).parse(req.params);
    await deleteClusterPage(req.user!.orgId, pageId);
    return reply.code(204).send();
  });
};

export default seoClustersRoutes;
