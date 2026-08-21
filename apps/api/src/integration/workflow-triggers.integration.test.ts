/**
 * Every trigger type, driven through the real event, against a real database.
 *
 * trigger-coverage.test.ts proves a literal reaches a query and that the
 * function holding it has a caller. It cannot prove the caller executes, that
 * the org scoping lines up, or that a run row is actually written — and
 * "the call exists but never runs" is the whole failure mode here. So this
 * performs the real operation and counts workflow_runs.
 *
 * Counts, not existence. `=== 1` rather than `> 0`: moving the loyalty_tier_up
 * odpalovač into creditPoints while leaving the old call in workflows/actions.ts
 * would have fired it twice, and `> 0` would have called that a pass.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { createTestApp, login } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  workflows,
  workflowRuns,
  contacts,
  segments,
  signupForms,
  loyaltyPrograms,
  loyaltyRewards,
  loyaltyRedemptions,
  ecommerceConnections,
} from '../db/schema/index.js';
import { workflowTriggerTypeEnum } from '../db/schema/workflows.js';
import { czechHolidaysInDays } from '@forgemsg/i18n-cs';

const TAG = 'trigitest';

let app: FastifyInstance;
let cookie: string;
let orgId: string;

let seq = 0;

const NODES = [
  { id: 't', type: 'trigger', config: {} },
  { id: 'e1', type: 'send_email', config: { subject: 'trigger integration probe' } },
];
const EDGES = [{ id: 'x', source: 't', target: 'e1' }];

async function api(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
): Promise<{ status: number; body: string; json: <T>() => T }> {
  const res = await app.inject({ method, url, headers: { cookie }, payload: payload as never });
  return {
    status: res.statusCode,
    body: res.body,
    json: <T>() => res.json() as T,
  };
}

/** Create + activate a workflow, returning its id. Fails loudly, not silently. */
async function activeWorkflow(
  triggerType: string,
  triggerConfig: Record<string, unknown> = {},
  nodes: unknown[] = NODES,
  edges: unknown[] = EDGES,
): Promise<string> {
  const created = await api('POST', '/api/v1/workflows', {
    name: `${TAG} ${triggerType} ${Date.now()}-${++seq}`,
    triggerType,
    triggerConfig,
    nodes,
    edges,
  });
  if (created.status >= 300) {
    throw new Error(`create workflow (${triggerType}) failed: ${created.status} ${created.body}`);
  }
  const id = created.json<{ data: { id: string } }>().data.id;
  const activated = await api('POST', `/api/v1/workflows/${id}/activate`, {});
  if (activated.status >= 300) {
    throw new Error(`activate (${triggerType}) failed: ${activated.status} ${activated.body}`);
  }
  return id;
}

async function runCount(workflowId: string, contactId?: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(workflowRuns)
    .where(
      contactId
        ? and(eq(workflowRuns.workflowId, workflowId), eq(workflowRuns.contactId, contactId))
        : eq(workflowRuns.workflowId, workflowId),
    );
  return row?.n ?? 0;
}

/**
 * Triggers are fire-and-forget. Wait for the expected count, then hold briefly
 * and re-read: settling too early would make a double-fire look like a single.
 */
async function settledRunCount(workflowId: string, contactId?: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await runCount(workflowId, contactId)) >= 1) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  await new Promise((r) => setTimeout(r, 1200));
  return runCount(workflowId, contactId);
}

async function newContact(prefix: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await api('POST', '/api/v1/contacts', {
    email: `${TAG}-${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@probe.test`,
    ...extra,
  });
  if (res.status >= 300) throw new Error(`create contact failed: ${res.status} ${res.body}`);
  return res.json<{ data: { id: string } }>().data.id;
}

/** A loyalty program with two tiers, an earn rule, and one enrolled member. */
async function loyaltySetup(pointsForSignup = 500) {
  const prog = await api('POST', '/api/v1/loyalty/programs', {
    name: `${TAG} program ${Date.now()}`,
    tiers: [
      { id: 'bronze', name: 'Bronze', minPoints: 0 },
      { id: 'silver', name: 'Silver', minPoints: 10 },
    ],
    earningEnabled: true,
    redemptionEnabled: true,
  });
  if (prog.status >= 300) throw new Error(`program: ${prog.status} ${prog.body}`);
  const programId = prog.json<{ data: { id: string } }>().data.id;

  const rule = await api('POST', `/api/v1/loyalty/programs/${programId}/earning-rules`, {
    name: 'signup',
    eventType: 'signup',
    pointsFixed: pointsForSignup,
  });
  if (rule.status >= 300) throw new Error(`rule: ${rule.status} ${rule.body}`);

  const contactId = await newContact('loyal');
  const enrolled = await api('POST', `/api/v1/loyalty/programs/${programId}/members/enroll`, {
    contactId,
  });
  if (enrolled.status >= 300) throw new Error(`enroll: ${enrolled.status} ${enrolled.body}`);
  const memberId = enrolled.json<{ data: { id: string } }>().data.id;

  return { programId, contactId, memberId };
}

