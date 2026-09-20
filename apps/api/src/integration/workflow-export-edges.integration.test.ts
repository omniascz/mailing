/**
 * An exported workflow has to arrive as the same flow.
 *
 * `exportWorkflow` declared an `edges` field and always sent it empty
 * (services/workflows/export.ts, since the file was written — no comment, no
 * commit message about it), and `importWorkflow` never read one. Measured
 * before this change: exporting a four-node branched workflow produced
 * `edges: []`, and the import stored four nodes with nothing joining them. A
 * run on that workflow stops at the trigger.
 *
 * Node ids are regenerated on import, so the edges have to follow them through
 * the same map — which is also why this cannot be asserted by counting edges
 * alone. The case below asserts what each edge points AT, by node type, and
 * then runs both workflows and compares which branch the contact took.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "the imported workflow behaves like the original" is also what two equally
 * dead workflows look like, so the branch assertions demand that the condition
 * and the step on the true branch were entered, and that the false branch was
 * not.
 *
 * WHAT THIS TEST CANNOT SEE
 * - The blob's checksum covers the workflow name, so a test cannot rename a
 *   blob before importing it; the imported row is found by the "(imported)"
 *   name the service gives it.
 * - It does not cover the marketplace publish/fork path.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts, workflows, workflowRuns } from '../db/schema/index.js';
import { workflowNodeStats } from '../db/schema/workflow-node-stats.js';

const TAG = `wfexp-${randomUUID().slice(0, 8)}`;

type Node = { id: string; type: string; config: Record<string, unknown> };
type Edge = { id: string; source: string; target: string; label?: string };

/** trigger → condition(email is set) → add_tag yes | add_tag no */
const BRANCHED = {
  nodes: [
    { id: 't', type: 'trigger', config: {} },
    { id: 'c1', type: 'condition', config: { field: 'email', op: 'is_set' } },
    { id: 'yes', type: 'add_tag', config: { tagName: `${TAG}-yes` } },
    { id: 'no', type: 'add_tag', config: { tagName: `${TAG}-no` } },
  ] as Node[],
  edges: [
    { id: 'e0', source: 't', target: 'c1' },
    { id: 'e1', source: 'c1', target: 'yes', label: 'true' },
    { id: 'e2', source: 'c1', target: 'no', label: 'false' },
  ] as Edge[],
};

let app: FastifyInstance;
let session: Session;
let contactId: string;

const api = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
  const res = await app.inject({
    method,
    url,
    headers: { cookie: session.cookie },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
  return { statusCode: res.statusCode, body: res.body, json: () => res.json() };
};

const idOf = (res: { json: () => unknown }) => (res.json() as { data: { id: string } }).data.id;

async function graphOf(workflowId: string) {
  const [row] = await db
    .select({ nodes: workflows.nodes, edges: workflows.edges })
    .from(workflows)
    .where(eq(workflows.id, workflowId));
  return { nodes: row!.nodes as Node[], edges: row!.edges as Edge[] };
}

/** Each edge as "<source type> -[label]-> <target type>", so ids don't matter. */
function wiring(nodes: Node[], edges: Edge[]): string[] {
  const label = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    if (!n) return `MISSING(${id})`;
    return n.type === 'add_tag' ? `add_tag:${String(n.config.tagName).slice(-3)}` : n.type;
  };
  return edges.map((e) => `${label(e.source)} -[${e.label ?? ''}]-> ${label(e.target)}`).sort();
}

/** Which steps a contact actually went through, by node type. */
async function enteredTypes(workflowId: string): Promise<string[]> {
  const { nodes } = await graphOf(workflowId);
  const stats = await db
    .select({ nodeId: workflowNodeStats.nodeId, entered: workflowNodeStats.entered })
    .from(workflowNodeStats)
    .where(eq(workflowNodeStats.workflowId, workflowId));
  return stats
    .filter((s) => s.entered > 0)
    .map((s) => {
      const n = nodes.find((x) => x.id === s.nodeId);
      return n?.type === 'add_tag'
        ? `add_tag:${String(n.config.tagName).slice(-3)}`
        : (n?.type ?? s.nodeId);
    })
    .sort();
}

