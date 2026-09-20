/**
 * A workflow that loops with nothing in between ends the run, not the process.
 *
 * `executeNode` calls itself for the next node, so a graph where a → b → a and
 * neither step waits never stops. Measured before this guard, against this
 * database: `startWorkflowRun` on such a workflow did NOT overflow the stack —
 * every step awaits Postgres, so it spun in an endless loop writing counters
 * and run rows, and the caller was killed by the 120-second test timeout with
 * the run still 'running'. In production that is a worker job that never
 * returns and a database taking writes for nothing.
 *
 * A loop through a `wait` is a different thing and a legitimate one: the run is
 * parked and resumed later, each resume starting a new chain. The second case
 * below is that, and it must still park.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * A guard that refused everything would also make the first case pass, so the
 * cycle case is followed by an ordinary workflow that must run to completion in
 * the same process, and by the waiting loop that must park rather than fail.
 *
 * WHAT THIS TEST CANNOT SEE
 * - The API refuses a self-loop since #192, so this one is written straight to
 *   the table; it is the shape that can still arrive from an older row.
 * - It runs in one process. It does not prove a BullMQ worker survives, only
 *   that the call returns and the next one works.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts, workflows, workflowRuns } from '../db/schema/index.js';
import { workflowNodeStats } from '../db/schema/workflow-node-stats.js';
import { startWorkflowRun } from '../services/workflows/executor.js';

const TAG = `wfcycle-${randomUUID().slice(0, 8)}`;

let app: FastifyInstance;
let session: Session;
let contactId: string;

type GNode = { id: string; type: string; config: Record<string, unknown> };
type GEdge = { id: string; source: string; target: string; label?: string };

/** Written straight to the table: some of these shapes the API now refuses. */
async function seedWorkflow(name: string, nodes: GNode[], edges: GEdge[]): Promise<string> {
  const [row] = await db
    .insert(workflows)
    .values({
      orgId: session.orgId,
      name: `${TAG} ${name}`,
      status: 'active',
      triggerType: 'manual',
      triggerConfig: {},
      nodes,
      edges,
    } as never)
    .returning({ id: workflows.id });
  return row!.id;
}

const runOf = async (workflowId: string) => {
  const [row] = await db.select().from(workflowRuns).where(eq(workflowRuns.workflowId, workflowId));
  return row!;
};

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
    await db.delete(workflowNodeStats).where(inArray(workflowNodeStats.workflowId, ids));
    await db.delete(workflows).where(inArray(workflows.id, ids));
  }
  if (contactId) await db.delete(contacts).where(eq(contacts.id, contactId));
  await app?.close();
}, 120_000);

describe('a workflow that loops without waiting', () => {
  it('fails the run, says so, and leaves the process able to run the next one', async () => {
    const looping = await seedWorkflow(
      'loop',
      [
        { id: 't', type: 'trigger', config: {} },
        { id: 'a', type: 'add_tag', config: { tagName: `${TAG}-a` } },
        { id: 'b', type: 'add_tag', config: { tagName: `${TAG}-b` } },
      ],
      [
        { id: 'e0', source: 't', target: 'a' },
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ],
    );

    const started = Date.now();
    await startWorkflowRun(looping, session.orgId, contactId);
    // Before the guard this did not return at all; 20s is generous for three steps.
    expect(Date.now() - started, 'the run did not end promptly').toBeLessThan(20_000);

    const run = await runOf(looping);
    expect(run.status).toBe('failed');
    expect(run.errorMessage).toMatch(/loops/);
    expect(run.errorMessage).toContain('a');

    // The case that must work: an ordinary workflow, same process, right after.
    const plain = await seedWorkflow(
      'plain',
      [
        { id: 't', type: 'trigger', config: {} },
        { id: 'a', type: 'add_tag', config: { tagName: `${TAG}-plain` } },
      ],
      [{ id: 'e0', source: 't', target: 'a' }],
    );
    await startWorkflowRun(plain, session.orgId, contactId);
    const ok = await runOf(plain);
    expect(ok.errorMessage).toBeNull();
    expect(ok.status).toBe('completed');
  }, 60_000);

  it('a loop through a wait is not a cycle: the run parks on the wait', async () => {
    const repeating = await seedWorkflow(
      'wait-loop',
      [
        { id: 't', type: 'trigger', config: {} },
        { id: 'a', type: 'add_tag', config: { tagName: `${TAG}-w` } },
        { id: 'w', type: 'wait', config: { duration: 1, unit: 'days' } },
      ],
      [
        { id: 'e0', source: 't', target: 'a' },
        { id: 'e1', source: 'a', target: 'w' },
        { id: 'e2', source: 'w', target: 'a' },
      ],
    );

    await startWorkflowRun(repeating, session.orgId, contactId);
    const run = await runOf(repeating);
    expect(run.errorMessage, 'the wait loop was treated as a cycle').toBeNull();
    expect(run.status).toBe('waiting');
    expect(run.currentNodeId).toBe('w');

    // And the resume after the wait starts a fresh chain: `a` runs again.
    const { resumeWorkflowRun } = await import('../services/workflows/executor.js');
    await resumeWorkflowRun(run.id);
    const [stat] = await db
      .select({ entered: workflowNodeStats.entered })
      .from(workflowNodeStats)
      .where(and(eq(workflowNodeStats.workflowId, repeating), eq(workflowNodeStats.nodeId, 'a')));
    expect(stat?.entered, 'the step after the wait did not run a second time').toBe(2);

    const after = await runOf(repeating);
    expect(after.status, 'the second pass should park on the wait again').toBe('waiting');
    expect(after.errorMessage).toBeNull();
  }, 60_000);

  it('a diamond that rejoins is not a cycle', async () => {
    // t → c ⇒ (yes | no) → join. `join` is reached once; nothing repeats.
    const diamond = await seedWorkflow(
      'diamond',
      [
        { id: 't', type: 'trigger', config: {} },
        { id: 'c', type: 'condition', config: { field: 'email', op: 'is_set' } },
        { id: 'yes', type: 'add_tag', config: { tagName: `${TAG}-y` } },
        { id: 'no', type: 'add_tag', config: { tagName: `${TAG}-n` } },
        { id: 'join', type: 'add_tag', config: { tagName: `${TAG}-j` } },
      ],
      [
        { id: 'e0', source: 't', target: 'c' },
        { id: 'e1', source: 'c', target: 'yes', label: 'true' },
        { id: 'e2', source: 'c', target: 'no', label: 'false' },
        { id: 'e3', source: 'yes', target: 'join' },
        { id: 'e4', source: 'no', target: 'join' },
      ],
    );

    await startWorkflowRun(diamond, session.orgId, contactId);
    const run = await runOf(diamond);
    expect(run.errorMessage).toBeNull();
    expect(run.status).toBe('completed');

    const stats = await db
      .select({ nodeId: workflowNodeStats.nodeId, entered: workflowNodeStats.entered })
      .from(workflowNodeStats)
      .where(eq(workflowNodeStats.workflowId, diamond));
    expect(
      stats
        .filter((s) => s.entered > 0)
        .map((s) => s.nodeId)
        .sort(),
    ).toEqual(['c', 'join', 'yes']);
  }, 60_000);
});
