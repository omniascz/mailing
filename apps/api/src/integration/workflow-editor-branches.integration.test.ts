/**
 * What the step editor does to a branched flow, run against a real executor.
 *
 * The editor shows one linear spine and lists the branches below it. Its edits
 * used to ignore the labels on the edges:
 *
 *   - inserting a step on a condition's `true` edge replaced that edge with two
 *     unlabelled ones, so `resolveNextNode` found no edge for the branch and
 *     the run ended at the condition;
 *   - inserting after a node with two branches added a third, unlabelled edge:
 *     the API stores it (it breaks no rule from #192) and the executor never
 *     takes it, so the new step never runs;
 *   - deleting a branching node kept its first branch and stranded the other.
 *
 * The operations now live in apps/web .../workflows/graph-ops.ts and are loaded
 * here by path, so this runs the same functions the editor calls — a static
 * import would put apps/web under this package's tsc rootDir.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * A saved graph proves nothing on its own: the broken shapes above were stored
 * happily. Each case therefore runs a contact through the workflow and asserts
 * which steps were entered — including that the step added on the branch was
 * one of them.
 *
 * WHAT THIS TEST CANNOT SEE
 * - It does not click the editor. It calls the functions behind the buttons,
 *   and the web unit test (graph-ops.test.ts) covers the same functions.
 * - The UI hides the insert slot and the remove button at a fork; that is the
 *   web side and is not asserted here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts, workflows, workflowRuns } from '../db/schema/index.js';
import { workflowNodeStats } from '../db/schema/workflow-node-stats.js';

type GNode = { id: string; type: string; config: Record<string, unknown> };
type GEdge = { id: string; source: string; target: string; label?: string };
type Graph = { nodes: GNode[]; edges: GEdge[] };

interface GraphOps {
  insertAfter: (g: Graph, afterNodeId: string, node: GNode) => Graph;
  deleteNode: (g: Graph, nodeId: string) => Graph;
  whyNotInsertAfter: (edges: GEdge[], nodeId: string) => string | null;
  whyNotDelete: (node: GNode, edges: GEdge[]) => string | null;
  freshNodeId: () => string;
}

const ops: GraphOps = (await import(
  pathToFileURL(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../web/src/app/(dashboard)/workflows/graph-ops.ts',
    ),
  ).href
)) as unknown as GraphOps;

const TAG = `wfedit-${randomUUID().slice(0, 8)}`;

/** trigger → condition(email is set) ⇒ add_tag yes | add_tag no */
const branched = (): Graph => ({
  nodes: [
    { id: 't', type: 'trigger', config: {} },
    { id: 'c', type: 'condition', config: { field: 'email', op: 'is_set' } },
    { id: 'yes', type: 'add_tag', config: { tagName: `${TAG}-yes` } },
    { id: 'no', type: 'add_tag', config: { tagName: `${TAG}-no` } },
  ],
  edges: [
    { id: 'e0', source: 't', target: 'c' },
    { id: 'e1', source: 'c', target: 'yes', label: 'true' },
    { id: 'e2', source: 'c', target: 'no', label: 'false' },
  ],
});

let app: FastifyInstance;
let session: Session;
let contactId: string;

const api = async (method: 'POST' | 'PUT', url: string, payload?: unknown) => {
  const res = await app.inject({
    method,
    url,
    headers: { cookie: session.cookie },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
  return { statusCode: res.statusCode, body: res.body, json: () => res.json() };
};

const idOf = (res: { json: () => unknown }) => (res.json() as { data: { id: string } }).data.id;

async function create(name: string, graph: Graph): Promise<string> {
  const res = await api('POST', '/api/v1/workflows', {
    name: `${TAG} ${name}`,
    triggerType: 'manual',
    nodes: graph.nodes,
    edges: graph.edges,
  });
  expect(res.statusCode, res.body).toBe(200);
  return idOf(res);
}

async function storedGraph(workflowId: string): Promise<Graph> {
  const [row] = await db
    .select({ nodes: workflows.nodes, edges: workflows.edges })
    .from(workflows)
    .where(eq(workflows.id, workflowId));
  return { nodes: row!.nodes as GNode[], edges: row!.edges as GEdge[] };
}

/** Which steps a contact actually went through, by node id. */
async function entered(workflowId: string): Promise<string[]> {
  const rows = await db
    .select({ nodeId: workflowNodeStats.nodeId, n: workflowNodeStats.entered })
    .from(workflowNodeStats)
    .where(eq(workflowNodeStats.workflowId, workflowId));
  return rows
    .filter((r) => r.n > 0)
    .map((r) => r.nodeId)
    .sort();
}

async function run(workflowId: string) {
  const act = await api('POST', `/api/v1/workflows/${workflowId}/activate`, {});
  expect(act.statusCode, `activate: ${act.body}`).toBe(200);
  const trig = await api('POST', `/api/v1/workflows/${workflowId}/trigger`, { contactId });
  expect(trig.statusCode, `trigger: ${trig.body}`).toBe(200);
  const [row] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, idOf(trig)));
  return row!;
}

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

