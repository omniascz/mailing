/**
 * A date_field recipe sends on the day it says — N days before the date.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * Five recipes in registry.ts write `{ field, daysBefore: N }` ("3 days before
 * the birthday", "30 days before the renewal", "14 days before the card
 * expires"). The daily processor reads `{ field, offsetDays }` and fires when
 * `date + offsetDays` falls on today (services/workflows/triggers.ts). With no
 * offsetDays it used 0, so every one of them fired ON the date: the "renews in
 * 30 days" email on the renewal day, the "card expires soon" email on the day
 * it expired.
 *
 * The same line put offsetDays into the SQL as text (`sql.raw(String(...))`).
 * The trigger config is whatever the workflow API was given, so a string there
 * rewrote the query.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Flows built from the registry exactly as a fork builds them (config, nodes,
 * edges, emails cloned into the org), activated, and the real processor run on
 * chosen days with the clock set to them. Every date field holds 2026-12-20.
 * One flow per day walked, so a run left open on one day cannot hide another.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "Did not fire" is also what a broken processor does, so the correct day must
 * start exactly one run that enters the email step and queues the email.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { organizations, contacts, workflows, workflowRuns } from '../db/schema/index.js';
import { workflowNodeStats } from '../db/schema/workflow-node-stats.js';
import type { WorkflowEdge, WorkflowNode } from '../db/schema/workflows.js';
import { findTemplate } from '../services/workflow-templates/registry.js';
import { materialiseEmailTemplates } from '../services/workflow-templates/materialise-emails.js';
import { createWorkflow, activateWorkflow } from '../services/workflows/index.js';
import { processDailyDateTriggers } from '../services/workflows/triggers.js';
import { emailQueue } from '../lib/queues.js';

const tag = randomUUID().slice(0, 8);
const THE_DATE = '2026-12-20';

let orgId: string;
let contactId: string;
const created: string[] = [];

const day = (iso: string) => new Date(`${iso}T09:00:00Z`);

async function flowFrom(slug: string, triggerConfig?: Record<string, unknown>) {
  const tpl = findTemplate(slug)!;
  expect(tpl, `${slug} is not in the registry`).toBeTruthy();
  const { nodes } = await materialiseEmailTemplates(
    orgId,
    JSON.parse(JSON.stringify(tpl.nodes)) as WorkflowNode[],
  );
  const wf = await createWorkflow({
    orgId,
    name: `datefield ${tag} ${slug} ${created.length}`,
    description: tpl.description,
    triggerType: tpl.trigger.type as never,
    triggerConfig: triggerConfig ?? tpl.trigger.config,
    nodes,
    edges: JSON.parse(JSON.stringify(tpl.edges)) as WorkflowEdge[],
  });
  await activateWorkflow(wf.id, orgId);
  created.push(wf.id);
  return { id: wf.id, emailNode: nodes.find((n) => n.type === 'send_email')!.id };
}

async function runsOf(workflowId: string) {
  return db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(eq(workflowRuns.workflowId, workflowId));
}

async function entered(workflowId: string, nodeId: string): Promise<number> {
  const [row] = await db
    .select({ entered: workflowNodeStats.entered })
    .from(workflowNodeStats)
    .where(and(eq(workflowNodeStats.workflowId, workflowId), eq(workflowNodeStats.nodeId, nodeId)));
  return row?.entered ?? 0;
}

async function queuedFor(runId: string) {
  const jobs = await emailQueue.getJobs(['waiting', 'delayed', 'active', 'completed'], 0, 1000);
  return jobs.filter(
    (j) => (j?.data as { workflowRunId?: string } | undefined)?.workflowRunId === runId,
  );
}

/** Run the processor with the clock on `iso`; return how many runs `workflowId` gained. */
async function runOn(workflowId: string, iso: string): Promise<number> {
  const before = (await runsOf(workflowId)).length;
  vi.useFakeTimers({ toFake: ['Date'], now: day(iso) });
  try {
    await processDailyDateTriggers();
  } finally {
    vi.useRealTimers();
  }
  return (await runsOf(workflowId)).length - before;
}

