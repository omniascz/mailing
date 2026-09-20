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
import { workflowTriggerTypeEnum, type Workflow } from '../../db/schema/index.js';
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

  // Validate, don't cast. The old `as Workflow['triggerType']` claimed the
  // workflow service would check the enum; it does not, so forking was the one
  // way to write a trigger type the API's own Zod enum would have rejected.
  // Checked against workflowTriggerTypeEnum rather than the route's
  // triggerTypeValues both because a service must not import from routes and
  // because the enum is what the column actually accepts — trigger-coverage
  // asserts the two lists are identical.
  const triggerType = tpl.trigger.type as Workflow['triggerType'];
  if (!(workflowTriggerTypeEnum.enumValues as readonly string[]).includes(triggerType)) {
    throw AppError.badRequest(
      `Template "${slug}" declares unknown trigger type "${tpl.trigger.type}"`,
    );
  }

  const wf = await createWorkflow({
    orgId,
    name: override?.name ?? tpl.name,
    description: tpl.description,
    triggerType,
    triggerConfig: tpl.trigger.config,
    nodes: JSON.parse(JSON.stringify(tpl.nodes)),
    edges: JSON.parse(JSON.stringify(tpl.edges)),
  });
  return wf;
}
