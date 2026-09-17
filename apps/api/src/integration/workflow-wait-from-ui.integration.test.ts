/**
 * A wait step built the way the web app builds one has to be a wait the
 * executor can time.
 *
 * The executor reads `{ duration: number, unit: 'minutes' | 'hours' | 'days' }`
 * (services/workflows/actions.ts:361-370) or an `until`. The "New workflow"
 * form seeded `{ duration: { days: 1, hours: 0 } }` and the editor's wait step
 * wrote the same object shape, so `duration * 86_400_000` was NaN. Measured
 * before the fix: the trigger route answered 200 with a run that had already
 * failed on the wait with "Invalid time value". Every workflow created from the
 * UI broke on its first step. The API stored the object without a word:
 * `nodes` is validated as `{ id, type }` and nothing else.
 *
 * The graphs here are not copies of what the web app sends. They come from the
 * web modules themselves — buildStarterGraph is what the form posts and
 * waitPatch is what the editor merges into a wait node — loaded at runtime by
 * path. A static import would put apps/web under this package's tsc rootDir
 * ("src") and fail the typecheck, and a copied literal would stay green the day
 * the form changes again.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "next_execution_at is a valid date" is also what a run that never reached the
 * wait looks like (it stays null — and null is not finite, but a check that only
 * compared dates could miss it). Every timed case asserts the run is parked ON
 * the wait node with status 'waiting' and no error, that the time is the one
 * the config asked for, and that the wait node's `waited` counter moved. That
 * counter is bumped after executeWait returns and before the run row is written
 * (executor.ts:186-192), so it proves the executor got there — it is 1 on the
 * failing run too, which is why it is never the only assertion.
 *
 * Each refusal is followed by the same request with a timed wait, which must be
 * stored.
 *
 * WHAT THIS TEST CANNOT SEE
 * - It does not click the form or the editor; it runs the functions they call.
 * - Workflows created through import (services/workflows/export.ts) or a
 *   template fork do not pass through the new check; the fork case below shows
 *   the shipped templates still run, not that the check guards that door.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, like, lte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts, workflows, workflowRuns } from '../db/schema/index.js';
import { workflowNodeStats } from '../db/schema/workflow-node-stats.js';
import { FLOW_TEMPLATES } from '../services/workflows/flow-templates.js';
import { WORKFLOW_TEMPLATES } from '../services/workflow-templates/registry.js';

type Graph = {
  nodes: Array<{ id: string; type: string; config: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string; label?: string }>;
};

const WEB_WORKFLOWS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../web/src/app/(dashboard)/workflows',
);

async function webModule<T>(relative: string): Promise<T> {
  return (await import(pathToFileURL(path.join(WEB_WORKFLOWS, relative)).href)) as T;
}

const TAG = `wfwait-${randomUUID().slice(0, 8)}`;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Slack for the time between Date.now() here and in the executor. */
const SLACK = 60_000;

let app: FastifyInstance;
let session: Session;
let contactId: string;

const api = async (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => {
  const res = await app.inject({
    method,
    url,
    headers: { cookie: session.cookie },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
  return { statusCode: res.statusCode, body: res.body, json: () => res.json() };
};

async function createWorkflow(name: string, graph: Graph) {
  return api('POST', '/api/v1/workflows', {
    name: `${TAG} ${name}`,
    triggerType: 'manual',
    nodes: graph.nodes,
    edges: graph.edges,
  });
}

const idOf = (res: { json: () => unknown }) => (res.json() as { data: { id: string } }).data.id;

/** Activate and trigger through the routes; return the run row as stored. */
async function runFor(workflowId: string) {
  const act = await api('POST', `/api/v1/workflows/${workflowId}/activate`, {});
  expect(act.statusCode, `activate: ${act.body}`).toBe(200);
  const before = Date.now();
  const trig = await api('POST', `/api/v1/workflows/${workflowId}/trigger`, { contactId });
  expect(trig.statusCode, `trigger: ${trig.body}`).toBe(200);
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, idOf(trig)));
  return { run: run!, before };
}

async function counters(workflowId: string, nodeId: string) {
  const [row] = await db
    .select({ entered: workflowNodeStats.entered, waited: workflowNodeStats.waited })
    .from(workflowNodeStats)
    .where(and(eq(workflowNodeStats.workflowId, workflowId), eq(workflowNodeStats.nodeId, nodeId)));
  return { entered: row?.entered ?? 0, waited: row?.waited ?? 0 };
}

function expectParkedAt(run: typeof workflowRuns.$inferSelect, nodeId: string, expectedAt: number) {
  expect(run.errorMessage, 'the run failed instead of waiting').toBeNull();
  expect(run.status, 'the run did not park on the wait').toBe('waiting');
  expect(run.currentNodeId).toBe(nodeId);
  const at = run.nextExecutionAt?.getTime();
  expect(Number.isFinite(at), `next_execution_at is ${String(run.nextExecutionAt)}`).toBe(true);
  expect(Math.abs(at! - expectedAt), 'the wait was timed wrong').toBeLessThan(SLACK);
}

/** trigger → wait(config) → add_tag with no tag (a no-op that ends the run). */
const graphWithWait = (config: unknown): Graph => ({
  nodes: [
    { id: 't', type: 'trigger', config: {} },
    { id: 'w1', type: 'wait', config: config as Record<string, unknown> },
    { id: 'a1', type: 'add_tag', config: {} },
  ],
  edges: [
    { id: 'e0', source: 't', target: 'w1' },
    { id: 'e1', source: 'w1', target: 'a1' },
  ],
});

/** What the form and the editor wrote before this change. */
const BROKEN = { duration: { days: 1, hours: 0 } };

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  const [c] = await db
    .insert(contacts)
    .values({ orgId: session.orgId, email: `${TAG}@example.invalid` })
    .returning({ id: contacts.id });
  contactId = c!.id;
}, 120_000);

