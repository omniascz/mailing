/**
 * Scheduling a campaign, end to end against a real database.
 *
 * The chain being exercised is the whole one the UI now depends on:
 *
 *   POST :id/schedule  ->  campaigns.status = 'scheduled', scheduled_at set
 *   dispatchScheduledCampaigns()  ->  picks it up when the time arrives
 *   enqueueCampaignSend  ->  status leaves 'scheduled'
 *
 * The one link no test can assert is that the workers process is deployed and
 * running. Everything up to it is here; that the BullMQ repeatable itself
 * produces a live schedule was measured separately — registering
 * `campaign-dispatch` with `* * * * *` against Redis returns a repeatable whose
 * `next` is inside the following minute, with a delayed job behind it.
 *
 * WHAT THIS TEST CANNOT SEE
 * -------------------------
 * - It calls dispatchScheduledCampaigns() directly rather than waiting a minute
 *   for the cron to call it. The worker between them is three lines
 *   (workflow-scheduler.ts) and posts to /internal/campaigns/dispatch-scheduled.
 * - It stops at the enqueue. Whether the splitter then produces batches and the
 *   mail leaves is the splitter's own suite.
 * - It does not render anything. The UI half is
 *   apps/web/src/app/(dashboard)/campaigns/[id]/campaign-actions.test.tsx.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { campaigns, contacts, contactLists, lists, sendingDomains } from '../db/schema/index.js';
import { dispatchScheduledCampaigns } from '../services/campaigns/dispatch.js';

let app: FastifyInstance;
let session: Session;

const TAG = `sch-${randomUUID().slice(0, 8)}`;
const SEND_DOMAIN = `${TAG}.test`;
const BODY = { html: '<p>Ahoj</p>', plainText: 'Ahoj' };

let listId: string;
const createdCampaigns: string[] = [];
const createdContacts: string[] = [];

/** The exact payload buildSchedulePayload produces for a future wall clock. */
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

async function newDraft(name: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    headers: { cookie: session.cookie },
    payload: {
      name: `${TAG} ${name}`,
      subject: 'Ahoj',
      fromName: 'ForgeMsg',
      fromEmail: `demo@${SEND_DOMAIN}`,
      listId,
      content: BODY,
    },
  });
  expect(res.statusCode, res.body.slice(0, 300)).toBe(201);
  const id = (res.json() as { data: { id: string } }).data.id;
  createdCampaigns.push(id);
  return id;
}

const post = (id: string, action: string, payload?: unknown) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${id}/${action}`,
    headers: { cookie: session.cookie },
    payload: payload as never,
  });

async function read(id: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/campaigns/${id}`,
    headers: { cookie: session.cookie },
  });
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
  return (res.json() as { data: Record<string, unknown> }).data;
}

/** Move the campaign's scheduled time into the past, so the cron sees it as due. */
const makeDue = (id: string) =>
  db
    .update(campaigns)
    .set({ scheduledAt: new Date(Date.now() - 60_000) })
    .where(eq(campaigns.id, id));

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);

  // enqueueCampaignSend refuses an unverified From before it does anything else.
  await db.insert(sendingDomains).values({
    orgId: session.orgId,
    domain: SEND_DOMAIN,
    isVerified: true,
    dkimVerified: true,
    spfVerified: true,
  });

  const [l] = await db
    .insert(lists)
    .values({ orgId: session.orgId, name: `${TAG} list` })
    .returning({ id: lists.id });
  listId = l!.id;

  const [c] = await db
    .insert(contacts)
    .values({ orgId: session.orgId, email: `${TAG}@example.test`, status: 'active' })
    .returning({ id: contacts.id });
  createdContacts.push(c!.id);
  await db.insert(contactLists).values({ contactId: c!.id, listId });
}, 180_000);

afterAll(async () => {
  for (const id of createdCampaigns) await db.delete(campaigns).where(eq(campaigns.id, id));
  await db.delete(contactLists).where(eq(contactLists.listId, listId));
  for (const id of createdContacts) await db.delete(contacts).where(eq(contacts.id, id));
  await db.delete(lists).where(eq(lists.id, listId));
  await db.delete(sendingDomains).where(eq(sendingDomains.domain, SEND_DOMAIN));
  await app?.close();
}, 180_000);

