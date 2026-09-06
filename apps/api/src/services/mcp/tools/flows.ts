/**
 * "Which flows are running, how are they doing, and stop that one."
 *
 * Read and control, not authoring. A flow definition is a graph of nodes and
 * edges; editing it through a chat interface would be a worse experience than
 * the canvas that already exists, and a model that gets an edge wrong breaks a
 * running automation silently. So there is no `update_workflow` and no
 * `create_workflow` here.
 *
 * The control that IS here is `pause_workflow`, and only pause. Activating a
 * flow starts sending to everyone who enters it, which is the one action whose
 * mistake cannot be withdrawn; pausing only ever stops messages. That is the
 * same asymmetry the contacts area is built on — a tool may stop a message,
 * never start one — and it is why "resume" is absent even though it is one
 * line away.
 *
 * Node analytics is the reason `get_workflow_performance` is worth having as a
 * tool at all rather than as two API calls: "where do people drop out" is the
 * question, and it needs the per-node numbers next to the totals.
 */

import { z } from 'zod';
import { defineTool, expectOk, ToolError, type ToolContext } from '../registry.js';

interface WorkflowRow {
  id: string;
  name: string;
  status: string;
  triggerType?: string | null;
  totalRuns?: number | null;
  completedRuns?: number | null;
  failedRuns?: number | null;
}

async function listWorkflows(ctx: ToolContext): Promise<WorkflowRow[]> {
  const body = (await expectOk(ctx, '/api/v1/workflows?limit=100')) as { data?: WorkflowRow[] };
  return body.data ?? [];
}

async function resolveWorkflow(ctx: ToolContext, ref: string): Promise<WorkflowRow> {
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  if (isId) {
    const body = (await expectOk(ctx, `/api/v1/workflows/${ref}`)) as { data?: WorkflowRow };
    if (!body.data) throw new ToolError(`No flow ${ref} in this account.`, 404);
    return body.data;
  }

  const all = await listWorkflows(ctx);
  const needle = ref.trim().toLowerCase();
  const exact = all.filter((w) => w.name.toLowerCase() === needle);
  const matches =
    exact.length > 0 ? exact : all.filter((w) => w.name.toLowerCase().includes(needle));

  if (matches.length === 0) throw new ToolError(`No flow in this account matches "${ref}".`, 404);
  if (matches.length > 1) {
    throw new ToolError(
      `"${ref}" matches ${matches.length} flows: ${matches
        .slice(0, 5)
        .map((w) => `${w.name} (${w.id})`)
        .join(', ')}. Ask for one by id.`,
      409,
    );
  }
  return matches[0]!;
}

export const findWorkflows = defineTool({
  name: 'find_workflows',
  description:
    'List the automation flows in this account with their status and trigger. Use it to pick ' +
    'which flow to inspect or pause.',
  input: z.object({
    status: z
      .enum(['draft', 'active', 'inactive', 'archived'])
      .optional()
      .describe('Only flows in this state'),
    name_contains: z.string().optional().describe('Case-insensitive fragment of the flow name'),
  }),
  async run(input, ctx) {
    let rows = await listWorkflows(ctx);
    if (input.status) rows = rows.filter((w) => w.status === input.status);
    if (input.name_contains) {
      const needle = input.name_contains.toLowerCase();
      rows = rows.filter((w) => w.name.toLowerCase().includes(needle));
    }
    if (rows.length === 0) {
      return input.status || input.name_contains
        ? 'No flows in this account match those filters.'
        : 'This account has no flows yet.';
    }
    return `${rows.length} flow(s):\n${rows
      .map(
        (w) =>
          `- ${w.name} — ${w.status}${w.triggerType ? `, trigger ${w.triggerType}` : ''} (id ${w.id})`,
      )
      .join('\n')}`;
  },
});

export const getWorkflowPerformance = defineTool({
  name: 'get_workflow_performance',
  description:
    'How one flow is performing: how many runs started, completed and failed, the revenue it ' +
    'produced, and a per-step breakdown showing where people stop. Accepts an id or the name.',
  input: z.object({
    workflow: z.string().describe('Flow id, or the flow name'),
  }),
  async run(input, ctx) {
    const w = await resolveWorkflow(ctx, input.workflow);

    const overall = (await expectOk(ctx, `/api/v1/workflows/${w.id}/analytics`)) as {
      data?: Record<string, unknown>;
    };
    const a = overall.data ?? {};

    const lines = [
      `"${w.name}" (${w.status}${w.triggerType ? `, trigger ${w.triggerType}` : ''})`,
      `  runs started   ${a.totalRuns ?? w.totalRuns ?? 0}`,
      `  completed      ${a.completedRuns ?? w.completedRuns ?? 0}`,
      `  failed         ${a.failedRuns ?? w.failedRuns ?? 0}`,
    ];
    if (a.conversionRate !== undefined) lines.push(`  conversion     ${String(a.conversionRate)}`);
    if (a.revenue !== undefined) lines.push(`  revenue        ${String(a.revenue)}`);
    if (a.revenuePerRecipient !== undefined) {
      lines.push(`  per recipient  ${String(a.revenuePerRecipient)}`);
    }

    // The per-step numbers are the point of asking. A flow with plenty of runs
    // and nothing completing is a flow stuck on one node, and the totals alone
    // never say which.
    const nodes = (await expectOk(ctx, `/api/v1/workflows/${w.id}/node-analytics`)) as {
      data?: Array<Record<string, unknown>>;
    };
    const steps = nodes.data ?? [];
    if (steps.length > 0) {
      lines.push('', '  by step:');
      for (const s of steps) {
        const id = String(s.nodeId ?? s.id ?? '?');
        const entered = s.entered ?? s.visits ?? 0;
        const waited = s.waited ?? 0;
        const errored = s.errored ?? s.failed ?? 0;
        lines.push(
          `    ${id}: entered ${String(entered)}${Number(waited) ? `, waiting ${String(waited)}` : ''}${
            Number(errored) ? `, errored ${String(errored)}` : ''
          }`,
        );
      }
    }
    return lines.join('\n');
  },
});

export const pauseWorkflow = defineTool({
  name: 'pause_workflow',
  description:
    'Stop a flow from enrolling anyone new and stop it sending. Use it when a flow is misbehaving ' +
    'or a send needs halting. This only stops messages — it cannot start one, and there is ' +
    'deliberately no matching tool to switch a flow back on. It is recorded in the audit log.',
  input: z.object({
    workflow: z.string().describe('Flow id, or the flow name'),
  }),
  async run(input, ctx) {
    const w = await resolveWorkflow(ctx, input.workflow);

    if (w.status !== 'active') {
      // Not an error: what the caller wanted is already true. Saying so stops
      // an assistant from retrying or reporting a failure.
      return `"${w.name}" is ${w.status}, so it is not sending. Nothing changed.`;
    }

    await expectOk(ctx, `/api/v1/workflows/${w.id}/deactivate`, 'POST', {});
    return `"${w.name}" is paused. It will not enrol or send until someone reactivates it in the app.`;
  },
});

export const flowTools = [findWorkflows, getWorkflowPerformance, pauseWorkflow];
