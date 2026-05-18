/**
 * Data-ops service (#357) — CRUD + execution wrapper for pipelines.
 *
 * The pipeline runner itself is in `./pipeline.ts`. This module handles
 * DB reads/writes and exposes a small API the routes can call.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  dataPipelines, dataPipelineRuns,
  type DataPipeline, type PipelineStep,
} from '../../db/schema/data-pipelines.js';
import { AppError } from '../../lib/app-error.js';
import { runPipeline, type Row } from './pipeline.js';

export interface CreatePipelineInput {
  name: string;
  description?: string;
  source: 'contacts' | 'email_events' | 'deals' | 'orders' | 'cdp_events';
  steps: PipelineStep[];
  trigger?: 'manual' | 'scheduled' | 'event';
  schedule?: string;
  sinkWebhookUrl?: string;
}

export async function createPipeline(
  orgId: string, input: CreatePipelineInput,
): Promise<DataPipeline> {
  const [row] = await db.insert(dataPipelines).values({
    orgId,
    name: input.name,
    description: input.description,
    source: input.source,
    steps: input.steps,
    trigger: input.trigger ?? 'manual',
    schedule: input.schedule,
    sinkWebhookUrl: input.sinkWebhookUrl,
  }).returning();
  if (!row) throw AppError.internal('Failed to create pipeline');
  return row;
}

export async function listPipelines(orgId: string): Promise<DataPipeline[]> {
  return db.select().from(dataPipelines).where(and(
    eq(dataPipelines.orgId, orgId),
    isNull(dataPipelines.deletedAt),
  ));
}

export async function getPipeline(orgId: string, id: string): Promise<DataPipeline> {
  const [row] = await db.select().from(dataPipelines).where(and(
    eq(dataPipelines.orgId, orgId),
    eq(dataPipelines.id, id),
    isNull(dataPipelines.deletedAt),
  )).limit(1);
  if (!row) throw AppError.notFound('Pipeline not found');
  return row;
}

export async function deletePipeline(orgId: string, id: string): Promise<void> {
  await db.update(dataPipelines)
    .set({ deletedAt: new Date() })
    .where(and(eq(dataPipelines.orgId, orgId), eq(dataPipelines.id, id)));
}

/**
 * Execute a pipeline against a provided in-memory dataset. Call sites are
 * responsible for loading the source rows from the underlying table; this
 * keeps the runner a pure function and simplifies testing.
 */
export async function executePipeline(
  pipeline: DataPipeline,
  sourceRows: Row[],
  fetchJoinRows?: (source: string) => Promise<Row[]>,
): Promise<{ runId: string; rows: Row[]; stats: Record<string, unknown> }> {
  const [runRow] = await db.insert(dataPipelineRuns).values({
    pipelineId: pipeline.id,
    orgId: pipeline.orgId,
    status: 'running',
    inputCount: String(sourceRows.length),
    startedAt: new Date(),
  }).returning();
  const runId = runRow!.id;

  try {
    const result = await runPipeline({
      rows: sourceRows,
      steps: pipeline.steps,
      fetchJoinRows,
    });
    await db.update(dataPipelineRuns)
      .set({
        status: 'completed',
        outputCount: String(result.rows.length),
        preview: result.rows.slice(0, 25),
        completedAt: new Date(),
      })
      .where(eq(dataPipelineRuns.id, runId));
    return { runId, rows: result.rows, stats: result.stats };
  } catch (err) {
    await db.update(dataPipelineRuns)
      .set({
        status: 'failed',
        errorMessage: (err as Error).message,
        completedAt: new Date(),
      })
      .where(eq(dataPipelineRuns.id, runId));
    throw err;
  }
}
