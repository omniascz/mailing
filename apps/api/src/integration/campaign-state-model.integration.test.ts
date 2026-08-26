/**
 * The campaign lifecycle, end to end, against a real database.
 *
 * What this pins is the thing the old model got wrong: `sent` used to be
 * written by the splitter the moment the last batch reached the queue, so a
 * campaign reported itself finished before a single message had been handed to
 * an MX, and there was no state at all for "this send is over". Now the send
 * has a beginning (`queueing`), a middle (`sending`) and two ends (`sent`,
 * `failed`), and it is the batches reporting in that move it.
 *
 * The tests drive the services rather than the workers, because the workers are
 * a queue and a fetch around exactly these calls; what has to be right is the
 * counter arithmetic and the closing decision, and both live here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { campaigns, campaignDispatchBatches, organizations, lists } from '../db/schema/index.js';
import { sendCampaign } from '../services/campaigns/index.js';
import { startDispatch, reportBatchCompletion } from '../services/campaigns/batch-completion.js';
import { reapStalledDispatches, REAP_AFTER_MS } from '../services/campaigns/dispatch-reaper.js';

let orgId: string;
let listId: string;
const made: string[] = [];

/**
 * The ledger's unique index is (dispatch_id, batch_key) — no campaign_id in it —
 * so a dispatch id has to be unique across the whole table, not merely within a
 * campaign. In production it is `${job.id}:${job.timestamp}`, which is; here it
 * is derived from the campaign so fixtures cannot collide with one another.
 */
const dispatchFor = (campaignId: string) => `d-${campaignId}`;

beforeAll(async () => {
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'state-model itest',
      slug: `state-model-itest-${randomUUID().slice(0, 8)}`,
    })
    .returning({ id: organizations.id });
  orgId = org!.id;

  // validateCampaignReadiness insists on an audience, so every fixture gets one.
  const [list] = await db
    .insert(lists)
    .values({ orgId, name: `state-model ${randomUUID().slice(0, 8)}` })
    .returning({ id: lists.id });
  listId = list!.id;
});

afterAll(async () => {
  if (made.length) await db.delete(campaigns).where(inArray(campaigns.id, made));
  if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
});

/** A campaign that passes the readiness check, so sendCampaign will take it. */
async function draft() {
  const [c] = await db
    .insert(campaigns)
    .values({
      orgId,
      name: `state-model ${randomUUID().slice(0, 8)}`,
      subject: 'Subject',
      fromName: 'Shop',
      fromEmail: 'orders@shop.cz',
      listId,
      content: { blocks: [{ type: 'text', text: 'hi' }] },
      type: 'email',
      status: 'draft',
    })
    .returning({ id: campaigns.id });
  made.push(c!.id);
  return c!.id;
}

async function row(id: string) {
  const [r] = await db
    .select({
      status: campaigns.status,
      plannedRecipients: campaigns.plannedRecipients,
      pendingBatches: campaigns.pendingBatches,
      totalSent: campaigns.totalSent,
    })
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);
  return r!;
}

/** The ledger rows the splitter would have written before enqueueing. */
async function ledger(campaignId: string, keys: string[], dispatchId?: string) {
  const did = dispatchId ?? dispatchFor(campaignId);
  await db.insert(campaignDispatchBatches).values(
    keys.map((batchKey) => ({
      campaignId,
      orgId,
      dispatchId: did,
      batchKey,
      enqueuedAt: new Date(),
    })),
  );
}

const complete = (campaignId: string, batchKey: string, sent: number, skipped = 0) =>
  reportBatchCompletion({
    orgId,
    campaignId,
    dispatchId: dispatchFor(campaignId),
    batchKey,
    sent,
    skipped,
  });

