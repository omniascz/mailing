/**
 * The per-step breakdown, produced by running the real engine.
 *
 * Not a unit test on the counter writer: that would pass on a workflow engine
 * that never calls it. Every number below comes from `startWorkflowRun` /
 * `resumeWorkflowRun` driving real nodes against a real database, and is then
 * read back through the HTTP route a browser would call.
 *
 * Three of these are about the numbers NOT being one number. "Did not continue"
 * is a wait, a designed ending and a failure, and folding them together would
 * turn a healthy flow into a broken-looking one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  contacts,
  organizations,
  tags,
  contactTags,
  users,
  workflows,
  workflowRuns,
  workflowNodeStats,
} from '../db/schema/index.js';
import { startWorkflowRun, resumeWorkflowRun } from '../services/workflows/executor.js';

let app: FastifyInstance;
let session: Session;

const tag = randomUUID().slice(0, 8);
let orgId: string;
let otherOrg: string;
let otherWorkflow: string;
let plainContact: string;
let vipContact: string;

const createdWorkflows: string[] = [];
const createdContacts: string[] = [];

interface NodeRow {
  nodeId: string;
  type: string;
  recorded: boolean;
  entered: number;
  advanced: number;
  branchedTrue: number;
  branchedFalse: number;
  waited: number;
  resumed: number;
  endedHere: number;
  failedHere: number;
  currentlyHere: number;
}
interface Breakdown {
  hasData: boolean;
  runsPredatingTracking: number;
  trackingSince: string | null;
  nodes: NodeRow[];
}

async function makeWorkflow(
  name: string,
  nodes: unknown[],
  edges: unknown[],
  owner = orgId,
): Promise<string> {
  const [row] = await db
    .insert(workflows)
    .values({
      orgId: owner,
      name: `${name} ${tag}`,
      status: 'active',
      triggerType: 'manual',
      nodes: nodes as never,
      edges: edges as never,
    })
    .returning({ id: workflows.id });
  createdWorkflows.push(row!.id);
  return row!.id;
}

async function breakdown(workflowId: string): Promise<Breakdown> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/workflows/${workflowId}/node-analytics`,
    headers: { cookie: session.cookie },
  });
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as { data: Breakdown }).data;
}

const node = (id: string, type: string, config: Record<string, unknown> = {}) => ({
  id,
  type,
  config,
});
const edge = (source: string, target: string, label?: string) => ({
  id: `${source}-${target}`,
  source,
  target,
  ...(label ? { label } : {}),
});

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  orgId = session.orgId;

  const mkContact = async (email: string) => {
    const [c] = await db
      .insert(contacts)
      .values({ orgId, email, status: 'active' })
      .returning({ id: contacts.id });
    createdContacts.push(c!.id);
    return c!.id;
  };
  plainContact = await mkContact(`wfna-plain-${tag}@test.local`);
  vipContact = await mkContact(`wfna-vip-${tag}@test.local`);

  // Two tags with different jobs: VIP is what the condition asks about and only
  // one contact has it; STEP is what the add_tag nodes hand out. Sharing one
  // tag between them let an earlier test's add_tag decide a later test's fork.
  const [vipTag] = await db
    .insert(tags)
    .values({ orgId, name: `VIP-${tag}` })
    .returning({ id: tags.id });
  await db.insert(tags).values({ orgId, name: `STEP-${tag}` });
  await db.insert(contactTags).values({ contactId: vipContact, tagId: vipTag!.id });

  const [other] = await db
    .insert(organizations)
    .values({ name: `wfna-other-${tag}`, slug: `wfna-other-${tag}` })
    .returning({ id: organizations.id });
  otherOrg = other!.id;
  otherWorkflow = await makeWorkflow('their flow', [node('t', 'trigger')], [], otherOrg);
  // A counter row of theirs, so "cannot read it" is a real assertion and not
  // an empty table trivially looking empty.
  await db.insert(workflowNodeStats).values({
    orgId: otherOrg,
    workflowId: otherWorkflow,
    nodeId: 't',
    entered: 41,
  });
}, 120_000);

afterAll(async () => {
  if (createdWorkflows.length) {
    await db.delete(workflowRuns).where(inArray(workflowRuns.workflowId, createdWorkflows));
    await db
      .delete(workflowNodeStats)
      .where(inArray(workflowNodeStats.workflowId, createdWorkflows));
    await db.delete(workflows).where(inArray(workflows.id, createdWorkflows));
  }
  if (createdContacts.length)
    await db.delete(contacts).where(inArray(contacts.id, createdContacts));
  await db.delete(tags).where(eq(tags.orgId, orgId));
  await db.delete(users).where(eq(users.orgId, otherOrg));
  await db.delete(organizations).where(eq(organizations.id, otherOrg));
  await app?.close();
}, 120_000);

describe('a real run produces the breakdown', () => {
  it('records each step as the contact passes through it', async () => {
    const wf = await makeWorkflow(
      'linear',
      [
        node('t', 'trigger'),
        node('a', 'add_tag', { tagName: `STEP-${tag}` }),
        node('w', 'wait', { duration: 1, unit: 'days' }),
        node('b', 'add_tag', { tagName: `STEP-${tag}` }),
      ],
      [edge('t', 'a'), edge('a', 'w'), edge('w', 'b')],
    );

    const run = await startWorkflowRun(wf, orgId, plainContact);

    const before = await breakdown(wf);
    expect(before.hasData).toBe(true);
    const byId = new Map(before.nodes.map((n) => [n.nodeId, n]));

    // Passed through and moved on.
    expect(byId.get('a')).toMatchObject({ recorded: true, entered: 1, advanced: 1, waited: 0 });

    // Parked. Not advanced, not ended, not failed — and visible as "here now".
    expect(byId.get('w')).toMatchObject({
      recorded: true,
      entered: 1,
      waited: 1,
      resumed: 0,
      advanced: 0,
      endedHere: 0,
      failedHere: 0,
      currentlyHere: 1,
    });

    // Never reached: no row at all, which is not the same as zeros.
    expect(byId.get('b')?.recorded).toBe(false);

    // Let the timer fire.
    await resumeWorkflowRun(run.id);

    const after = await breakdown(wf);
    const then = new Map(after.nodes.map((n) => [n.nodeId, n]));
    expect(then.get('w')).toMatchObject({ waited: 1, resumed: 1, currentlyHere: 0 });
    // The last node has no outgoing edge, so the run finishes there.
    expect(then.get('b')).toMatchObject({ recorded: true, entered: 1, endedHere: 1, advanced: 0 });
  }, 120_000);
});

describe('the three ways of not continuing stay three numbers', () => {
  it('a branch is not a drop-out, and a failure is not an ending', async () => {
    const wf = await makeWorkflow(
      'forked',
      [
        node('t', 'trigger'),
        node('c', 'condition', { field: 'has_tag', value: `VIP-${tag}` }),
        // The true side fails: send_sms refuses without message text.
        node('boom', 'send_sms', {}),
        // The false side simply ends — no edge leads out of it.
        node('end', 'add_tag', { tagName: `STEP-${tag}` }),
      ],
      [edge('t', 'c'), edge('c', 'boom', 'true'), edge('c', 'end', 'false')],
    );

    await startWorkflowRun(wf, orgId, vipContact); // has the tag → true → fails
    await startWorkflowRun(wf, orgId, plainContact); // no tag → false → ends

    const b = await breakdown(wf);
    const byId = new Map(b.nodes.map((n) => [n.nodeId, n]));

    const condition = byId.get('c')!;
    // Both contacts got through the fork. Neither "dropped" at it: one went
    // each way, and the two directions are counted apart.
    expect(condition).toMatchObject({
      entered: 2,
      advanced: 2,
      branchedTrue: 1,
      branchedFalse: 1,
      endedHere: 0,
      failedHere: 0,
      waited: 0,
    });

    // A failure is only a failure.
    expect(byId.get('boom')).toMatchObject({
      entered: 1,
      failedHere: 1,
      endedHere: 0,
      waited: 0,
      advanced: 0,
    });

    // An ending is only an ending.
    expect(byId.get('end')).toMatchObject({
      entered: 1,
      endedHere: 1,
      failedHere: 0,
      waited: 0,
      advanced: 0,
    });

    // And the payload offers no single number that merges them: a caller
    // cannot accidentally render "2 lost" for a flow where nothing was lost.
    for (const n of b.nodes) {
      expect(Object.keys(n)).not.toContain('dropped');
      expect(Object.keys(n)).not.toContain('lost');
      expect(Object.keys(n)).not.toContain('didNotContinue');
    }
  }, 120_000);

  it('a wait is not counted as an ending even while nobody moves', async () => {
    const wf = await makeWorkflow(
      'parked',
      [
        node('t', 'trigger'),
        node('w', 'wait', { duration: 30, unit: 'days' }),
        node('after', 'add_tag', { tagName: `STEP-${tag}` }),
      ],
      [edge('t', 'w'), edge('w', 'after')],
    );
    await startWorkflowRun(wf, orgId, plainContact);

    const b = await breakdown(wf);
    const w = b.nodes.find((n) => n.nodeId === 'w')!;
    expect(w.waited).toBe(1);
    expect(w.endedHere).toBe(0);
    expect(w.failedHere).toBe(0);
    expect(w.currentlyHere).toBe(1);
  }, 120_000);
});

describe('runs that predate the counters', () => {
  it('report no data rather than zero', async () => {
    const wf = await makeWorkflow(
      'historical',
      [node('t', 'trigger'), node('a', 'add_tag', { tagName: `STEP-${tag}` })],
      [edge('t', 'a')],
    );
    // A run from before step tracking existed: a row, no counters.
    await db.insert(workflowRuns).values({
      workflowId: wf,
      orgId,
      contactId: plainContact,
      status: 'completed',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    const b = await breakdown(wf);
    expect(b.hasData, 'a workflow with no counters must not claim to have data').toBe(false);
    expect(b.runsPredatingTracking).toBe(1);
    expect(b.trackingSince).toBeNull();
    for (const n of b.nodes) expect(n.recorded).toBe(false);
  }, 120_000);

  it('are counted separately once tracking starts, not folded in', async () => {
    const wf = await makeWorkflow(
      'mixed',
      [node('t', 'trigger'), node('a', 'add_tag', { tagName: `STEP-${tag}` })],
      [edge('t', 'a')],
    );
    await db.insert(workflowRuns).values({
      workflowId: wf,
      orgId,
      contactId: plainContact,
      status: 'completed',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    await startWorkflowRun(wf, orgId, plainContact);

    const b = await breakdown(wf);
    expect(b.hasData).toBe(true);
    // One measured run at the node…
    expect(b.nodes.find((n) => n.nodeId === 'a')).toMatchObject({ recorded: true, entered: 1 });
    // …and one the report admits it cannot speak for.
    expect(b.runsPredatingTracking).toBe(1);
    expect(b.trackingSince).not.toBeNull();
  }, 120_000);
});

describe('the tenancy boundary', () => {
  it("another organisation's workflow is not readable", async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/workflows/${otherWorkflow}/node-analytics`,
      headers: { cookie: session.cookie },
    });
    // 404, not 403: the answer must not reveal that the id exists.
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('41');
  });

  it('and their counters are untouched by the attempt', async () => {
    const rows = await db
      .select()
      .from(workflowNodeStats)
      .where(eq(workflowNodeStats.workflowId, otherWorkflow));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.entered).toBe(41);
    expect(rows[0]!.orgId).toBe(otherOrg);
  });

  it('an id that belongs to nobody is the same 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/workflows/${randomUUID()}/node-analytics`,
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
