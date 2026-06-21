/**
 * Workflow export / import / marketplace routes (#374, #375, #376).
 *
 *   GET  /api/v1/workflows/:id/export        — download workflow as JSON blob
 *   POST /api/v1/workflows/import            — import blob → create draft workflow
 *   GET  /api/v1/workflow-marketplace        — browse public marketplace
 *   POST /api/v1/workflows/:id/publish       — publish to marketplace
 *   POST /api/v1/workflow-marketplace/:id/fork — fork entry into org
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  exportWorkflow,
  importWorkflow,
  publishToMarketplace,
  listMarketplace,
  forkMarketplaceEntry,
} from '../../services/workflows/export.js';

export default async function workflowExportRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };
  const adminAuth = { preHandler: [app.authenticate, app.requireRole('admin', 'owner', 'editor')] };

  // Export
  app.get('/api/v1/workflows/:id/export', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const blob = await exportWorkflow(req.user!.orgId, id);
    return reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', `attachment; filename="workflow-${id}.json"`)
      .send(JSON.stringify(blob, null, 2));
  });

  // Import
  app.post('/api/v1/workflows/import', adminAuth, async (req, reply) => {
    const workflow = await importWorkflow(req.user!.orgId, req.body);
    return reply.code(201).send({ data: workflow });
  });

  // Marketplace — browse
  app.get('/api/v1/workflow-marketplace', auth, async (req, reply) => {
    const { category, triggerType } = z
      .object({
        category: z.string().optional(),
        triggerType: z.string().optional(),
      })
      .parse(req.query);
    const entries = listMarketplace({ category, triggerType });
    return reply.send({ data: entries });
  });

  // Marketplace — publish
  app.post('/api/v1/workflows/:id/publish', adminAuth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { category } = z.object({ category: z.string().optional() }).parse(req.body ?? {});
    const entry = await publishToMarketplace(req.user!.orgId, id, { category });
    return reply.code(201).send({ data: entry });
  });

  // Marketplace — fork
  app.post('/api/v1/workflow-marketplace/:entryId/fork', adminAuth, async (req, reply) => {
    const { entryId } = z.object({ entryId: z.string().uuid() }).parse(req.params);
    const workflow = await forkMarketplaceEntry(req.user!.orgId, entryId);
    return reply.code(201).send({ data: workflow });
  });
}