describe('scheduling a campaign', () => {
  it('stores the instant the UI sends and moves the campaign to scheduled', async () => {
    const id = await newDraft('basic');
    const when = inHours(4);

    const res = await post(id, 'schedule', { scheduledAt: when });
    expect(res.statusCode, res.body.slice(0, 400)).toBe(200);

    const stored = await read(id);
    expect(stored.status).toBe('scheduled');
    expect(new Date(stored.scheduledAt as string).toISOString()).toBe(when);
  });

  it('refuses a time that has already passed', async () => {
    const id = await newDraft('past');
    const res = await post(id, 'schedule', { scheduledAt: inHours(-1) });

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('must be in the future');
    // Refused means refused: the campaign is untouched, not sent immediately.
    const stored = await read(id);
    expect(stored.status).toBe('draft');
    expect(stored.scheduledAt).toBeNull();
  });

  it('refuses a campaign that is not ready, before it books a date for it', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { cookie: session.cookie },
      payload: { name: `${TAG} bare` },
    });
    const bare = (res.json() as { data: { id: string } }).data.id;
    createdCampaigns.push(bare);

    const sched = await post(bare, 'schedule', { scheduledAt: inHours(4) });
    expect(sched.statusCode).toBe(400);
    expect(sched.body).toContain('not ready');
    expect((await read(bare)).status).toBe('draft');
  });
});

describe('the cron picks a scheduled campaign up when its time arrives', () => {
  it('leaves a campaign whose time has not come alone', async () => {
    const id = await newDraft('future');
    expect((await post(id, 'schedule', { scheduledAt: inHours(4) })).statusCode).toBe(200);

    await dispatchScheduledCampaigns();

    expect((await read(id)).status).toBe('scheduled');
  });

  it('dispatches one whose time has come', async () => {
    const id = await newDraft('due');
    expect((await post(id, 'schedule', { scheduledAt: inHours(4) })).statusCode).toBe(200);
    await makeDue(id);

    const result = await dispatchScheduledCampaigns();
    expect(result.errors).toBe(0);
    expect(result.dispatched).toBeGreaterThanOrEqual(1);

    // It has left 'scheduled' — the send is under way, so the cron will not
    // pick it up a second time (the select only ever takes 'scheduled').
    const after = (await read(id)).status;
    expect(after).not.toBe('scheduled');
    expect(['queueing', 'sending', 'sent']).toContain(after);
  });
});

describe('taking a campaign off the schedule', () => {
  it('puts it back in draft and clears the time', async () => {
    const id = await newDraft('unsched');
    expect((await post(id, 'schedule', { scheduledAt: inHours(4) })).statusCode).toBe(200);

    const res = await post(id, 'unschedule');
    expect(res.statusCode, res.body.slice(0, 400)).toBe(200);

    const stored = await read(id);
    expect(stored.status).toBe('draft');
    // Cleared, not left behind — a stale time would keep showing on the detail
    // page and in the campaign list as though a send were still coming.
    expect(stored.scheduledAt).toBeNull();
  });

  it('really stops the send: an unscheduled campaign that was due is not dispatched', async () => {
    const id = await newDraft('withdrawn');
    expect((await post(id, 'schedule', { scheduledAt: inHours(4) })).statusCode).toBe(200);
    await makeDue(id);
    expect((await post(id, 'unschedule')).statusCode).toBe(200);

    const result = await dispatchScheduledCampaigns();
    expect(result.errors).toBe(0);

    // Still a draft. Without the status re-read in the dispatch loop this is
    // the case that would send anyway: the select can be seconds stale, and
    // `draft → queueing` is a legal transition.
    expect((await read(id)).status).toBe('draft');
  });

  it('survives an unschedule that lands while the dispatch loop is running', async () => {
    // A real interleave, not a simulated one: the dispatch select goes out
    // first and the unschedule follows while the loop is busy with the other
    // campaign, which takes many round trips (sandbox gate, From-domain check,
    // the status flip, the Redis enqueue).
    //
    // The interleave is NOT forced — if the update happens to land before the
    // select, the row is simply never selected. Both orderings have the same
    // right answer, and that answer is what is asserted: the campaign the
    // operator withdrew does not go out. `withdrawn` is reported for the
    // ordering where the loop did see it, and is checked for shape rather than
    // for a value this test cannot pin.
    const busy = await newDraft('race-busy');
    const withdrawn = await newDraft('race-withdrawn');
    for (const id of [busy, withdrawn]) {
      expect((await post(id, 'schedule', { scheduledAt: inHours(4) })).statusCode).toBe(200);
      await makeDue(id);
    }

    const dispatching = dispatchScheduledCampaigns();
    const stopped = await post(withdrawn, 'unschedule');
    const result = await dispatching;

    expect(stopped.statusCode, stopped.body.slice(0, 300)).toBe(200);
    expect(typeof result.withdrawn).toBe('number');
    expect(result.errors).toBe(0);

    // The one that matters. Without the status re-read in the dispatch loop
    // this is the campaign that would send anyway, because the select is stale
    // by then and `draft → queueing` is a legal transition.
    expect((await read(withdrawn)).status).toBe('draft');
    expect((await read(withdrawn)).scheduledAt).toBeNull();
  });

  it('refuses to unschedule a campaign that was never scheduled', async () => {
    const id = await newDraft('notsched');
    const res = await post(id, 'unschedule');
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('draft → draft');
  });
});
