import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { pipelines, type PipelineStage } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// Default 6-stage sales pipeline used for freshly onboarded orgs.
export const DEFAULT_STAGES: Omit<PipelineStage, 'id'>[] = [
  { name: 'Lead In',       probability: 10, order: 0, color: '#94a3b8' },
  { name: 'Qualified',     probability: 25, order: 1, color: '#60a5fa' },
  { name: 'Proposal Sent', probability: 50, order: 2, color: '#818cf8' },
  { name: 'Negotiation',   probability: 75, order: 3, color: '#f59e0b' },
  { name: 'Won',           probability: 100, order: 4, color: '#10b981' },
  { name: 'Lost',          probability: 0,  order: 5, color: '#ef4444' },
];

function assignStageIds(stages: Omit<PipelineStage, 'id'>[]): PipelineStage[] {
  return stages.map(s => ({ ...s, id: randomUUID() }));
}

export async function seedDefaultPipeline(orgId: string) {
  const existing = await db.select({ id: pipelines.id }).from(pipelines).where(eq(pipelines.orgId, orgId)).limit(1);
  if (existing.length > 0) return existing[0]!;

  const [row] = await db.insert(pipelines).values({
    orgId,
    name: 'Default Sales Pipeline',
    isDefault: true,
    stages: assignStageIds(DEFAULT_STAGES),
  }).returning();
  return row!;
}

export async function createPipeline(orgId: string, input: {
  name: string;
  description?: string;
  isDefault?: boolean;
  stages?: Omit<PipelineStage, 'id'>[];
}) {
  const stages = input.stages ? assignStageIds(input.stages) : assignStageIds(DEFAULT_STAGES);

  if (input.isDefault) {
    await db.update(pipelines).set({ isDefault: false }).where(eq(pipelines.orgId, orgId));
  }

  const [row] = await db.insert(pipelines).values({
    orgId,
    name: input.name,
    description: input.description,
    isDefault: input.isDefault ?? false,
    stages,
  }).returning();
  return row!;
}

export async function listPipelines(orgId: string) {
  return db.select().from(pipelines)
    .where(eq(pipelines.orgId, orgId))
    .orderBy(desc(pipelines.isDefault), pipelines.name);
}

export async function getPipeline(orgId: string, id: string) {
  const [row] = await db.select().from(pipelines)
    .where(and(eq(pipelines.id, id), eq(pipelines.orgId, orgId)));
  if (!row) throw AppError.notFound('Pipeline not found');
  return row;
}

export async function getDefaultPipeline(orgId: string) {
  const [row] = await db.select().from(pipelines)
    .where(and(eq(pipelines.orgId, orgId), eq(pipelines.isDefault, true)));
  return row ?? null;
}

export async function updatePipeline(orgId: string, id: string, patch: {
  name?: string;
  description?: string;
  isDefault?: boolean;
  stages?: PipelineStage[];
}) {
  await getPipeline(orgId, id);

  if (patch.isDefault) {
    await db.update(pipelines).set({ isDefault: false }).where(eq(pipelines.orgId, orgId));
  }

  const [row] = await db.update(pipelines)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(pipelines.id, id), eq(pipelines.orgId, orgId)))
    .returning();
  return row!;
}

export async function deletePipeline(orgId: string, id: string) {
  const pipeline = await getPipeline(orgId, id);
  if (pipeline.isDefault) throw AppError.badRequest('Cannot delete the default pipeline');

  await db.delete(pipelines).where(and(eq(pipelines.id, id), eq(pipelines.orgId, orgId)));
}

export function stageFromPipeline(pipeline: typeof pipelines.$inferSelect, stageId: string): PipelineStage | null {
  return pipeline.stages.find(s => s.id === stageId) ?? null;
}
