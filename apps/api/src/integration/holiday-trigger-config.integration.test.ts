/**
 * A flow built from cz-christmas-week fires before Christmas — and only then.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * The four holiday recipes in registry.ts wrote their trigger as
 * `{ holiday: 'christmas_eve', daysBefore: 7 }`. The daily processor reads
 * `{ daysAhead, holidayKeys }` (services/workflows/triggers.ts), the shape the
 * feature was built and documented with (#389). Neither key it wanted was
 * there, so it took daysAhead = 0 and no filter: the "Christmas" flow fired on
 * the day of EVERY public holiday, for every active contact of the
 * organisation, and never seven days before Christmas.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * The flow is built from the registry entry exactly as a fork builds it — the
 * template's trigger config, nodes and edges, its email cloned into the org
 * through materialiseEmailTemplates — except that the template is hidden and
 * forkTemplate refuses hidden slugs. It is then activated and the real daily
 * processor is run for three chosen days:
 *
 *   2026-10-28  a public holiday that is not Christmas
 *   2026-11-05  not a holiday of any kind
 *   2026-12-17  seven days before Christmas Eve
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "Did not fire" is also what a broken processor does. The correct day must
 * start exactly one run, the run must enter the email step, and the email job
 * must reach the queue.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The worker that sends the email: the queue is the last hop here.
 * - Slovak holidays; no shipped recipe asks for one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { organizations, contacts, workflows, workflowRuns } from '../db/schema/index.js';
import { workflowNodeStats } from '../db/schema/workflow-node-stats.js';
import type { WorkflowEdge, WorkflowNode } from '../db/schema/workflows.js';
import { findTemplate } from '../services/workflow-templates/registry.js';
import { materialiseEmailTemplates } from '../services/workflow-templates/materialise-emails.js';
import { createWorkflow, activateWorkflow } from '../services/workflows/index.js';
import { processDailyHolidayTriggers } from '../services/workflows/triggers.js';
import { emailQueue } from '../lib/queues.js';

const tag = randomUUID().slice(0, 8);

let orgId: string;
let contactId: string;
const created: string[] = [];

const FOREIGN_HOLIDAY = new Date('2026-10-28T09:00:00Z');
const ORDINARY_DAY = new Date('2026-11-05T09:00:00Z');
const WEEK_BEFORE_CHRISTMAS = new Date('2026-12-17T09:00:00Z');

async function flowFrom(
  slug: string,
  triggerConfig?: Record<string, unknown>,
): Promise<{ id: string; emailNode: string }> {
  const tpl = findTemplate(slug)!;
  expect(tpl, `${slug} is not in the registry`).toBeTruthy();
  const { nodes } = await materialiseEmailTemplates(
    orgId,
    JSON.parse(JSON.stringify(tpl.nodes)) as WorkflowNode[],
  );
  const wf = await createWorkflow({
    orgId,
    name: `holiday ${tag} ${slug} ${created.length}`,
    description: tpl.description,
    triggerType: tpl.trigger.type as never,
    triggerConfig: triggerConfig ?? tpl.trigger.config,
    nodes,
    edges: JSON.parse(JSON.stringify(tpl.edges)) as WorkflowEdge[],
  });
  await activateWorkflow(wf.id, orgId);
  created.push(wf.id);
  const emailNode = nodes.find((n) => n.type === 'send_email')!.id;
  return { id: wf.id, emailNode };
}

async function runsOf(workflowId: string) {
  return db
    .select({ id: workflowRuns.id, data: workflowRuns.data })
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

/** Run the processor for each day and record which days started a run. */
async function walk(workflowId: string, days: Date[]) {
  const fired: string[] = [];
  for (const day of days) {
    const before = (await runsOf(workflowId)).length;
    await processDailyHolidayTriggers(day);
    const after = (await runsOf(workflowId)).length;
    for (let i = before; i < after; i++) fired.push(day.toISOString().slice(0, 10));
  }
  return fired;
}

describe('holiday recipes fire on their own holiday only (real DB)', () => {
  beforeAll(async () => {
    const [o] = await db
      .insert(organizations)
      .values({ name: 'holiday trigger itest', slug: `holiday-trigger-${tag}` })
      .returning({ id: organizations.id });
    orgId = o!.id;
    const [c] = await db
      .insert(contacts)
      .values({ orgId, email: `holiday-${tag}@test.local`, status: 'active' })
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

  it('cz-christmas-week: not on 28 October, not on an ordinary day, once on 17 December', async () => {
    const flow = await flowFrom('cz-christmas-week');
    const fired = await walk(flow.id, [FOREIGN_HOLIDAY, ORDINARY_DAY, WEEK_BEFORE_CHRISTMAS]);

    expect(fired, 'the Christmas flow fired on the wrong days').toEqual(['2026-12-17']);

    // The one run is for this contact, about Christmas Eve, and got to the email.
    const [run] = await runsOf(flow.id);
    expect((run!.data as { holidayKey?: string }).holidayKey).toBe('12-24');
    expect(await entered(flow.id, flow.emailNode), 'the run never reached the email step').toBe(1);
    expect(await queuedFor(run!.id), 'no email job reached the queue').toHaveLength(1);
  });

  it('cz-st-nicholas: once, three days before 5 December — Mikuláš is in the calendar now', async () => {
    const flow = await flowFrom('cz-st-nicholas');
    const fired = await walk(flow.id, [
      FOREIGN_HOLIDAY,
      new Date('2026-12-02T09:00:00Z'),
      new Date('2026-12-05T09:00:00Z'),
    ]);
    expect(fired).toEqual(['2026-12-02']);
  });

  it('a flow for "any public holiday" still fires on 28 October, and not before Mikuláš', async () => {
    // {} is what the dashboard's new-workflow form saves. Mikuláš is a
    // significant day, not a public holiday, so it must not join this set.
    // Two flows, one per day: a run still open from the first day would block
    // the second through isAlreadyRunning, and "did not fire" would prove nothing.
    const onHoliday = await flowFrom('cz-christmas-week', {});
    expect(await walk(onHoliday.id, [FOREIGN_HOLIDAY])).toEqual(['2026-10-28']);
    const onNicholas = await flowFrom('cz-christmas-week', {});
    expect(await walk(onNicholas.id, [new Date('2026-12-05T09:00:00Z')])).toEqual([]);
  });

  it('a flow still carrying the old { holiday, daysBefore } shape fires on the right day', async () => {
    // Anything forked before this change has that shape stored in its row.
    const flow = await flowFrom('cz-christmas-week', { holiday: 'christmas_eve', daysBefore: 7 });
    const fired = await walk(flow.id, [FOREIGN_HOLIDAY, ORDINARY_DAY, WEEK_BEFORE_CHRISTMAS]);
    expect(fired).toEqual(['2026-12-17']);
  });

  it('an old-shape flow naming a day the calendar does not know fires on nothing', async () => {
    // cz-mothers-day: the calendar cannot express "second Sunday in May".
    // Firing on every holiday instead would be the original bug again.
    const flow = await flowFrom('cz-christmas-week', { holiday: 'mothers_day', daysBefore: 5 });
    const fired = await walk(flow.id, [FOREIGN_HOLIDAY, new Date('2027-05-04T09:00:00Z')]);
    expect(fired).toEqual([]);
  });
});