/** One flow per day: which of these days would the recipe fire on? */
async function daysFired(slug: string, days: string[], config?: Record<string, unknown>) {
  const fired: string[] = [];
  for (const iso of days) {
    const flow = await flowFrom(slug, config);
    if ((await runOn(flow.id, iso)) > 0) fired.push(iso);
  }
  return fired;
}

describe('date_field recipes fire N days before the date (real DB)', () => {
  beforeAll(async () => {
    const [o] = await db
      .insert(organizations)
      .values({ name: 'date field itest', slug: `date-field-${tag}` })
      .returning({ id: organizations.id });
    orgId = o!.id;
    const [c] = await db
      .insert(contacts)
      .values({
        orgId,
        email: `datefield-${tag}@test.local`,
        status: 'active',
        customFields: {
          birthday: THE_DATE,
          subscription_renews_at: THE_DATE,
          card_expires_at: THE_DATE,
          'loyalty.points_expire_at': THE_DATE,
        },
      })
      .returning({ id: contacts.id });
    contactId = c!.id;
  }, 120_000);

  afterAll(async () => {
    if (created.length) {
      await db.delete(workflowRuns).where(inArray(workflowRuns.workflowId, created));
      await db.delete(workflowNodeStats).where(inArray(workflowNodeStats.workflowId, created));
      await db.delete(workflows).where(inArray(workflows.id, created));
    }
    await db.delete(contacts).where(eq(contacts.id, contactId));
    await db.execute(sql`DELETE FROM templates WHERE org_id = ${orgId}`);
    await db.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
  }, 120_000);

  it('birthday-cs: three days before the birthday, not on it, not on an ordinary day', async () => {
    expect(await daysFired('birthday-cs', ['2026-12-20', '2026-12-17', '2026-12-10'])).toEqual([
      '2026-12-17',
    ]);
  });

  it('subscription-card-expiring: fourteen days before the card expires, and the email is sent', async () => {
    expect(await daysFired('subscription-card-expiring', ['2026-12-20', '2026-12-10'])).toEqual([]);

    const flow = await flowFrom('subscription-card-expiring');
    expect(await runOn(flow.id, '2026-12-06'), 'no run on 6 December').toBe(1);
    const [run] = await runsOf(flow.id);
    expect(await entered(flow.id, flow.emailNode), 'the run never reached the email').toBe(1);
    expect(await queuedFor(run!.id), 'no email job reached the queue').toHaveLength(1);
  });

  it('subscription-renewal-30-7-1 and loyalty-points-expiring: thirty days before', async () => {
    for (const slug of ['subscription-renewal-30-7-1', 'loyalty-points-expiring']) {
      expect(await daysFired(slug, ['2026-12-20', '2026-11-20', '2026-12-10']), slug).toEqual([
        '2026-11-20',
      ]);
    }
  });

  it('a flow forked earlier, still holding { field, daysBefore }, fires on the right day', async () => {
    // Negative control for the old shape: the recipes wrote it until now, so
    // every workflow forked from them holds it in its row.
    expect(
      await daysFired('birthday-cs', ['2026-12-20', '2026-12-17'], {
        field: 'birthday',
        daysBefore: 3,
      }),
    ).toEqual(['2026-12-17']);
  });

  it('a flow configured with offsetDays directly still means what it always did', async () => {
    // The dashboard and the API write this shape; the existing trigger test
    // uses { offsetDays: 0 }. -3 = three days before the date.
    expect(
      await daysFired('birthday-cs', ['2026-12-20', '2026-12-17'], {
        field: 'birthday',
        offsetDays: -3,
      }),
    ).toEqual(['2026-12-17']);
  });

  it('an offsetDays that is not a whole number cannot rewrite the query', async () => {
    // As text this became `INTERVAL '0 days' + INTERVAL '3 days'` — the stored
    // config moved the date by three days. It must fire on nothing instead.
    expect(
      await daysFired('birthday-cs', ['2026-12-17', '2026-12-20', '2026-12-23'], {
        field: 'birthday',
        offsetDays: "0 days' + INTERVAL '3",
      }),
    ).toEqual([]);
  });
});
