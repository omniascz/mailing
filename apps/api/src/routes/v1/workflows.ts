/**
 * Workflow management routes (5.2):
 *
 *  GET    /api/v1/workflows                        — list workflows
 *  POST   /api/v1/workflows                        — create workflow
 *  GET    /api/v1/workflows/:id                    — get workflow
 *  PUT    /api/v1/workflows/:id                    — update workflow
 *  DELETE /api/v1/workflows/:id                    — soft delete
 *  POST   /api/v1/workflows/:id/activate           — set status = active
 *  POST   /api/v1/workflows/:id/deactivate         — set status = inactive
 *  POST   /api/v1/workflows/:id/trigger            — manually trigger for a contact
 *  GET    /api/v1/workflows/:id/runs               — list runs for a workflow
 *  POST   /api/v1/workflows/:id/runs/:runId/cancel — cancel a run
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createWorkflow,
  getWorkflow,
  listWorkflows,
  updateWorkflow,
  deleteWorkflow,
  activateWorkflow,
  deactivateWorkflow,
  listWorkflowRuns,
  getWorkflowRun,
  cancelWorkflowRun,
  getWorkflowAnalytics,
} from '../../services/workflows/index.js';
import { triggerManual } from '../../services/workflows/triggers.js';
import { FLOW_TEMPLATES, getFlowTemplate } from '../../services/workflows/flow-templates.js';
import { buildWorkflowMap } from '../../services/workflows/map.js';

const idParam = z.object({ id: z.string().uuid() });
const runParam = z.object({ id: z.string().uuid(), runId: z.string().uuid() });

const workflowStatusValues = ['draft', 'active', 'inactive', 'archived'] as const;
const triggerTypeValues = [
  'list_subscribe',
  'tag_added',
  'date_field',
  'api_event',
  'form_submit',
  'purchase_event',
  'manual',
  'loyalty_points_earned',
  'loyalty_tier_up',
  'loyalty_reward_redeemed',
  'name_day_today',
  'lifecycle_stage_changed',
  'n_days_before_holiday',
  'segment_entered',
  'segment_exited',
] as const;

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1024).optional(),
  triggerType: z.enum(triggerTypeValues).optional().default('manual'),
  triggerConfig: z.record(z.unknown()).optional().default({}),
  nodes: z
    .array(z.object({ id: z.string(), type: z.string() }).passthrough())
    .optional()
    .default([]),
  edges: z
    .array(z.object({ id: z.string(), source: z.string(), target: z.string() }).passthrough())
    .optional()
    .default([]),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1024).optional(),
  status: z.enum(workflowStatusValues).optional(),
  triggerType: z.enum(triggerTypeValues).optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  nodes: z.array(z.object({ id: z.string(), type: z.string() }).passthrough()).optional(),
  edges: z
    .array(z.object({ id: z.string(), source: z.string(), target: z.string() }).passthrough())
    .optional(),
});

const listQuerySchema = z.object({
  status: z.enum(workflowStatusValues).optional(),
  cursor: z.string().uuid().optional(),
  limit: z
    .string()
    .transform((v) => parseInt(v, 10))
    .optional(),
});

export default async function workflowRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get(
    '/api/v1/workflows',
    { schema: { tags: ['Workflows'], summary: 'List workflows' } },
    async (req) => {
      const query = listQuerySchema.parse(req.query);
      const orgId = req.user!.orgId;
      return listWorkflows(orgId, query);
    },
  );

  app.post(
    '/api/v1/workflows',
    { schema: { tags: ['Workflows'], summary: 'Create workflow' } },
    async (req) => {
      const body = createSchema.parse(req.body);
      const orgId = req.user!.orgId;
      const workflow = await createWorkflow({ ...body, orgId });
      return { data: workflow };
    },
  );

  app.get(
    '/api/v1/workflows/:id',
    {
      schema: {
        tags: ['Workflows'],
        summary: 'Get workflow',
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const orgId = req.user!.orgId;
      return { data: await getWorkflow(id, orgId) };
    },
  );

  app.put(
    '/api/v1/workflows/:id',
    {
      schema: {
        tags: ['Workflows'],
        summary: 'Update workflow',
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const body = updateSchema.parse(req.body);
      const orgId = req.user!.orgId;
      return { data: await updateWorkflow(id, orgId, body) };
    },
  );

  app.delete(
    '/api/v1/workflows/:id',
    {
      schema: {
        tags: ['Workflows'],
        summary: 'Delete workflow',
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
    },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const orgId = req.user!.orgId;
      await deleteWorkflow(id, orgId);
      return reply.status(204).send();
    },
  );

  app.post(
    '/api/v1/workflows/:id/activate',
    {
      schema: {
        tags: ['Workflows'],
        summary: 'Activate workflow',
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const orgId = req.user!.orgId;
      return { data: await activateWorkflow(id, orgId) };
    },
  );

  app.post(
    '/api/v1/workflows/:id/deactivate',
    {
      schema: {
        tags: ['Workflows'],
        summary: 'Deactivate workflow',
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const orgId = req.user!.orgId;
      return { data: await deactivateWorkflow(id, orgId) };
    },
  );

  app.post(
    '/api/v1/workflows/:id/trigger',
    {
      schema: {
        tags: ['Workflows'],
        summary: 'Manually trigger workflow for a contact',
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.body);
      const orgId = req.user!.orgId;
      const run = await triggerManual(id, orgId, contactId);
      return { data: run };
    },
  );

  app.get(
    '/api/v1/workflows/:id/runs',
    {
      schema: {
        tags: ['Workflows'],
        summary: 'List workflow runs',
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const query = z
        .object({ cursor: z.string().optional(), limit: z.string().optional() })
        .parse(req.query);
      const orgId = req.user!.orgId;
      return listWorkflowRuns(id, orgId, {
        cursor: query.cursor,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      });
    },
  );

  // Flow analytics — run outcomes + conversion revenue + revenue-per-recipient.
  app.get(
    '/api/v1/workflows/:id/analytics',
    {
      schema: {
        tags: ['Workflows'],
        summary: 'Flow analytics (conversion rate, revenue, revenue-per-recipient)',
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await getWorkflowAnalytics(id, req.user!.orgId) };
    },
  );

  app.get(
    '/api/v1/workflows/:id/runs/:runId',
    { schema: { tags: ['Workflows'], summary: 'Get a single workflow run' } },
    async (req) => {
      const { runId } = runParam.parse(req.params);
      const orgId = req.user!.orgId;
      return { data: await getWorkflowRun(runId, orgId) };
    },
  );

  app.post(
    '/api/v1/workflows/:id/runs/:runId/cancel',
    { schema: { tags: ['Workflows'], summary: 'Cancel a workflow run' } },
    async (req) => {
      const { runId } = runParam.parse(req.params);
      const orgId = req.user!.orgId;
      return { data: await cancelWorkflowRun(runId, orgId) };
    },
  );

  // ── Automation map (#214) ──────────────────────────────────────────────────

  app.get(
    '/api/v1/workflows/map',
    {
      schema: {
        tags: ['Workflows'],
        summary: 'Automation map — graph of all workflow connections',
      },
    },
    async (req) => {
      return { data: await buildWorkflowMap(req.user!.orgId) };
    },
  );

  // ── Pre-built flow templates (5.8) ─────────────────────────────────────────

  app.get(
    '/api/v1/workflows/templates',
    { schema: { tags: ['Workflows'], summary: 'List pre-built workflow templates' } },
    async (_req, reply) => {
      return reply.send({
        data: FLOW_TEMPLATES.map(({ nodes: _nodes, edges: _edges, ...meta }) => meta),
      });
    },
  );

  app.get(
    '/api/v1/workflows/templates/:templateId',
    { schema: { tags: ['Workflows'], summary: 'Get full pre-built workflow template' } },
    async (req, reply) => {
      const { templateId } = req.params as { templateId: string };
      const template = getFlowTemplate(templateId);
      if (!template)
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Template not found' });
      return reply.send({ data: template });
    },
  );

  app.post(
    '/api/v1/workflows/templates/:templateId/use',
    { schema: { tags: ['Workflows'], summary: 'Create a workflow from a pre-built template' } },
    async (req, reply) => {
      const { templateId } = req.params as { templateId: string };
      const template = getFlowTemplate(templateId);
      if (!template)
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Template not found' });

      const body = z.object({ name: z.string().min(1).max(255).optional() }).parse(req.body ?? {});
      const orgId = req.user!.orgId;

      const workflow = await createWorkflow({
        orgId,
        name: body.name ?? template.name,
        description: template.description,
        triggerType: template.triggerType as never,
        nodes: template.nodes,
        edges: template.edges,
      });

      return reply.status(201).send({ data: workflow });
    },
  );
}
