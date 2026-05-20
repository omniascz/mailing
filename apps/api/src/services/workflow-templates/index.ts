/**
 * Workflow template service (Sprint E.3).
 *
 * Listing pulls from the in-code registry; fork creates a real workflows
 * row in the org by deep-copying nodes/edges so subsequent edits don't
 * mutate the registry.
 */

import { createWorkflow } from '../workflows/index.js';
import {
  findTemplate,
  listTemplates,
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
  type TemplateCategory,
} from './registry.js';
import type { Workflow } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export { listTemplates, findTemplate, WORKFLOW_TEMPLATES };
export type { WorkflowTemplate, TemplateCategory };

/**
 * Return categories with their template counts — useful for the gallery
 * sidebar so the UI doesn't have to compute aggregates.
 */
export function listCategories(): Array<{ category: TemplateCategory; count: number }> {
  const counts = new Map<TemplateCategory, number>();
  for (const t of WORKFLOW_TEMPLATES) {
    counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
}

/**
 * Fork a template into a new draft workflow on the given org.
 * Deep-clones nodes/edges via JSON round-trip to fully detach from the
 * registry — the registry array is shared across all requests, and a
 * shallow copy would leak edits back into it.
 */
export async function forkTemplate(
  orgId: string,
  slug: string,
  override?: { name?: string },
): Promise<Workflow> {
  const tpl = findTemplate(slug);
  if (!tpl) throw AppError.notFound('Template');

  // workflowTriggerTypeEnum values that the DB accepts. The registry uses
  // strings that map 1:1, but we still cast through the workflow service
  // which validates the enum.
  const wf = await createWorkflow({
    orgId,
    name: override?.name ?? tpl.name,
    description: tpl.description,
    triggerType: tpl.trigger.type as Workflow['triggerType'],
    triggerConfig: tpl.trigger.config,
    nodes: JSON.parse(JSON.stringify(tpl.nodes)),
    edges: JSON.parse(JSON.stringify(tpl.edges)),
  });
  return wf;
}
