/**
 * The daily date_field and name-day processors start no run for a contact the
 * sender would drop.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * Both processors selected every non-deleted contact whose date or first name
 * matched, unsubscribed ones included (services/workflows/triggers.ts). The
 * run started, the email job was queued, and the batch sender then dropped the
 * message — so nothing reached the inbox, but the run completed, the workflow's
 * total_runs and the email step's `entered` both counted a send that never
 * happened. Measured in Z97 for both processors; the holiday processor already
 * filtered.
 *
 * ─── Which contacts are dropped ──────────────────────────────────────────────
 *
 * Exactly the ones the batch sender drops for a non-transactional send
 * (apps/workers/src/jobs/batch-sender.ts): `status = 'unsubscribed'`, and an
 * address on the organisation's suppression list (bounces and complaints are
 * put there by mta-sender and fbl-processor). Not `status = 'active'` as the
 * holiday processor has it: the sender does deliver to `pending`,
 * `non_subscribed` and `archived`, and dropping them here would lose mail they
 * receive today. Whether they should receive it is a separate question.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "No run" is also what a broken processor produces, so in the same pass an
 * active contact and a pending one must each get a run that enters the email
 * step and queues the email.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  organizations,
  contacts,
  workflows,
  workflowRuns,
  suppressions,
} from '../db/schema/index.js';
import { workflowNodeStats } from '../db/schema/workflow-node-stats.js';
import { createWorkflow, activateWorkflow } from '../services/workflows/index.js';
import {
  processDailyDateTriggers,
  processDailyNameDayTriggers,
} from '../services/workflows/triggers.js';
import { nameDaysFor } from '@forgemsg/i18n-cs/name-days';
import { emailQueue } from '../lib/queues.js';

const tag = randomUUID().slice(0, 8);
// 11 November has a Czech name day (Martin); 28 October, a public holiday, has none.
const DAY = new Date('2026-11-11T09:00:00Z');
const NAME = nameDaysFor(DAY)[0]!;

let orgId: string;
const who: Record<'active' | 'unsubscribed' | 'suppressed' | 'pending', string> = {} as never;
const created: string[] = [];

const NODES = [
  { id: 't', type: 'trigger', config: {} },
  { id: 'e1', type: 'send_email', config: { subject: 'probe', html: '<p>probe</p>' } },
];
const EDGES = [{ id: 'x', source: 't', target: 'e1' }];

async function flow(triggerType: string, triggerConfig: Record<string, unknown>) {
  const wf = await createWorkflow({
    orgId,
    name: `daily ${tag} ${triggerType}`,
    triggerType: triggerType as never,
    triggerConfig,
    nodes: NODES as never,
    edges: EDGES as never,
  });
  await activateWorkflow(wf.id, orgId);
  created.push(wf.id);
  return wf.id;
}

async function outcome(workflowId: string) {
  const runs = await db
    .select({ id: workflowRuns.id, contactId: workflowRuns.contactId })
    .from(workflowRuns)
    .where(eq(workflowRuns.workflowId, workflowId));
  const [stat] = await db
    .select({ entered: workflowNodeStats.entered })
    .from(workflowNodeStats)
    .where(and(eq(workflowNodeStats.workflowId, workflowId), eq(workflowNodeStats.nodeId, 'e1')));
  const jobs = await emailQueue.getJobs(['waiting', 'delayed', 'active', 'completed'], 0, 5000);
  const runIds = new Set(runs.map((r) => r.id));
  const queued = jobs.filter((j) =>
    runIds.has((j?.data as { workflowRunId?: string } | undefined)?.workflowRunId ?? ''),
  ).length;
  const runsFor = (contactId: string) => runs.filter((r) => r.contactId === contactId).length;
  return {
    active: runsFor(who.active),
    pending: runsFor(who.pending),
    unsubscribed: runsFor(who.unsubscribed),
    suppressed: runsFor(who.suppressed),
    entered: stat?.entered ?? 0,
    queued,
  };
}

async function onDay(fn: () => Promise<unknown>) {
  vi.useFakeTimers({ toFake: ['Date'], now: DAY });
  try {
    await fn();
  } finally {
    vi.useRealTimers();
  }
}

describe('daily date and name-day triggers skip contacts the sender would drop (real DB)', () => {
  beforeAll(async () => {
    const [o] = await db
      .insert(organizations)
      .values({ name: 'daily trigger itest', slug: `daily-trigger-${tag}` })
      .returning({ id: organizations.id });
    orgId = o!.id;

    const specs = [
      ['active', 'active'],
      ['pending', 'pending'],
      ['unsubscribed', 'unsubscribed'],
      // Status still 'active', but the address bounced: the sender drops it
      // through the suppression list, not the status.
      ['suppressed', 'active'],
    ] as const;
    for (const [key, status] of specs) {
      const [c] = await db
        .insert(contacts)
        .values({
          orgId,
          email: `daily-${key}-${tag}@test.local`,
          firstName: NAME,
          status,
          customFields: { birthday: '1990-11-11' },
        })
        .returning({ id: contacts.id });
      who[key] = c!.id;
    }
    await db
      .insert(suppressions)
      .values({ orgId, email: `daily-suppressed-${tag}@test.local`, reason: 'hard_bounce' });
  }, 120_000);

  afterAll(async () => {
    if (created.length) {
      await db.delete(workflowRuns).where(inArray(workflowRuns.workflowId, created));
      await db.delete(workflowNodeStats).where(inArray(workflowNodeStats.workflowId, created));
      await db.delete(workflows).where(inArray(workflows.id, created));
    }
    await db.delete(suppressions).where(eq(suppressions.orgId, orgId));
    await db.delete(contacts).where(eq(contacts.orgId, orgId));
    await db.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
  }, 120_000);

  it('date_field: runs for the active and the pending contact only', async () => {
    const id = await flow('date_field', { field: 'birthday', offsetDays: 0 });
    await onDay(() => processDailyDateTriggers());

    expect(await outcome(id)).toEqual({
      active: 1,
      pending: 1,
      unsubscribed: 0,
      suppressed: 0,
      entered: 2,
      queued: 2,
    });
  });

  it(`name_day_today (${NAME}): runs for the active and the pending contact only`, async () => {
    expect(NAME, 'the chosen day has no Czech name day').toBeTruthy();
    const id = await flow('name_day_today', {});
    await onDay(() => processDailyNameDayTriggers());

    expect(await outcome(id)).toEqual({
      active: 1,
      pending: 1,
      unsubscribed: 0,
      suppressed: 0,
      entered: 2,
      queued: 2,
    });
  });
});
