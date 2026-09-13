/**
 * POST /api/v1/rss-campaigns/run-due ran every organisation's feeds.
 *
 * runDueRssCampaigns() selected `rss_campaigns` on `active = true AND
 * next_run_at <= now` and nothing else — no orgId — while the route that calls
 * it sits behind app.authenticate + requireRole('admin', 'owner') and is
 * registered as CORE (apps/api/src/index.ts:484). So an admin of any
 * organisation ran the due feeds of all of them.
 *
 * And "ran" means mail. processOne() inserts a row into `campaigns` with
 * `orgId` taken from the RSS row — the victim's org — `status: 'scheduled'` and
 * `scheduledAt: new Date()`, which is already due. The minute cron
 * POST /api/v1/internal/campaigns/dispatch-scheduled
 * (routes/v1/campaigns.ts:986, behind the internal secret) picks exactly that
 * shape up and calls enqueueCampaignSend, so the campaign reaches the splitter,
 * the batch-sender and the MTA with nobody touching it again. It also moves the
 * victim's own next_run_at and last_seen_guids, so the items that went out this
 * way are marked seen and the victim's real run is skipped.
 *
 * ─── Why the feed comes from a stub ─────────────────────────────────────────
 *
 * processOne's first statement is the feed fetch, and parseFeed goes through
 * lib/safe-fetch, whose SSRF guard refuses loopback: measured here, both
 * `http://127.0.0.1:<port>/f.xml` and `http://localhost:<port>/f.xml` come back
 * as "The URL must resolve to a public internet address". A test server is the
 * only feed available offline, so with the real fetch nothing is ever processed
 * and the damage never lands — the run looks harmless for the victim and for
 * the caller alike. The assertions would pass against the broken code.
 *
 * So the run is driven through `runDueRssCampaigns(orgId, now, { fetchFeed })`,
 * the seam added for exactly this, in the shape blacklist-monitor already uses
 * for its resolver. What that costs in fidelity is stated plainly: this file
 * proves the SELECT is scoped, which is where the defect was, and not that the
 * route passes the right orgId — that is one line,
 * `runDueRssCampaigns(req.user!.orgId)` in routes/v1/rss-campaigns.ts, and the
 * last case here pins that the route still calls the scoped function at all.
 *
 * Nothing is actually sent. The file never calls dispatchScheduledCampaigns and
 * asserts the campaign-splitter queue holds nothing for the campaign that was
 * built, so the proof ends at a scheduled row: no job enqueued, no batch-sender,
 * no engine, no message.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations, lists, rssCampaigns, campaigns } from '../db/schema/index.js';
import { campaignSplitterQueue } from '../lib/queues.js';
import { runDueRssCampaigns, type RssItem } from '../services/rss/index.js';

const tag = randomUUID().slice(0, 8);
const FEED_URL = `https://feed-${tag}.example.invalid/rss.xml`;

let app: FastifyInstance;
/** Owner of the seeded org — the tenant whose run this is. */
let caller: Session;
let victimOrg: string;

const rss = { victimDue: '', callerDue: '', callerNotDue: '' };
const rssName = {
  victimDue: `rss-victim-due-${tag}`,
  callerDue: `rss-caller-due-${tag}`,
  callerNotDue: `rss-caller-notdue-${tag}`,
};

const GUIDS = [`item-one-${tag}`, `item-two-${tag}`];

/** Stands in for the guarded network fetch. Records which feeds were asked for. */
const asked: string[] = [];
const fetchFeed = async (url: string): Promise<RssItem[]> => {
  asked.push(url);
  return [
    { guid: GUIDS[0]!, title: 'First post', link: 'https://example.invalid/1', description: 'One' },
    {
      guid: GUIDS[1]!,
      title: 'Second post',
      link: 'https://example.invalid/2',
      description: 'Two',
    },
  ];
};

const rssRow = async (id: string) =>
  (await db.select().from(rssCampaigns).where(eq(rssCampaigns.id, id)))[0];

/** Campaigns a run produced for one org, found by the name processOne builds. */
const producedCampaigns = async (orgId: string, name: string) =>
  db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), like(campaigns.name, `${name}%`)));

async function seedRss(
  orgId: string,
  listId: string,
  name: string,
  nextRunAt: Date,
): Promise<string> {
  const [row] = await db
    .insert(rssCampaigns)
    .values({
      orgId,
      name,
      feedUrl: FEED_URL,
      listId,
      frequency: 'daily',
      sendTime: '09:00',
      fromName: 'Feed',
      fromEmail: `feed-${tag}@example.invalid`,
      subjectTemplate: '{{rss.title}}',
      active: true,
      lastSeenGuids: [],
      nextRunAt,
    })
    .returning({ id: rssCampaigns.id });
  return row!.id;
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  caller = await login(app);

  const [org] = await db
    .insert(organizations)
    .values({ name: 'rss victim', slug: `rss-victim-${tag}` })
    .returning({ id: organizations.id });
  victimOrg = org!.id;

  const [victimList] = await db
    .insert(lists)
    .values({ orgId: victimOrg, name: `victim list ${tag}` })
    .returning({ id: lists.id });
  const [callerList] = await db
    .insert(lists)
    .values({ orgId: caller.orgId, name: `caller list ${tag}` })
    .returning({ id: lists.id });

  const anHourAgo = new Date(Date.now() - 3_600_000);
  const nextWeek = new Date(Date.now() + 7 * 86_400_000);

  rss.victimDue = await seedRss(victimOrg, victimList!.id, rssName.victimDue, anHourAgo);
  rss.callerDue = await seedRss(caller.orgId, callerList!.id, rssName.callerDue, anHourAgo);
  rss.callerNotDue = await seedRss(caller.orgId, callerList!.id, rssName.callerNotDue, nextWeek);
}, 60_000);