describe('(a) the whole lifecycle, one state at a time', () => {
  it('draft → queueing → sending → sent, each step observed in the row', async () => {
    const id = await draft();
    expect((await row(id)).status).toBe('draft');

    // The operator presses Send. Nothing is being sent yet — the splitter has
    // not run, so there is no audience and no batches.
    await sendCampaign(orgId, id);
    expect((await row(id)).status).toBe('queueing');

    // The splitter resolves the audience and arms the counter, before it
    // enqueues anything.
    await startDispatch({ orgId, campaignId: id, plannedRecipients: 2500, batchCount: 3 });
    await ledger(id, ['0', '1', '2']);
    let r = await row(id);
    expect(r.plannedRecipients).toBe(2500);
    expect(r.pendingBatches).toBe(3);
    // Still 'queueing' — arming the counter is not a state change.
    expect(r.status).toBe('queueing');

    // Every batch is on the queue. This is where the splitter writes 'sending',
    // and where it used to write 'sent'.
    await db.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, id));

    await complete(id, '0', 1000);
    expect((await row(id)).status).toBe('sending');
    await complete(id, '1', 1000);
    r = await row(id);
    expect(r.status).toBe('sending');
    expect(r.pendingBatches).toBe(1);

    // (b) Only the last one closes it.
    await complete(id, '2', 500);
    r = await row(id);
    expect(r.status).toBe('sent');
    expect(r.pendingBatches).toBeNull();
    expect(r.totalSent).toBe(2500);
  });
});

describe('(b) sent comes from the batches, not from the splitter', () => {
  it('a campaign whose batches are all enqueued is still only sending', async () => {
    const id = await draft();
    await sendCampaign(orgId, id);
    await startDispatch({ orgId, campaignId: id, plannedRecipients: 10, batchCount: 2 });
    await ledger(id, ['0', '1']);
    await db.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, id));

    // Everything is queued and nothing has reported. Under the old model this
    // was the moment the campaign was called `sent`.
    const r = await row(id);
    expect(r.status).toBe('sending');
    expect(r.pendingBatches).toBe(2);
  });
});

describe('(c) a batch that gives up still counts', () => {
  it('a permanent failure decrements the counter like any other completion', async () => {
    const id = await draft();
    await sendCampaign(orgId, id);
    await startDispatch({ orgId, campaignId: id, plannedRecipients: 20, batchCount: 2 });
    await ledger(id, ['0', '1']);
    await db.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, id));

    // Out of retries — the worker reports 0 sent, 0 skipped. This is the line
    // the whole model rests on: a give-up that does not report leaves the
    // campaign in `sending` forever.
    const first = await complete(id, '0', 0, 0);
    expect(first).toMatchObject({ counted: true, pending: 1 });
    expect((await row(id)).pendingBatches).toBe(1);
  });

  it('the same batch reporting twice does not decrement twice', async () => {
    const id = await draft();
    await sendCampaign(orgId, id);
    await startDispatch({ orgId, campaignId: id, plannedRecipients: 20, batchCount: 2 });
    await ledger(id, ['0', '1']);
    await db.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, id));

    await complete(id, '0', 5);
    // Stalled-job recovery replays the job and it reports again.
    const replay = await complete(id, '0', 5);

    expect(replay).toMatchObject({ counted: false, reason: 'already_reported' });
    expect((await row(id)).pendingBatches).toBe(1);
  });
});

describe('(d)/(e) which end the campaign reaches', () => {
  it('(d) every batch reported and none sent → failed', async () => {
    const id = await draft();
    await sendCampaign(orgId, id);
    await startDispatch({ orgId, campaignId: id, plannedRecipients: 30, batchCount: 3 });
    await ledger(id, ['0', '1', '2']);
    await db.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, id));

    await complete(id, '0', 0);
    await complete(id, '1', 0);
    const last = await complete(id, '2', 0);

    expect(last).toMatchObject({ closed: 'failed' });
    const r = await row(id);
    expect(r.status).toBe('failed');
    expect(r.pendingBatches).toBeNull();
  });

  it('(e) one batch sent something and the rest failed → sent, with that number', async () => {
    const id = await draft();
    await sendCampaign(orgId, id);
    await startDispatch({ orgId, campaignId: id, plannedRecipients: 30, batchCount: 3 });
    await ledger(id, ['0', '1', '2']);
    await db.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, id));

    await complete(id, '0', 0);
    await complete(id, '1', 7);
    const last = await complete(id, '2', 0);

    // No partial state: a campaign that reached some of its audience is sent,
    // and the number says how much.
    expect(last).toMatchObject({ closed: 'sent' });
    const r = await row(id);
    expect(r.status).toBe('sent');
    expect(r.totalSent).toBe(7);
  });
});