afterAll(async () => {
  const ids = (
    await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(and(eq(workflows.orgId, session.orgId), like(workflows.name, `${TAG}%`)))
  ).map((r) => r.id);
  if (ids.length) {
    await db.delete(workflowRuns).where(inArray(workflowRuns.workflowId, ids));
    await db.delete(workflows).where(inArray(workflows.id, ids));
  }
  if (contactId) await db.delete(contacts).where(eq(contacts.id, contactId));
  await app?.close();
}, 120_000);

describe('a wait created from the web app is a wait the executor can time', () => {
  it('the New workflow form starter graph parks the run for one day', async () => {
    const { buildStarterGraph } = await webModule<{
      buildStarterGraph: (t: string) => Graph;
    }>('new/starter-graph.ts');

    const created = await createWorkflow('starter', buildStarterGraph('manual'));
    expect(created.statusCode, created.body).toBe(200);
    const id = idOf(created);

    const { run, before } = await runFor(id);
    expectParkedAt(run, 'w1', before + DAY);
    expect((await counters(id, 'w1')).waited, 'executeWait was never reached').toBe(1);
  });

  it('a wait set in the editor to 2 hours parks the run for 2 hours', async () => {
    const { buildStarterGraph } = await webModule<{
      buildStarterGraph: (t: string) => Graph;
    }>('new/starter-graph.ts');
    const { waitPatch } = await webModule<{
      waitPatch: (duration: number, unit: string) => Record<string, unknown>;
    }>('wait-config.ts');

    const graph = buildStarterGraph('manual');
    const created = await createWorkflow('edited', graph);
    expect(created.statusCode, created.body).toBe(200);
    const id = idOf(created);

    // workflow-editor.tsx updateNodeConfig: { ...n.config, ...patch }
    const nodes = graph.nodes.map((n) =>
      n.id === 'w1' ? { ...n, config: { ...n.config, ...waitPatch(2, 'hours') } } : n,
    );
    const saved = await api('PUT', `/api/v1/workflows/${id}`, { nodes, edges: graph.edges });
    expect(saved.statusCode, saved.body).toBe(200);

    const { run, before } = await runFor(id);
    expectParkedAt(run, 'w1', before + 2 * HOUR);
    expect((await counters(id, 'w1')).waited, 'executeWait was never reached').toBe(1);
  });
});