async function runIt(workflowId: string) {
  const act = await api('POST', `/api/v1/workflows/${workflowId}/activate`, {});
  expect(act.statusCode, `activate: ${act.body}`).toBe(200);
  const trig = await api('POST', `/api/v1/workflows/${workflowId}/trigger`, { contactId });
  expect(trig.statusCode, `trigger: ${trig.body}`).toBe(200);
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, idOf(trig)));
  return run!;
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

describe('export → import', () => {
  it('carries the edges over, pointing at the same steps, and the run takes the same branch', async () => {
    const created = await api('POST', '/api/v1/workflows', {
      name: `${TAG} branched`,
      triggerType: 'manual',
      nodes: BRANCHED.nodes,
      edges: BRANCHED.edges,
    });
    expect(created.statusCode, created.body).toBe(200);
    const sourceId = idOf(created);

    const exported = await api('GET', `/api/v1/workflows/${sourceId}/export`);
    expect(exported.statusCode, exported.body).toBe(200);
    const blob = JSON.parse(exported.body) as {
      workflow: { nodes: Node[]; edges: Edge[] };
    };
    expect(blob.workflow.edges, 'the export dropped the edges').toHaveLength(3);
    // sort() compares as strings, so an unlabelled edge lands between them.
    expect(blob.workflow.edges.map((e) => e.label ?? null).sort()).toEqual(['false', null, 'true']);

    const imported = await api('POST', '/api/v1/workflows/import', blob);
    expect(imported.statusCode, imported.body).toBe(201);
    const importedId = idOf(imported);

    const source = await graphOf(sourceId);
    const copy = await graphOf(importedId);

    // Ids are regenerated, so compare what the edges point at, not the ids.
    expect(copy.nodes.map((n) => n.id).sort()).not.toEqual(source.nodes.map((n) => n.id).sort());
    expect(wiring(copy.nodes, copy.edges)).toEqual(wiring(source.nodes, source.edges));
    expect(wiring(copy.nodes, copy.edges)).toEqual([
      'condition -[false]-> add_tag:-no',
      'condition -[true]-> add_tag:yes',
      'trigger -[]-> condition',
    ]);
    // Nothing points outside the imported workflow.
    const ids = new Set(copy.nodes.map((n) => n.id));
    for (const e of copy.edges) {
      expect(ids.has(e.source) && ids.has(e.target), `edge ${e.id} left the workflow`).toBe(true);
    }
    expect(new Set(copy.edges.map((e) => e.id)).size).toBe(3);

    // And it runs the same way: the contact has an email, so both take 'true'.
    const sourceRun = await runIt(sourceId);
    const copyRun = await runIt(importedId);
    expect(sourceRun.errorMessage).toBeNull();
    expect(copyRun.errorMessage).toBeNull();
    expect(copyRun.status).toBe(sourceRun.status);

    const sourceSteps = await enteredTypes(sourceId);
    expect(sourceSteps, 'the original never reached the branch').toEqual([
      'add_tag:yes',
      'condition',
    ]);
    expect(await enteredTypes(importedId)).toEqual(sourceSteps);
  });

  it('a blob from before this change, with no edges, still imports', async () => {
    const old = {
      version: '1.0',
      workflow: {
        name: `${TAG} old-blob`,
        description: null,
        triggerType: 'manual',
        triggerConfig: {},
        nodes: [{ id: 't', type: 'trigger', config: {} }],
        edges: [],
      },
    };
    const res = await api('POST', '/api/v1/workflows/import', old);
    expect(res.statusCode, res.body).toBe(201);
    const { nodes, edges } = await graphOf(idOf(res));
    expect(nodes).toHaveLength(1);
    expect(edges).toEqual([]);
  });

  it('a one-step workflow survives the round trip', async () => {
    const created = await api('POST', '/api/v1/workflows', {
      name: `${TAG} single`,
      triggerType: 'manual',
      nodes: [{ id: 't', type: 'trigger', config: {} }],
      edges: [],
    });
    expect(created.statusCode, created.body).toBe(200);

    const exported = await api('GET', `/api/v1/workflows/${idOf(created)}/export`);
    const imported = await api('POST', '/api/v1/workflows/import', JSON.parse(exported.body));
    expect(imported.statusCode, imported.body).toBe(201);
    const { nodes, edges } = await graphOf(idOf(imported));
    expect(nodes).toHaveLength(1);
    expect(edges).toEqual([]);
  });
});