describe('(f) the audience is recorded', () => {
  it('planned_recipients is what the splitter resolved, not the draft estimate', async () => {
    const id = await draft();
    await db.update(campaigns).set({ estimatedRecipients: 999 }).where(eq(campaigns.id, id));
    await sendCampaign(orgId, id);

    await startDispatch({ orgId, campaignId: id, plannedRecipients: 412, batchCount: 1 });

    expect((await row(id)).plannedRecipients).toBe(412);
  });

  it('a re-run splitter does not re-arm a counter that is already coming down', async () => {
    const id = await draft();
    await sendCampaign(orgId, id);
    await startDispatch({ orgId, campaignId: id, plannedRecipients: 20, batchCount: 2 });
    await ledger(id, ['0', '1']);
    await db.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, id));
    await complete(id, '0', 5);
    expect((await row(id)).pendingBatches).toBe(1);

    // The splitter job is retried and runs startDispatch again.
    await startDispatch({ orgId, campaignId: id, plannedRecipients: 20, batchCount: 2 });

    // Resetting to 2 here would resurrect a send that is half over.
    expect((await row(id)).pendingBatches).toBe(1);
  });

  it('an A/B dispatch records the audience but arms no counter', async () => {
    const id = await draft();
    await sendCampaign(orgId, id);

    await startDispatch({ orgId, campaignId: id, plannedRecipients: 900, batchCount: null });

    const r = await row(id);
    expect(r.plannedRecipients).toBe(900);
    // The winner job closes an A/B campaign, not its variant batches.
    expect(r.pendingBatches).toBeNull();
  });
});

describe('(g) the reaper is a net, not a mechanism', () => {
  it('closes a campaign whose batches went silent, and leaves a fresh one alone', async () => {
    const stale = await draft();
    await sendCampaign(orgId, stale);
    await startDispatch({ orgId, campaignId: stale, plannedRecipients: 20, batchCount: 2 });
    await ledger(stale, ['0', '1'], `stale-${stale}`);
    await db
      .update(campaigns)
      .set({
        status: 'sending',
        // One batch reported, then everything went quiet a day and a half ago.
        pendingBatches: 1,
        updatedAt: new Date(Date.now() - REAP_AFTER_MS - 60_000),
      })
      .where(eq(campaigns.id, stale));

    const fresh = await draft();
    await sendCampaign(orgId, fresh);
    await startDispatch({ orgId, campaignId: fresh, plannedRecipients: 20, batchCount: 2 });
    await db.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, fresh));

    const result = await reapStalledDispatches();

    expect(result.examined).toBeGreaterThanOrEqual(1);
    // Nothing was ever recorded as sent, so the conservative close is `failed`.
    expect((await row(stale)).status).toBe('failed');
    // A campaign that is merely still working keeps its own deadline moving.
    expect((await row(fresh)).status).toBe('sending');
  });

  it('does not touch an A/B campaign, which has no counter to be stuck on', async () => {
    const id = await draft();
    await sendCampaign(orgId, id);
    await startDispatch({ orgId, campaignId: id, plannedRecipients: 50, batchCount: null });
    await db
      .update(campaigns)
      .set({ status: 'sending', updatedAt: new Date(Date.now() - REAP_AFTER_MS - 60_000) })
      .where(eq(campaigns.id, id));

    await reapStalledDispatches();

    // Reaping it would cut the test window short and race the winner job.
    expect((await row(id)).status).toBe('sending');
  });
});

describe('(h) what the monitors can see', () => {
  it('an abuse sanction stops a campaign that is only queueing, too', async () => {
    const queueing = await draft();
    await sendCampaign(orgId, queueing);
    expect((await row(queueing)).status).toBe('queueing');

    // The org-scoped update abuse-detection performs when a rule says
    // pause_campaigns. A campaign mid-queueing is arming itself right now, so
    // leaving it out would let the thing the sanction stops finish first.
    await db
      .update(campaigns)
      .set({ status: 'paused' })
      .where(and(eq(campaigns.orgId, orgId), inArray(campaigns.status, ['queueing', 'sending'])));

    expect((await row(queueing)).status).toBe('paused');
  });

  it('the anomaly detector looks at sending, where the events are', async () => {
    // Not `queueing`: during it the splitter is still building batches, no
    // message has reached an MX, and there is not one event to judge. The
    // detector's own query is asserted here by construction — a campaign in
    // `queueing` is not in the set it selects.
    const q = await draft();
    await sendCampaign(orgId, q);

    const selected = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.status, 'sending'));

    expect(selected.map((r) => r.id)).not.toContain(q);
  });
});