describe('the API does not store a wait the executor cannot time', () => {
  it('POST refuses the old shape and stores nothing; the same graph with a timed wait is stored', async () => {
    const name = 'refused-post';
    const byName = () =>
      db
        .select({ id: workflows.id })
        .from(workflows)
        .where(and(eq(workflows.orgId, session.orgId), eq(workflows.name, `${TAG} ${name}`)));

    const refused = await createWorkflow(name, graphWithWait(BROKEN));
    expect(refused.statusCode, refused.body).toBe(400);
    expect((refused.json() as { code: string }).code).toBe('INVALID_WAIT_CONFIG');
    expect(await byName(), 'a refused workflow was written').toHaveLength(0);

    // The case that must write: a route refusing everything fails here.
    const stored = await createWorkflow(name, graphWithWait({ duration: 1, unit: 'days' }));
    expect(stored.statusCode, stored.body).toBe(200);
    expect(await byName()).toHaveLength(1);
  });

  it('PUT refuses the old shape and leaves the stored graph as it was', async () => {
    const created = await createWorkflow(
      'refused-put',
      graphWithWait({ duration: 3, unit: 'hours' }),
    );
    expect(created.statusCode, created.body).toBe(200);
    const id = idOf(created);

    const put = await api('PUT', `/api/v1/workflows/${id}`, graphWithWait(BROKEN));
    expect(put.statusCode, put.body).toBe(400);
    expect((put.json() as { code: string }).code).toBe('INVALID_WAIT_CONFIG');

    const [row] = await db
      .select({ nodes: workflows.nodes })
      .from(workflows)
      .where(eq(workflows.id, id));
    const wait = (row!.nodes as Graph['nodes']).find((n) => n.id === 'w1');
    expect(wait?.config).toEqual({ duration: 3, unit: 'hours' });

    // A PUT without nodes has nothing to check and still writes.
    const rename = await api('PUT', `/api/v1/workflows/${id}`, { name: `${TAG} renamed` });
    expect(rename.statusCode, rename.body).toBe(200);
    const [renamed] = await db
      .select({ name: workflows.name })
      .from(workflows)
      .where(eq(workflows.id, id));
    expect(renamed!.name).toBe(`${TAG} renamed`);
  });
});

describe('what already worked keeps working', () => {
  it('templates with until waits, and a flow template, are accepted through the same route', async () => {
    const withUntil = WORKFLOW_TEMPLATES.filter((t) =>
      t.nodes.some((n) => n.type === 'wait' && (n.config as { until?: unknown }).until),
    );
    // event-webinar-reminder, post-purchase-shipping-update, event-in-person-prep
    expect(withUntil.length).toBeGreaterThanOrEqual(3);
    for (const t of withUntil) {
      const res = await createWorkflow(`until ${t.slug}`, t as unknown as Graph);
      expect(res.statusCode, `${t.slug}: ${res.body}`).toBe(200);
    }

    const flow = FLOW_TEMPLATES.find((t) => t.id === 'abandoned-cart')!;
    const res = await createWorkflow('flow abandoned-cart', flow as unknown as Graph);
    expect(res.statusCode, res.body).toBe(200);
  });

  it('a workflow forked from a template waits as long as the template says', async () => {
    const slug = 'abandoned-cart-3-touch';
    const tpl = WORKFLOW_TEMPLATES.find((t) => t.slug === slug)!;
    const trigger = tpl.nodes.find((n) => n.type === 'trigger')!;
    const firstId = tpl.edges.find((e) => e.source === trigger.id)!.target;
    const first = tpl.nodes.find((n) => n.id === firstId)!;
    expect(first.type, 'the template no longer starts with a wait').toBe('wait');
    const { duration, unit } = first.config as { duration: number; unit: string };
    const ms = duration * (unit === 'minutes' ? 60_000 : unit === 'hours' ? HOUR : DAY);

    const fork = await api('POST', `/api/v1/workflow-templates/${slug}/fork`, {
      name: `${TAG} fork`,
    });
    expect(fork.statusCode, fork.body).toBe(201);
    const id = idOf(fork);

    const { run, before } = await runFor(id);
    expectParkedAt(run, firstId, before + ms);
    expect((await counters(id, firstId)).waited).toBe(1);
  });

  it('a zero wait is due at once, and the run moves on when resumed', async () => {
    const created = await createWorkflow('zero', graphWithWait({ duration: 0, unit: 'hours' }));
    expect(created.statusCode, created.body).toBe(200);
    const id = idOf(created);

    const { run, before } = await runFor(id);
    expectParkedAt(run, 'w1', before);

    // Due by the scheduler's own predicate (executor.ts processWorkflowRuns).
    const [due] = await db
      .select({ id: workflowRuns.id })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.id, run.id),
          eq(workflowRuns.status, 'waiting'),
          lte(workflowRuns.nextExecutionAt, new Date()),
        ),
      );
    expect(due, 'a zero wait is not due').toBeDefined();

    // Resumed directly: processWorkflowRuns would also resume every other due
    // run in the shared database.
    const { resumeWorkflowRun } = await import('../services/workflows/executor.js');
    await resumeWorkflowRun(run.id);

    const [after] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, run.id));
    expect(after!.errorMessage).toBeNull();
    expect(after!.status).toBe('completed');
    expect((await counters(id, 'a1')).entered, 'the step after the wait was never run').toBe(1);
  });
});
