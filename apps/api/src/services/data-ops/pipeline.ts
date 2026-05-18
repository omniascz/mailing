/**
 * Programmable data pipeline runner (#357).
 *
 * Takes an array of input rows and an ordered list of PipelineStep objects
 * and returns the transformed output. The transform implementations live in
 * `pure.ts` so they can be unit-tested without crossing the schema barrel.
 *
 * Joins are intentionally in-memory — pipelines are meant for tactical data
 * ops (segment building, export prep, ad-hoc reports), not ETL. If a user
 * needs to join a 10M-row table against a 10M-row table, they should use a
 * warehouse.
 *
 * The runner never calls out to user code; all transforms are declarative.
 */

import type { PipelineStep } from '../../db/schema/data-pipelines.js';
import {
  applyFilter, applyMap, applyAggregate, applyLimit, applySort, joinRows,
  type Row,
} from './pure.js';

export type { Row } from './pure.js';

export interface RunPipelineInput {
  rows: Row[];
  steps: PipelineStep[];
  /** Called when a JoinStep needs the right-hand dataset. */
  fetchJoinRows?: (source: string) => Promise<Row[]>;
}

export interface RunPipelineResult {
  rows: Row[];
  stats: {
    inputCount: number;
    outputCount: number;
    perStep: Array<{ step: PipelineStep['type']; before: number; after: number }>;
  };
}

export async function runPipeline(input: RunPipelineInput): Promise<RunPipelineResult> {
  let rows = input.rows;
  const perStep: RunPipelineResult['stats']['perStep'] = [];

  for (const step of input.steps) {
    const before = rows.length;
    rows = await applyStep(step, rows, input.fetchJoinRows);
    perStep.push({ step: step.type, before, after: rows.length });
  }

  return {
    rows,
    stats: {
      inputCount: input.rows.length,
      outputCount: rows.length,
      perStep,
    },
  };
}

async function applyStep(
  step: PipelineStep,
  rows: Row[],
  fetchJoinRows?: (source: string) => Promise<Row[]>,
): Promise<Row[]> {
  switch (step.type) {
    case 'filter':    return applyFilter(step, rows);
    case 'map':       return applyMap(step, rows);
    case 'aggregate': return applyAggregate(step, rows);
    case 'limit':     return applyLimit(step, rows);
    case 'sort':      return applySort(step, rows);
    case 'join': {
      if (!fetchJoinRows) return rows;
      const right = await fetchJoinRows(step.rightSource);
      return joinRows(step, rows, right);
    }
  }
}
