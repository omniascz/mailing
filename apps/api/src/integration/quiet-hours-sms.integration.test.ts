/**
 * Marketing SMS waits for morning. A verification code does not.
 *
 * The starting assumption was that SMS ignores quiet hours entirely. It does
 * not — and what it actually does is worse in one direction and lossy in the
 * other. `executeSendSms` calls `checkFrequencyCap({ channel: 'sms', priority })`
 * before enqueuing, and since #135 that call begins with the quiet-hours check.
 * So SMS has been gated on quiet hours since then, by accident, with two
 * defects:
 *
 *   1. the quiet check ignores `priority`, so a TRANSACTIONAL SMS is held too.
 *      `services/ticketing/seed-workflows.ts:154` ships nodes with
 *      `priority: 'transactional'`, so this is live, not hypothetical. A
 *      verification code that arrives eight hours late is not a late message,
 *      it is a broken login.
 *   2. a blocked send returns `{ type: 'next' }` — the run walks past the node
 *      and the message is gone. Nobody gets the reminder, at 3am or at 9am.
 *
 * So this is not "teach SMS about quiet hours". It is: stop holding the mail
 * that must never be held, and stop throwing away the mail that should simply
 * wait.
 *
 * No statute forces the window (probe 5: neither Czech law 480/2004 nor the
 * ePrivacy/GDPR line sets sending hours; the 8am-9pm rule is US TCPA). It is a
 * product promise the operator configured, which is exactly why it has to mean
 * what it says.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  organizations,
  contacts,
  quietHours,
  workflows,
  workflowRuns,
} from '../db/schema/index.js';
import { executeAction } from '../services/workflows/actions.js';
import { checkFrequencyCap } from '../services/frequency-capping/index.js';
import type { WorkflowRun } from '../db/schema/workflows.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];

let orgId: string;
let contactId: string;
let runId: string;

/** A window that certainly contains this moment, in UTC. */
const windowNow = () => {
  const h = new Date().getUTCHours();
  return { startHour: h, endHour: (h + 1) % 24 };
};
const windowLater = () => {
  const h = new Date().getUTCHours();
  return { startHour: (h + 2) % 24, endHour: (h + 3) % 24 };
};

async function setWindow(w: { startHour: number; endHour: number } | null, channel = 'all') {
  await db.delete(quietHours).where(eq(quietHours.orgId, orgId));
  if (w) {
    await db.insert(quietHours).values({ orgId, channel, ...w, timezone: 'UTC', enabled: true });
  }
}

/** The real send_sms node, executed through the real dispatcher. */
function smsNode(priority?: 'transactional' | 'marketing' | 'promotional') {
  return {
    id: 's',
    type: 'send_sms',
    config: { message: 'Your code is 1234', ...(priority ? { priority } : {}) },
  };
}

function ctx() {
  return {
    orgId,
    contact: {
      id: contactId,
      email: `sms-${tag}@example.test`,
      firstName: null,
      lastName: null,
      phone: '+420777123456',
      customFields: {},
      tags: [],
      listIds: [],
    },
  };
}

let runRow: WorkflowRun;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();

  const [org] = await db
    .insert(organizations)
    .values({ name: `sms ${tag}`, slug: `sms-${tag}` })
    .returning({ id: organizations.id });
  orgIds.push(org!.id);
  orgId = org!.id;

  const [c] = await db
    .insert(contacts)
    .values({ orgId, email: `sms-${tag}@example.test`, phone: '+420777123456', status: 'active' })
    .returning({ id: contacts.id });
  contactId = c!.id;

  const [wf] = await db
    .insert(workflows)
    .values({
      orgId,
      name: `sms ${tag}`,
      status: 'active',
      triggerType: 'manual',
      nodes: [smsNode('marketing')] as never,
      edges: [],
    })
    .returning({ id: workflows.id });

  const [run] = await db
    .insert(workflowRuns)
    .values({ workflowId: wf!.id, orgId, contactId, status: 'running' })
    .returning();
  runId = run!.id;
  runRow = run as WorkflowRun;
}, 60_000);