afterAll(async () => {
  for (const name of Object.values(rssName)) {
    await db.delete(campaigns).where(like(campaigns.name, `${name}%`));
  }
  await db.delete(rssCampaigns).where(eq(rssCampaigns.orgId, victimOrg));
  await db.delete(rssCampaigns).where(eq(rssCampaigns.name, rssName.callerDue));
  await db.delete(rssCampaigns).where(eq(rssCampaigns.name, rssName.callerNotDue));
  await db.delete(lists).where(eq(lists.name, `caller list ${tag}`));
  await db.delete(organizations).where(eq(organizations.id, victimOrg));
  await app?.close();
}, 60_000);

describe('running due RSS feeds stops at one organisation', () => {
  it('leaves the other tenant feed untouched and builds no campaign for it', async () => {
    const victimBefore = await rssRow(rss.victimDue);
    expect(victimBefore, 'fixture missing — the victim RSS row was not seeded').toBeDefined();
    expect(victimBefore!.orgId).toBe(victimOrg);
    expect(victimBefore!.orgId).not.toBe(caller.orgId);
    expect(victimBefore!.lastSeenGuids).toEqual([]);
    expect(victimBefore!.lastSentAt).toBeNull();

    const result = await runDueRssCampaigns(caller.orgId, new Date(), { fetchFeed });

    // Exactly one feed ran, and it was not the victim's — the stub records
    // every URL it was asked for, so a second call would show up here.
    expect(result.processed).toBe(1);
    expect(asked).toHaveLength(1);

    // The victim's row, field by field. next_run_at and last_seen_guids matter
    // as much as the campaign: moving them skips the run the victim's own
    // schedule was going to make, and marks the items as already seen.
    const victimAfter = await rssRow(rss.victimDue);
    expect(victimAfter).toBeDefined();
    expect(victimAfter!.lastSeenGuids).toEqual(victimBefore!.lastSeenGuids);
    expect(victimAfter!.lastSentAt).toBe(victimBefore!.lastSentAt);
    expect(victimAfter!.nextRunAt?.getTime()).toBe(victimBefore!.nextRunAt?.getTime());
    expect(victimAfter!.active).toBe(victimBefore!.active);
    expect(victimAfter!.feedUrl).toBe(victimBefore!.feedUrl);

    // And nothing was queued up to send in the victim's name.
    expect(await producedCampaigns(victimOrg, rssName.victimDue)).toHaveLength(0);
  });

  it('still runs the caller own due feed', async () => {
    // Negative control: the scope must not turn the feature off.
    const after = await rssRow(rss.callerDue);
    expect(after).toBeDefined();
    expect(after!.lastSeenGuids).toEqual(GUIDS);
    expect(after!.lastSentAt).not.toBeNull();
    expect(after!.nextRunAt!.getTime()).toBeGreaterThan(Date.now());

    const produced = await producedCampaigns(caller.orgId, rssName.callerDue);
    expect(produced).toHaveLength(1);
    expect(produced[0]!.orgId).toBe(caller.orgId);
    expect(produced[0]!.subject).toBe('First post');
    expect(produced[0]!.status).toBe('scheduled');
  });

  it('leaves a feed that is not due alone, even in the caller own org', async () => {
    // Negative control: "due" still means due, not "mine".
    const after = await rssRow(rss.callerNotDue);
    expect(after).toBeDefined();
    expect(after!.lastSeenGuids).toEqual([]);
    expect(after!.lastSentAt).toBeNull();
    expect(after!.nextRunAt!.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect(await producedCampaigns(caller.orgId, rssName.callerNotDue)).toHaveLength(0);
  });

  it('nothing is on its way to the MTA', async () => {
    // The campaign the run produced is a scheduled row and no more. Dispatch is
    // a separate, internal-only step that this file never calls, so no splitter
    // job exists, no batch-sender runs and the engine is never reached.
    const [produced] = await producedCampaigns(caller.orgId, rssName.callerDue);
    expect(produced!.status).toBe('scheduled');

    const jobs = await campaignSplitterQueue.getJobs(
      ['waiting', 'active', 'delayed', 'completed', 'failed', 'paused'],
      0,
      2_000,
    );
    const mine = jobs.filter(
      (j) => (j.data as { campaignId?: string }).campaignId === produced!.id,
    );
    expect(mine, 'a splitter job exists — this test was supposed to stop before dispatch').toEqual(
      [],
    );
  });

  it('the route still calls the scoped run for the caller own org', async () => {
    // Route-level wiring. The real parseFeed cannot reach anything in this
    // environment, so this cannot show a feed being processed; what it does
    // show is that the route answers, runs the scoped function, and leaves the
    // victim's row alone on its own account too.
    const victimBefore = await rssRow(rss.victimDue);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/rss-campaigns/run-due',
      headers: { cookie: caller.cookie },
    });
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    const victimAfter = await rssRow(rss.victimDue);
    expect(victimAfter!.lastSeenGuids).toEqual(victimBefore!.lastSeenGuids);
    expect(victimAfter!.nextRunAt?.getTime()).toBe(victimBefore!.nextRunAt?.getTime());
    expect(await producedCampaigns(victimOrg, rssName.victimDue)).toHaveLength(0);
  });
});