describe('workflow triggers fire (real HTTP, real DB)', () => {
  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
    const session = await login(app);
    cookie = session.cookie;
    orgId = session.orgId;

    // processDailyNameDayTriggers calls unaccent(); no migration creates the
    // extension (a known gap, see sql-explain.integration.test.ts). Without it
    // the name-day case fails for an unrelated reason.
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS unaccent`);
  }, 60_000);

  // Everything this file creates is removed again. The suite shares one
  // database, and contacts.integration.test.ts asserts the exact seeded
  // contact count — leaving rows behind fails a test in another file, which is
  // a miserable thing to debug.
  afterAll(async () => {
    const ours = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(and(eq(workflows.orgId, orgId), like(workflows.name, `${TAG}%`)));
    const ids = ours.map((w) => w.id);
    if (ids.length) {
      await db.delete(workflowRuns).where(inArray(workflowRuns.workflowId, ids));
      await db.delete(workflows).where(inArray(workflows.id, ids));
    }
    await db.delete(segments).where(like(segments.name, `${TAG}%`));
    await db.delete(signupForms).where(like(signupForms.name, `${TAG}%`));
    // loyalty_redemptions -> loyalty_rewards is RESTRICT, so order matters.
    const progs = await db
      .select({ id: loyaltyPrograms.id })
      .from(loyaltyPrograms)
      .where(like(loyaltyPrograms.name, `${TAG}%`));
    const progIds = progs.map((p) => p.id);
    if (progIds.length) {
      const rewards = await db
        .select({ id: loyaltyRewards.id })
        .from(loyaltyRewards)
        .where(inArray(loyaltyRewards.programId, progIds));
      const rewardIds = rewards.map((r) => r.id);
      if (rewardIds.length) {
        await db.delete(loyaltyRedemptions).where(inArray(loyaltyRedemptions.rewardId, rewardIds));
        await db.delete(loyaltyRewards).where(inArray(loyaltyRewards.id, rewardIds));
      }
      await db.delete(loyaltyPrograms).where(inArray(loyaltyPrograms.id, progIds));
    }
    await db.delete(ecommerceConnections).where(like(ecommerceConnections.name, `${TAG}%`));
    // Every FK onto contacts is CASCADE or SET NULL, so this is safe last.
    await db.delete(contacts).where(like(contacts.email, `${TAG}-%`));
    await app?.close();
  }, 60_000);

  // ── the four that were dead ────────────────────────────────────────────────

  it('form_submit — submitting a form starts the workflow', async () => {
    const wf = await activeWorkflow('form_submit');
    const form = await api('POST', '/api/v1/signup-forms', {
      name: `${TAG} form`,
      type: 'inline',
      fields: [{ name: 'email', label: 'Email', type: 'email', required: true }],
      config: { doubleOptIn: false },
    });
    expect(form.status, form.body).toBeLessThan(300);
    const formId = form.json<{ data: { id: string } }>().data.id;

    const submit = await app.inject({
      method: 'POST',
      url: `/public/forms/${formId}/submit`,
      payload: { email: `${TAG}-fs-${Date.now()}@probe.test` },
    });
    expect(submit.statusCode, submit.body).toBe(200);

    expect(await settledRunCount(wf)).toBe(1);
  }, 60_000);

  it('form_submit — a workflow filtered to another form does not start', async () => {
    // The filter has to actually filter, or "unset = any form" would silently
    // become "always any form".
    const wf = await activeWorkflow('form_submit', { formId: crypto.randomUUID() });
    const form = await api('POST', '/api/v1/signup-forms', {
      name: `${TAG} form other`,
      type: 'inline',
      fields: [{ name: 'email', label: 'Email', type: 'email', required: true }],
      config: { doubleOptIn: false },
    });
    const formId = form.json<{ data: { id: string } }>().data.id;
    await app.inject({
      method: 'POST',
      url: `/public/forms/${formId}/submit`,
      payload: { email: `${TAG}-fs2-${Date.now()}@probe.test` },
    });
    await new Promise((r) => setTimeout(r, 2000));
    expect(await runCount(wf)).toBe(0);
  }, 60_000);

  it('lifecycle_stage_changed — a stage transition starts the workflow', async () => {
    const wf = await activeWorkflow('lifecycle_stage_changed');
    const contactId = await newContact('lifecycle');
    const res = await api('POST', `/api/v1/contacts/${contactId}/lifecycle`, {
      toStage: 'marketing_qualified_lead',
      reason: 'integration probe',
    });
    expect(res.status, res.body).toBe(200);
    expect(await settledRunCount(wf)).toBe(1);
  }, 60_000);

  it('lifecycle_stage_changed — the generic api_event still fires alongside it', async () => {
    // The dedicated trigger was added next to onApiEvent, not instead of it.
    // If someone "tidies up" by deleting the api_event call, this says so.
    const wf = await activeWorkflow('api_event', { eventName: 'lifecycle_stage_changed' });
    const contactId = await newContact('lifecycle-api');
    await api('POST', `/api/v1/contacts/${contactId}/lifecycle`, {
      toStage: 'marketing_qualified_lead',
    });
    expect(await settledRunCount(wf)).toBe(1);
  }, 60_000);

  it('loyalty_points_earned — an earn event starts the workflow', async () => {
    const wf = await activeWorkflow('loyalty_points_earned');
    const { programId, contactId } = await loyaltySetup();
    const earn = await api('POST', `/api/v1/loyalty/programs/${programId}/earn`, {
      contactId,
      eventType: 'signup',
      properties: {},
    });
    expect(earn.status, earn.body).toBe(200);
    expect(await settledRunCount(wf)).toBe(1);
  }, 60_000);

  it('loyalty_points_earned — a manual admin credit does NOT start it', async () => {
    // Deliberate: an admin adjustment is not an earning event. This pins the
    // distinction so a later "fix" that moves the call into creditPoints —
    // where tier-up lives — gets caught.
    const wf = await activeWorkflow('loyalty_points_earned');
    const { programId, memberId } = await loyaltySetup();
    const credit = await api(
      'POST',
      `/api/v1/loyalty/programs/${programId}/members/${memberId}/credit`,
      { points: 50, type: 'adjust', description: 'probe' },
    );
    expect(credit.status, credit.body).toBe(200);
    await new Promise((r) => setTimeout(r, 2000));
    expect(await runCount(wf)).toBe(0);
  }, 60_000);

  it('loyalty_reward_redeemed — redeeming a reward starts the workflow', async () => {
    const wf = await activeWorkflow('loyalty_reward_redeemed');
    const { programId, memberId, contactId } = await loyaltySetup();
    await api('POST', `/api/v1/loyalty/programs/${programId}/earn`, {
      contactId,
      eventType: 'signup',
      properties: {},
    });
    const reward = await api('POST', `/api/v1/loyalty/programs/${programId}/rewards`, {
      name: `${TAG} reward`,
      type: 'discount_pct',
      pointCost: 10,
      config: { percent: 5 },
    });
    expect(reward.status, reward.body).toBeLessThan(300);
    const rewardId = reward.json<{ data: { id: string } }>().data.id;

    const redeem = await api(
      'POST',
      `/api/v1/loyalty/programs/${programId}/members/${memberId}/redeem`,
      { rewardId },
    );
    expect(redeem.status, redeem.body).toBe(200);
    expect(await settledRunCount(wf)).toBe(1);
  }, 60_000);

  // ── loyalty_tier_up: all three creditPoints callers ───────────────────────

  it('loyalty_tier_up — fires from the earn-rule path', async () => {
    const wf = await activeWorkflow('loyalty_tier_up');
    const { programId, contactId } = await loyaltySetup();
    const earn = await api('POST', `/api/v1/loyalty/programs/${programId}/earn`, {
      contactId,
      eventType: 'signup',
      properties: {},
    });
    expect(earn.json<{ data: { tieredUp: boolean } }>().data.tieredUp).toBe(true);
    expect(await settledRunCount(wf)).toBe(1);
  }, 60_000);

  it('loyalty_tier_up — fires from the manual admin credit path', async () => {
    const wf = await activeWorkflow('loyalty_tier_up');
    const { programId, memberId } = await loyaltySetup();
    const credit = await api(
      'POST',
      `/api/v1/loyalty/programs/${programId}/members/${memberId}/credit`,
      { points: 500, type: 'bonus' },
    );
    expect(credit.status, credit.body).toBe(200);
    expect(await settledRunCount(wf)).toBe(1);
  }, 60_000);

  it('loyalty_tier_up — fires exactly once from the workflow award-points action', async () => {
    // The count is the point. The odpalovač used to live in this action; it now
    // lives in creditPoints, which the action calls. If both were left in place
    // this reads 2.
    const wf = await activeWorkflow('loyalty_tier_up');
    const { programId, contactId } = await loyaltySetup();
    const awarder = await activeWorkflow(
      'manual',
      {},
      [
        { id: 't', type: 'trigger', config: {} },
        {
          id: 'a1',
          type: 'award_loyalty_points',
          config: { programId, points: 500, description: 'probe' },
        },
      ],
      [{ id: 'x', source: 't', target: 'a1' }],
    );
    const fired = await api('POST', `/api/v1/workflows/${awarder}/trigger`, { contactId });
    expect(fired.status, fired.body).toBe(200);
    expect(await settledRunCount(wf)).toBe(1);
  }, 60_000);

  // ── the two that could not be created ─────────────────────────────────────

  it('segment_entered / segment_exited — accepted by the API and fired by the sync', async () => {
    const entered = await activeWorkflow('segment_entered');
    const exited = await activeWorkflow('segment_exited');

    const marker = `segprobe${Date.now()}`;
    const seg = await api('POST', '/api/v1/segments', {
      name: `${TAG} segment ${marker}`,
      conditions: { operator: 'AND', rules: [{ field: 'email', op: 'contains', value: marker }] },
    });
    expect(seg.status, seg.body).toBeLessThan(300);
    const segmentId = seg.json<{ data: { id: string } }>().data.id;

    const { refreshSegmentMembership } = await import('../services/segments/membership.js');
    // First pass is the baseline — it materializes membership and fires nothing.
    await refreshSegmentMembership(orgId, segmentId);

    const contactId = await newContact(marker);
    const inRes = await refreshSegmentMembership(orgId, segmentId);
    expect(inRes.entered).toBe(1);
    expect(await settledRunCount(entered)).toBe(1);

    // Move the contact out of the segment and reconcile again.
    await db
      .update(contacts)
      .set({ email: `${TAG}-moved-${Date.now()}@probe.test` })
      .where(eq(contacts.id, contactId));
    const outRes = await refreshSegmentMembership(orgId, segmentId);
    expect(outRes.exited).toBe(1);
    expect(await settledRunCount(exited)).toBe(1);

    await db.delete(segments).where(eq(segments.id, segmentId));
  }, 90_000);

  // ── the ones that already worked, so a regression here is visible ─────────

  it('list_subscribe — joining a list starts the workflow', async () => {
    const lists = await api('GET', '/api/v1/lists?limit=5');
    const listId = lists.json<{ data: Array<{ id: string }> }>().data[0]!.id;
    const wf = await activeWorkflow('list_subscribe', { listId });
    const contactId = await newContact('list');
    const res = await api('POST', `/api/v1/lists/${listId}/contacts`, { contactId });
    expect(res.status, res.body).toBeLessThan(300);
    expect(await settledRunCount(wf)).toBe(1);
  }, 60_000);

  it('tag_added — tagging a contact starts the workflow', async () => {
    const tagName = `${TAG}-tag-${Date.now()}`;
    const wf = await activeWorkflow('tag_added', { tagName });
    const tag = await api('POST', '/api/v1/tags', { name: tagName, color: '#ff0000' });
    const tagId = tag.json<{ data: { id: string } }>().data.id;
    const contactId = await newContact('tag');
    const res = await api('POST', '/api/v1/contacts/bulk-tag', {
      contact_ids: [contactId],
      tag_ids: [tagId],
      action: 'add',
    });
    expect(res.status, res.body).toBe(200);
    expect(await settledRunCount(wf)).toBe(1);
  }, 60_000);

  it('api_event — a tracked event starts the workflow', async () => {
    const eventName = `${TAG}_event_${Date.now()}`;
    const wf = await activeWorkflow('api_event', { eventName });
    const contactId = await newContact('event');
    const res = await api('POST', '/api/v1/events', { contactId, eventName, properties: {} });
    expect(res.status, res.body).toBe(200);
    expect(await settledRunCount(wf)).toBe(1);
  }, 60_000);

  it('manual — POST /workflows/:id/trigger starts a run', async () => {
    const wf = await activeWorkflow('manual');
    const contactId = await newContact('manual');
    const res = await api('POST', `/api/v1/workflows/${wf}/trigger`, { contactId });
    expect(res.status, res.body).toBe(200);
    expect(await settledRunCount(wf)).toBe(1);
  }, 60_000);

  it('purchase_event — an ingested order starts the workflow', async () => {
    const wf = await activeWorkflow('purchase_event');
    const contactId = await newContact('order');
    const [contact] = await db
      .select({ email: contacts.email })
      .from(contacts)
      .where(eq(contacts.id, contactId));

    const conn = await api('POST', '/api/v1/ecommerce/connections', {
      platform: 'magento',
      name: `${TAG} magento`,
      baseUrl: 'https://probe.example.com',
      accessToken: 'probe-token',
      webhookSecret: 'probe-secret',
    });
    expect(conn.status, conn.body).toBeLessThan(300);
    const connectionId = conn.json<{ data: { id: string } }>().data.id;

    const hook = await app.inject({
      method: 'POST',
      url: `/api/v1/ecommerce/webhooks/generic/${connectionId}`,
      headers: { 'x-webhook-secret': 'probe-secret' },
      payload: {
        increment_id: `${TAG}-${Date.now()}`,
        entity_id: 1,
        customer_email: contact!.email,
        status: 'complete',
        grand_total: '123.45',
        order_currency_code: 'CZK',
        created_at: new Date().toISOString(),
        items: [{ sku: 'S1', name: 'Probe', qty_ordered: 1, price: 123.45, product_id: 'p1' }],
      },
    });
    expect(hook.statusCode, hook.body).toBe(200);
    expect(await settledRunCount(wf)).toBe(1);
  }, 60_000);

  // ── cron-driven: the "event" is the daily run ─────────────────────────────

  it('date_field — the daily processor starts the workflow', async () => {
    const today = new Date();
    const mmdd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate(),
    ).padStart(2, '0')}`;
    const wf = await activeWorkflow('date_field', { field: 'birthday', offsetDays: 0 });
    const contactId = await newContact('bday', { customFields: { birthday: `1990-${mmdd}` } });

    const { processDailyDateTriggers } = await import('../services/workflows/triggers.js');
    const res = await processDailyDateTriggers();
    expect(res.triggered).toBeGreaterThan(0);
    // Scoped to this contact: the processor sweeps the whole org, and contacts
    // left behind by earlier runs would otherwise inflate a workflow-wide count.
    expect(await settledRunCount(wf, contactId)).toBe(1);
  }, 60_000);

  it('name_day_today — the daily processor starts the workflow', async () => {
    const { nameDaysFor } = await import('@forgemsg/i18n-cs/name-days');
    const today = new Date();
    const names = nameDaysFor(today);
    expect(names.length, "today's CZ jmeniny list is empty").toBeGreaterThan(0);

    const wf = await activeWorkflow('name_day_today');
    const contactId = await newContact('nameday', { firstName: names[0], lastName: 'Probe' });

    const { processDailyNameDayTriggers } = await import('../services/workflows/triggers.js');
    const res = await processDailyNameDayTriggers();
    expect(res.triggered).toBeGreaterThan(0);
    expect(await settledRunCount(wf, contactId)).toBe(1);
  }, 60_000);

  it('n_days_before_holiday — the daily processor starts the workflow', async () => {
    // Find a horizon that actually lands on a CZ holiday, rather than assuming
    // today happens to be one.
    const now = new Date();
    let daysAhead = -1;
    for (let d = 0; d <= 400; d++) {
      if (czechHolidaysInDays(now, d).length > 0) {
        daysAhead = d;
        break;
      }
    }
    expect(daysAhead, 'no CZ holiday within a year').toBeGreaterThanOrEqual(0);

    const wf = await activeWorkflow('n_days_before_holiday', { locale: 'cs', daysAhead });
    const contactId = await newContact('holiday');

    const { processDailyHolidayTriggers } = await import('../services/workflows/triggers.js');
    const res = await processDailyHolidayTriggers(now);
    expect(res.triggered).toBeGreaterThan(0);
    expect(await settledRunCount(wf, contactId)).toBe(1);
  }, 90_000);

  // ── nothing in the enum is left untested ──────────────────────────────────

  it('covers every value of workflowTriggerTypeEnum', () => {
    // Names of the cases above, so adding an enum value without a case here
    // fails instead of quietly going untested.
    const covered = new Set([
      'form_submit',
      'lifecycle_stage_changed',
      'loyalty_points_earned',
      'loyalty_reward_redeemed',
      'loyalty_tier_up',
      'segment_entered',
      'segment_exited',
      'list_subscribe',
      'tag_added',
      'api_event',
      'manual',
      'purchase_event',
      'date_field',
      'name_day_today',
      'n_days_before_holiday',
    ]);
    const missing = workflowTriggerTypeEnum.enumValues.filter((v) => !covered.has(v));
    expect(missing, `no integration case drives: ${missing.join(', ')}`).toEqual([]);
  });
});
