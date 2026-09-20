/**
 * Turning a template's email steps into emails the organisation owns.
 *
 * A `send_email` step in a shipped template names a built-in email by its
 * catalogue id (`builtInTemplateId`, see email-content.ts). The executor cannot
 * send that: it passes `templateId` to the queue, and the handler looks that up
 * in `templates` scoped to the organisation (routes/v1/internal/workflow-
 * dispatch.ts). So at fork time each named email is cloned into the
 * organisation and the step gets the new row's UUID.
 *
 * Failure is not survivable here and must not be swallowed: a flow saved with
 * a step that has no `templateId` is exactly the workflow this whole change
 * exists to stop shipping — it looks built and fails on the first send. So a
 * clone that fails aborts the fork before anything is written, and the caller
 * sees why.
 *
 * One clone per built-in per fork: a three-step series that names the same
 * email twice gets one row, and `reuseExisting` means a second fork of the same
 * category reuses the rows the first one made rather than filling the
 * customer's template list with copies.
 */

import type { WorkflowNode } from '../../db/schema/workflows.js';
import { AppError } from '../../lib/app-error.js';
import { cloneBuiltInTemplate } from '../templates/clone-built-in.js';
import { BUILT_IN_EMAIL_KEY } from './email-content.js';

export interface MaterialisedEmails {
  nodes: WorkflowNode[];
  /** built-in id → the template row this organisation now owns. */
  cloned: Map<string, string>;
}

export async function materialiseEmailTemplates(
  orgId: string,
  nodes: WorkflowNode[],
): Promise<MaterialisedEmails> {
  const cloned = new Map<string, string>();
  const out: WorkflowNode[] = [];

  for (const node of nodes) {
    const config = node.config as Record<string, unknown>;
    const builtInId = config[BUILT_IN_EMAIL_KEY];

    if (node.type !== 'send_email' || typeof builtInId !== 'string' || config.templateId) {
      out.push(node);
      continue;
    }

    let templateId = cloned.get(builtInId);
    if (!templateId) {
      try {
        const row = await cloneBuiltInTemplate(orgId, builtInId, { reuseExisting: true });
        templateId = row.id;
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw AppError.internal(
          `Could not copy the email "${builtInId}" this template sends: ${(err as Error).message}`,
        );
      }
      cloned.set(builtInId, templateId);
    }

    out.push({ ...node, config: { ...config, templateId } });
  }

  return { nodes: out, cloned };
}
