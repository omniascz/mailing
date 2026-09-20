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
  PUBLISHED_WORKFLOW_TEMPLATES,
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
  type TemplateCategory,
} from './registry.js';
import { workflowTriggerTypeEnum, type Workflow } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { materialiseEmailTemplates } from './materialise-emails.js';

import { isHiddenWorkflowTemplate } from './hidden-templates.js';

export { listTemplates, findTemplate, WORKFLOW_TEMPLATES, PUBLISHED_WORKFLOW_TEMPLATES };
export type { WorkflowTemplate, TemplateCategory };

/**
 * Return categories with their template counts — useful for the gallery
 * sidebar so the UI doesn't have to compute aggregates.
 */
export function listCategories(): Array<{ category: TemplateCategory; count: number }> {
  const counts = new Map<TemplateCategory, number>();
  for (const t of PUBLISHED_WORKFLOW_TEMPLATES) {
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
  // A template we do not offer is not forkable by guessing its slug either:
  // the reason it is hidden is that the emails it would send do not match its
  // steps, and that is as true here as in the gallery. Workflows forked before
  // it was hidden are copies of their own and keep working.
  if (!tpl || isHiddenWorkflowTemplate(slug)) throw AppError.notFound('Template');

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

  // The emails this template sends become emails this organisation owns, and
  // each step gets the id of its copy. Before createWorkflow, so a clone that
  // fails leaves no workflow behind.
  const { nodes } = await materialiseEmailTemplates(
    orgId,
    JSON.parse(JSON.stringify(tpl.nodes)) as typeof tpl.nodes,
  );

  const wf = await createWorkflow({
    orgId,
    name: override?.name ?? tpl.name,
    description: tpl.description,
    triggerType,
    triggerConfig: tpl.trigger.config,
    nodes,
    edges: JSON.parse(JSON.stringify(tpl.edges)),
  });
  return wf;
}
