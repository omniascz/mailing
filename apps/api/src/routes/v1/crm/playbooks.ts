/**
 * Sales Playbooks API (#324).
 *
 *  GET    /api/v1/crm/playbooks              — list playbooks
 *  POST   /api/v1/crm/playbooks              — create playbook
 *  GET    /api/v1/crm/playbooks/:id          — get playbook
 *  PUT    /api/v1/crm/playbooks/:id          — update playbook
 *  DELETE /api/v1/crm/playbooks/:id          — delete playbook
 *
 *  POST   /api/v1/crm/playbooks/:id/runs     — start a run (for a contact/deal)
 *  GET    /api/v1/crm/playbooks/:id/runs     — list runs for this playbook
 *  GET    /api/v1/crm/playbook-runs/:runId   — get run detail
 *  PATCH  /api/v1/crm/playbook-runs/:runId/steps/:stepId — log step completion
 *  POST   /api/v1/crm/playbook-runs/:runId/complete       — mark run complete
 *  POST   /api/v1/crm/playbook-runs/:runId/abandon        — abandon run
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import {
  playbooks,
  playbookRuns,
  type PlaybookStep,
  type PlaybookStepLog,
} from '../../../db/schema/index.js';
import { AppError } from '../../../lib/app-error.js';

const idParam = z.object({ id: z.string().uuid() });
const runIdParam = z.object({ runId: z.string().uuid() });

const stepSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['call', 'email', 'linkedin', 'meeting', 'task', 'question', 'note']),
  order: z.number().int().min(0),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  question: z.string().optional(),
  script: z.string().optional(),
  required: z.boolean().default(true),
});

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  entityTypes: z.array(z.enum(['contact', 'deal', 'account'])).min(1).default(['deal']),
  steps: z.array(stepSchema).default([]),
  active: z.boolean().default(true),
});

const startRunSchema = z.object({
  entityType: z.enum(['contact', 'deal', 'account']),
  contactId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
});

const logStepSchema = z.object({
  notes: z.string().optional(),
  outcome: z.string().optional(),
  skipped: z.boolean().optional(),
});

export default async function playbookRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // ─── Playbook CRUD ────────────────────────────────────────────────────────

  app.get('/api/v1/crm/playbooks', async (req) => {
    const orgId = req.user!.orgId;
    const rows = await db
      .select()
      .from(playbooks)
      .where(and(eq(playbooks.orgId, orgId), eq(playbooks.active, true)))
      .orderBy(desc(playbooks.createdAt));
    return { data: rows, total: rows.length };
  });

  app.post('/api/v1/crm/playbooks', async (req, reply) => {
    const orgId = req.user!.orgId;
    const body = createSchema.parse(req.body);
    const [row] = await db
      .insert(playbooks)
      .values({
        orgId,
        name: body.name,
        description: body.description ?? null,
        entityTypes: body.entityTypes,
        steps: body.steps as PlaybookStep[],
        active: body.active,
      })
      .returning();
    return reply.code(201).send({ data: row });
  });

  app.get('/api/v1/crm/playbooks/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const orgId = req.user!.orgId;
    const [row] = await db
      .select()
      .from(playbooks)
      .where(and(eq(playbooks.id, id), eq(playbooks.orgId, orgId)))
      .limit(1);
    if (!row) throw AppError.notFound('Playbook');
    return { data: row };
  });

  app.put('/api/v1/crm/playbooks/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const orgId = req.user!.orgId;
    const body = createSchema.partial().parse(req.body);
    const [row] = await db
      .update(playbooks)
      .set({ ...body, steps: body.steps as PlaybookStep[] | undefined, updatedAt: new Date() })
      .where(and(eq(playbooks.id, id), eq(playbooks.orgId, orgId)))
      .returning();
    if (!row) throw AppError.notFound('Playbook');
    return { data: row };
  });

  app.delete('/api/v1/crm/playbooks/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const orgId = req.user!.orgId;
    await db
      .update(playbooks)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(playbooks.id, id), eq(playbooks.orgId, orgId)));
    return reply.code(204).send();
  });

  // ─── Runs ─────────────────────────────────────────────────────────────────

  app.post('/api/v1/crm/playbooks/:id/runs', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const orgId = req.user!.orgId;
    const body = startRunSchema.parse(req.body);

    const [pb] = await db
      .select({ id: playbooks.id })
      .from(playbooks)
      .where(and(eq(playbooks.id, id), eq(playbooks.orgId, orgId)))
      .limit(1);
    if (!pb) throw AppError.notFound('Playbook');

    const [run] = await db
      .insert(playbookRuns)
      .values({
        orgId,
        playbookId: id,
        entityType: body.entityType,
        contactId: body.contactId ?? null,
        dealId: body.dealId ?? null,
        assignedUserId: body.assignedUserId ?? null,
        status: 'in_progress',
        stepLogs: [],
        currentStepIndex: '0',
      })
      .returning();
    return reply.code(201).send({ data: run });
  });

  app.get('/api/v1/crm/playbooks/:id/runs', async (req) => {
    const { id } = idParam.parse(req.params);
    const orgId = req.user!.orgId;
    const rows = await db
      .select()
      .from(playbookRuns)
      .where(and(eq(playbookRuns.playbookId, id), eq(playbookRuns.orgId, orgId)))
      .orderBy(desc(playbookRuns.createdAt));
    return { data: rows, total: rows.length };
  });

  app.get('/api/v1/crm/playbook-runs/:runId', async (req) => {
    const { runId } = runIdParam.parse(req.params);
    const orgId = req.user!.orgId;
    const [run] = await db
      .select()
      .from(playbookRuns)
      .where(and(eq(playbookRuns.id, runId), eq(playbookRuns.orgId, orgId)))
      .limit(1);
    if (!run) throw AppError.notFound('PlaybookRun');
    return { data: run };
  });

  // PATCH /api/v1/crm/playbook-runs/:runId/steps/:stepId — log step
  app.patch('/api/v1/crm/playbook-runs/:runId/steps/:stepId', async (req) => {
    const { runId } = runIdParam.parse(req.params);
    const { stepId } = z.object({ stepId: z.string().min(1) }).parse(req.params);
    const orgId = req.user!.orgId;
    const body = logStepSchema.parse(req.body);

    const [run] = await db
      .select()
      .from(playbookRuns)
      .where(and(eq(playbookRuns.id, runId), eq(playbookRuns.orgId, orgId)))
      .limit(1);
    if (!run) throw AppError.notFound('PlaybookRun');

    const logs = (run.stepLogs as PlaybookStepLog[]) ?? [];
    const existingIdx = logs.findIndex((l) => l.stepId === stepId);
    const entry: PlaybookStepLog = {
      stepId,
      completedAt: new Date().toISOString(),
      skipped: body.skipped,
      notes: body.notes,
      outcome: body.outcome,
    };
    if (existingIdx >= 0) logs[existingIdx] = entry;
    else logs.push(entry);

    const [updated] = await db
      .update(playbookRuns)
      .set({ stepLogs: logs, updatedAt: new Date() })
      .where(eq(playbookRuns.id, runId))
      .returning();
    return { data: updated };
  });

  app.post('/api/v1/crm/playbook-runs/:runId/complete', async (req) => {
    const { runId } = runIdParam.parse(req.params);
    const orgId = req.user!.orgId;
    const [run] = await db
      .update(playbookRuns)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(playbookRuns.id, runId), eq(playbookRuns.orgId, orgId)))
      .returning();
    if (!run) throw AppError.notFound('PlaybookRun');
    return { data: run };
  });

  app.post('/api/v1/crm/playbook-runs/:runId/abandon', async (req) => {
    const { runId } = runIdParam.parse(req.params);
    const orgId = req.user!.orgId;
    const [run] = await db
      .update(playbookRuns)
      .set({ status: 'abandoned', completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(playbookRuns.id, runId), eq(playbookRuns.orgId, orgId)))
      .returning();
    if (!run) throw AppError.notFound('PlaybookRun');
    return { data: run };
  });
}