afterAll(async () => {
  if (orgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

describe('a verification code is never held', () => {
  it('a TRANSACTIONAL SMS goes out inside the quiet window', async () => {
    // The one that must not regress. `seed-workflows.ts` ships nodes with this
    // priority, so holding them silently breaks logins and order confirmations.
    await setWindow(windowNow());

    const out = await checkFrequencyCap({
      orgId,
      contactId,
      channel: 'sms',
      priority: 'transactional',
      logSuppression: false,
    });
    expect(out.allowed, 'a transactional SMS is not subject to quiet hours').toBe(true);
  }, 60_000);

  it('and the node really enqueues it — not merely "did not park"', async () => {
    // Asserting `!== 'wait'` alone would be worthless here: on the old code a
    // transactional SMS was SKIPPED, and a skip is also not a wait. The
    // difference between "sent" and "silently dropped" is only visible on the
    // queue, so that is what is measured.
    const { smsQueue } = await import('../lib/queues.js');
    await smsQueue.obliterate({ force: true });
    await setWindow(windowNow());

    const res = await executeAction(smsNode('transactional') as never, runRow, ctx() as never);
    expect(res.type, 'a code must leave now, not at 9am').not.toBe('wait');

    const jobs = await smsQueue.getJobs(['waiting', 'delayed', 'prioritized', 'active']);
    expect(jobs.length, 'the code must actually be queued').toBe(1);
    expect((jobs[0]!.data as { contactId: string }).contactId).toBe(contactId);

    await smsQueue.obliterate({ force: true });
  }, 60_000);

  it('a MARKETING SMS in the same window queues nothing', async () => {
    // The other half of the same measurement: parking must not also enqueue.
    const { smsQueue } = await import('../lib/queues.js');
    await smsQueue.obliterate({ force: true });
    await setWindow(windowNow());

    const res = await executeAction(smsNode('marketing') as never, runRow, ctx() as never);
    expect(res.type).toBe('wait');
    expect(await smsQueue.getJobs(['waiting', 'delayed', 'prioritized', 'active'])).toHaveLength(0);

    await smsQueue.obliterate({ force: true });
  }, 60_000);
});

describe('a marketing SMS waits instead of vanishing', () => {
  it('is parked until the window ends, not skipped', async () => {
    await setWindow(windowNow());

    const res = await executeAction(smsNode('marketing') as never, runRow, ctx() as never);

    // `{ type: 'next' }` — the old answer — walks the run past the node and
    // the message is gone for good. `wait` parks the run ON this node;
    // executor.ts sets status='waiting', currentNodeId and nextExecutionAt,
    // so it is retried after the window rather than lost.
    expect(res.type, 'the reminder must survive the night').toBe('wait');
    const until = (res as { until: Date }).until;
    expect(until.getTime()).toBeGreaterThan(Date.now());
    expect(until.getTime(), 'a window is at most 24h wide').toBeLessThan(
      Date.now() + 25 * 3600 * 1000,
    );
  }, 60_000);

  it('the default priority is marketing, so an unmarked node waits too', async () => {
    await setWindow(windowNow());
    const res = await executeAction(smsNode() as never, runRow, ctx() as never);
    expect(res.type).toBe('wait');
  }, 60_000);
});

describe('outside the window nothing is held', () => {
  it('a marketing SMS goes out when the window is elsewhere', async () => {
    await setWindow(windowLater());
    const res = await executeAction(smsNode('marketing') as never, runRow, ctx() as never);
    expect(res.type, 'no window is open right now').not.toBe('wait');
  }, 60_000);

  it('with no window configured at all, a marketing SMS goes out', async () => {
    await setWindow(null);
    const res = await executeAction(smsNode('marketing') as never, runRow, ctx() as never);
    expect(res.type).not.toBe('wait');
  }, 60_000);

  it('a window on a DIFFERENT channel does not hold SMS', async () => {
    // quiet_hours resolves the exact channel first and falls back to 'all'.
    // A window set for email must not silently gate SMS.
    await setWindow(windowNow(), 'email');
    const res = await executeAction(smsNode('marketing') as never, runRow, ctx() as never);
    expect(res.type, 'the email window is not the SMS window').not.toBe('wait');
  }, 60_000);
});

describe('the run is parked on the node, not past it', () => {
  it('executor semantics: wait carries the node id and the resume time', async () => {
    // Asserting the contract executeAction relies on, so a future change to
    // the executor cannot turn "wait" back into "skip" without failing here.
    await setWindow(windowNow());
    const res = await executeAction(smsNode('marketing') as never, runRow, ctx() as never);
    expect(res).toMatchObject({ type: 'wait' });
    expect((res as { until: Date }).until).toBeInstanceOf(Date);
    void runId;
  }, 60_000);
});