describe('a step added on a branch is actually run', () => {
  it('inserting on the true branch keeps the label, and the new step runs', async () => {
    const id = await create('insert-on-branch', branched());

    // The editor's own operation: add a step between the condition and `yes`.
    const step: GNode = {
      id: ops.freshNodeId(),
      type: 'add_tag',
      config: { tagName: `${TAG}-added` },
    };
    const edited = ops.insertAfter(await storedGraph(id), 'yes', step);

    const saved = await api('PUT', `/api/v1/workflows/${id}`, {
      nodes: edited.nodes,
      edges: edited.edges,
    });
    expect(saved.statusCode, saved.body).toBe(200);

    const stored = await storedGraph(id);
    const branchEdge = stored.edges.find((e) => e.label === 'true');
    expect(branchEdge?.target, 'the true branch lost its label or its target').toBe('yes');

    const runRow = await run(id);
    expect(runRow.errorMessage).toBeNull();
    // The contact has an email, so: condition → yes → the added step.
    expect(await entered(id)).toEqual(['c', step.id, 'yes'].sort());
  });

  it('inserting after a one-sided condition keeps the branch pointing at the new step', async () => {
    const id = await create('insert-one-sided', {
      nodes: [
        { id: 't', type: 'trigger', config: {} },
        { id: 'c', type: 'condition', config: { field: 'email', op: 'is_set' } },
        { id: 'mail', type: 'add_tag', config: { tagName: `${TAG}-mail` } },
      ],
      edges: [
        { id: 'e0', source: 't', target: 'c' },
        { id: 'e1', source: 'c', target: 'mail', label: 'true' },
      ],
    });

    const step: GNode = { id: ops.freshNodeId(), type: 'add_tag', config: { tagName: `${TAG}-x` } };
    const edited = ops.insertAfter(await storedGraph(id), 'c', step);
    const saved = await api('PUT', `/api/v1/workflows/${id}`, {
      nodes: edited.nodes,
      edges: edited.edges,
    });
    expect(saved.statusCode, saved.body).toBe(200);

    const stored = await storedGraph(id);
    expect(stored.edges.find((e) => e.source === 'c')?.label, 'the branch lost its label').toBe(
      'true',
    );

    const runRow = await run(id);
    expect(runRow.errorMessage).toBeNull();
    expect(await entered(id)).toEqual(['c', step.id, 'mail'].sort());
  });

  it('deleting a step on a branch leaves the branch working', async () => {
    const id = await create('delete-on-branch', branched());
    const withStep = ops.insertAfter(await storedGraph(id), 'yes', {
      id: 'extra',
      type: 'add_tag',
      config: { tagName: `${TAG}-extra` },
    });
    const edited = ops.deleteNode(withStep, 'yes');
    const saved = await api('PUT', `/api/v1/workflows/${id}`, {
      nodes: edited.nodes,
      edges: edited.edges,
    });
    expect(saved.statusCode, saved.body).toBe(200);

    const stored = await storedGraph(id);
    expect(stored.nodes.map((n) => n.id).sort()).toEqual(['c', 'extra', 'no', 't']);
    expect(stored.edges.find((e) => e.label === 'true')?.target).toBe('extra');
    expect(stored.edges.find((e) => e.label === 'false')?.target).toBe('no');

    const runRow = await run(id);
    expect(runRow.errorMessage).toBeNull();
    expect(await entered(id)).toEqual(['c', 'extra'].sort());
  });
});

describe('the fork itself is left alone', () => {
  it('the operations refuse to insert after or delete a branching node', async () => {
    const graph = branched();
    expect(ops.whyNotInsertAfter(graph.edges, 'c')).toContain('branches');
    expect(ops.whyNotDelete(graph.nodes[1]!, graph.edges)).toContain('branches');
    expect(() =>
      ops.insertAfter(graph, 'c', { id: 'x', type: 'add_tag', config: {} }),
    ).toThrowError();
    expect(() => ops.deleteNode(graph, 'c')).toThrowError();
  });

  it('a linear flow is still edited as before, and runs', async () => {
    const id = await create('linear', {
      nodes: [
        { id: 't', type: 'trigger', config: {} },
        { id: 'a', type: 'add_tag', config: { tagName: `${TAG}-a` } },
      ],
      edges: [{ id: 'e0', source: 't', target: 'a' }],
    });
    const step: GNode = { id: ops.freshNodeId(), type: 'add_tag', config: { tagName: `${TAG}-b` } };
    const edited = ops.insertAfter(await storedGraph(id), 'a', step);
    const saved = await api('PUT', `/api/v1/workflows/${id}`, {
      nodes: edited.nodes,
      edges: edited.edges,
    });
    expect(saved.statusCode, saved.body).toBe(200);

    const runRow = await run(id);
    expect(runRow.errorMessage).toBeNull();
    expect(runRow.status).toBe('completed');
    expect(await entered(id)).toEqual(['a', step.id].sort());
  });
});
