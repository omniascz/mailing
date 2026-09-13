/**
 * POST /t/id wrote a contact_id onto another organisation's tracking rows.
 *
 * identifyVisitor resolves the contact correctly — `eq(contacts.orgId,
 * site.orgId)` — and then throws that scope away: the two back-fills matched on
 * `visitor_id` alone, with no org_id and no site_id, even though both tables
 * carry `org_id NOT NULL` and `site_id NOT NULL` and the insert path sets them
 * (recordPageView, recordEvent). The route is `POST /t/id`
 * (routes/v1/site-tracking.ts:185), registered as CORE at index.ts:549 with **no
 * authentication at all**, and `visitorId` comes straight out of the request
 * body (identifyBody: z.string().min(1)).
 *
 * The visitor id is not a secret and not unguessable either. The on-page
 * snippet mints it with `Math.random()` (the `uuid()` helper in the served
 * tracker script) and keeps it in the `_fm_vid` cookie for a year, and every
 * beacon the page sends carries it in the request body.
 *
 * What the write costs the victim, in both directions:
 *  - their rows stop being claimable. The back-fill only takes rows where
 *    contact_id IS NULL, so once a foreign id is in there the victim's own
 *    identify call skips them for good and those page views are never
 *    attributed to the person who actually made them;
 *  - and their own readers now join on a contact from another tenant.
 *    services/ads/providers/sklik/pixel.ts:189 joins `contacts` on
 *    `sitePageViews.contactId` while filtering only the page views by org, so a
 *    foreign contact's email and phone come back as part of the victim's Sklik
 *    audience. engagement-score/index.ts:309 counts the views for a contact id
 *    the victim does not own, and cdp/unified-profile.ts:190 reads the same
 *    column for the contact timeline behind routes/v1/cdp/profile.ts.
 *
 * The fix is a direct filter, not a subquery: `org_id` is on both tables and
 * indexed (site_page_views_org_idx, site_events_org_idx, verified against
 * forgemsg_itest2). It is also the shape the sibling module already uses —
 * services/identity-merge/index.ts:89 back-fills site_events with
 * `WHERE org_id = ... AND visitor_id = ... AND contact_id IS NULL`.
 *
 * On silent green: a test that only checked the victim would also pass against
 * a run that did nothing at all, so every case here first pins that the
 * caller's own rows were claimed, by id and by count.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  organizations,
  contacts,
  trackedSites,
  sitePageViews,
  siteEvents,
} from '../db/schema/index.js';

const tag = randomUUID().slice(0, 8);

/** The one visitor id both organisations happen to have rows for. */
const SHARED_VISITOR = `vid-shared-${tag}`;
/** A visitor id nobody has rows for. */
const ORPHAN_VISITOR = `vid-orphan-${tag}`;

let app: FastifyInstance;
let callerOrg: string;
let victimOrg: string;
let callerSiteToken: string;
let callerContactId: string;
let victimContactId: string;

/** Row ids, so assertions name rows instead of counting blindly. */
const id = {
  callerPv1: '',
  callerPv2: '',
  callerEv: '',
  victimPv1: '',
  victimPv2: '',
  victimEv: '',
};

const pv = async (rowId: string) =>
  (await db.select().from(sitePageViews).where(eq(sitePageViews.id, rowId)))[0];
const ev = async (rowId: string) =>
  (await db.select().from(siteEvents).where(eq(siteEvents.id, rowId)))[0];

/** How many of an org's rows for this visitor are still unclaimed. */
async function unclaimed(orgId: string, visitorId: string): Promise<number> {
  const views = await db
    .select({ id: sitePageViews.id })
    .from(sitePageViews)
    .where(
      and(
        eq(sitePageViews.orgId, orgId),
        eq(sitePageViews.visitorId, visitorId),
        isNull(sitePageViews.contactId),
      ),
    );
  const events = await db
    .select({ id: siteEvents.id })
    .from(siteEvents)
    .where(
      and(
        eq(siteEvents.orgId, orgId),
        eq(siteEvents.visitorId, visitorId),
        isNull(siteEvents.contactId),
      ),
    );
  return views.length + events.length;
}

async function seedOrg(
  name: string,
  email: string,
): Promise<{ orgId: string; siteId: string; siteToken: string; contactId: string }> {
  const [org] = await db
    .insert(organizations)
    .values({ name, slug: `${name}-${tag}` })
    .returning({ id: organizations.id });
  const siteToken = `tok-${name}-${tag}`;
  const [site] = await db
    .insert(trackedSites)
    .values({
      orgId: org!.id,
      siteToken,
      domain: `${name}-${tag}.example.invalid`,
      name: `${name} site`,
      trackingEnabled: true,
    })
    .returning({ id: trackedSites.id });
  const [contact] = await db
    .insert(contacts)
    .values({ orgId: org!.id, email })
    .returning({ id: contacts.id });
  return { orgId: org!.id, siteId: site!.id, siteToken, contactId: contact!.id };
}

async function seedRows(
  orgId: string,
  siteId: string,
  visitorId: string,
): Promise<{ pv1: string; pv2: string; ev: string }> {
  const [v1] = await db
    .insert(sitePageViews)
    .values({ orgId, siteId, visitorId, url: 'https://example.invalid/a', path: '/a' })
    .returning({ id: sitePageViews.id });
  const [v2] = await db
    .insert(sitePageViews)
    .values({ orgId, siteId, visitorId, url: 'https://example.invalid/b', path: '/b' })
    .returning({ id: sitePageViews.id });
  const [e1] = await db
    .insert(siteEvents)
    .values({ orgId, siteId, visitorId, eventName: 'added_to_cart' })
    .returning({ id: siteEvents.id });
  return { pv1: v1!.id, pv2: v2!.id, ev: e1!.id };
}

const callerEmail = `caller-${tag}@example.invalid`;

const identify = async (body: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/t/id', payload: body });

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();

  const caller = await seedOrg('tracker-caller', callerEmail);
  const victim = await seedOrg('tracker-victim', `victim-${tag}@example.invalid`);
  callerOrg = caller.orgId;
  callerSiteToken = caller.siteToken;
  callerContactId = caller.contactId;
  victimOrg = victim.orgId;
  victimContactId = victim.contactId;

  const c = await seedRows(caller.orgId, caller.siteId, SHARED_VISITOR);
  const v = await seedRows(victim.orgId, victim.siteId, SHARED_VISITOR);
  id.callerPv1 = c.pv1;
  id.callerPv2 = c.pv2;
  id.callerEv = c.ev;
  id.victimPv1 = v.pv1;
  id.victimPv2 = v.pv2;
  id.victimEv = v.ev;
}, 60_000);

afterAll(async () => {
  for (const orgId of [callerOrg, victimOrg]) {
    await db.delete(sitePageViews).where(eq(sitePageViews.orgId, orgId));
    await db.delete(siteEvents).where(eq(siteEvents.orgId, orgId));
    await db.delete(trackedSites).where(eq(trackedSites.orgId, orgId));
    await db.delete(contacts).where(eq(contacts.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  await app?.close();
}, 60_000);

describe('identifying a visitor claims only the rows of the site that asked', () => {
  it('claims the caller own rows and leaves the other tenant rows null', async () => {
    // Preconditions, so a fixture that never landed cannot look like a pass.
    expect(await unclaimed(callerOrg, SHARED_VISITOR)).toBe(3);
    expect(await unclaimed(victimOrg, SHARED_VISITOR)).toBe(3);
    const victimPv1Before = await pv(id.victimPv1);
    const victimEvBefore = await ev(id.victimEv);
    expect(victimPv1Before!.contactId).toBeNull();

    const res = await identify({
      siteToken: callerSiteToken,
      visitorId: SHARED_VISITOR,
      email: callerEmail,
    });
    expect(res.statusCode, `body: ${res.body}`).toBe(200);
    expect((res.json() as { contactId: string | null }).contactId).toBe(callerContactId);

    // FIRST the caller's own rows, by id and by count. This is the guard against
    // a silent green: the route answers 200 even when it does nothing, so
    // without this the victim assertions below would also pass against a run
    // that never reached the UPDATE.
    expect((await pv(id.callerPv1))!.contactId).toBe(callerContactId);
    expect((await pv(id.callerPv2))!.contactId).toBe(callerContactId);
    expect((await ev(id.callerEv))!.contactId).toBe(callerContactId);
    expect(await unclaimed(callerOrg, SHARED_VISITOR), 'three caller rows should be claimed').toBe(
      0,
    );

    // THEN the victim, field by field. contact_id is the column that matters,
    // but org_id, site_id and visitor_id are checked too: a write that moved a
    // row between sites would be just as wrong.
    const victimPv1After = await pv(id.victimPv1);
    expect(victimPv1After!.contactId).toBeNull();
    expect(victimPv1After!.orgId).toBe(victimPv1Before!.orgId);
    expect(victimPv1After!.siteId).toBe(victimPv1Before!.siteId);
    expect(victimPv1After!.visitorId).toBe(victimPv1Before!.visitorId);
    expect(victimPv1After!.url).toBe(victimPv1Before!.url);

    expect((await pv(id.victimPv2))!.contactId).toBeNull();

    const victimEvAfter = await ev(id.victimEv);
    expect(victimEvAfter!.contactId).toBeNull();
    expect(victimEvAfter!.orgId).toBe(victimEvBefore!.orgId);
    expect(victimEvAfter!.siteId).toBe(victimEvBefore!.siteId);
    expect(victimEvAfter!.eventName).toBe(victimEvBefore!.eventName);

    expect(await unclaimed(victimOrg, SHARED_VISITOR), 'victim rows must stay unclaimed').toBe(3);
  });

  it('the victim can still claim their own rows afterwards', async () => {
    // Negative control, and the point of the whole fix: the foreign write used
    // to make these rows unclaimable for good, because the back-fill only takes
    // contact_id IS NULL.
    const victimSite = await db
      .select({ siteToken: trackedSites.siteToken })
      .from(trackedSites)
      .where(eq(trackedSites.orgId, victimOrg));
    const victimEmail = (
      await db.select({ email: contacts.email }).from(contacts).where(eq(contacts.orgId, victimOrg))
    )[0]!.email!;

    const res = await identify({
      siteToken: victimSite[0]!.siteToken,
      visitorId: SHARED_VISITOR,
      email: victimEmail,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { contactId: string | null }).contactId).toBe(victimContactId);

    expect((await pv(id.victimPv1))!.contactId).toBe(victimContactId);
    expect((await pv(id.victimPv2))!.contactId).toBe(victimContactId);
    expect((await ev(id.victimEv))!.contactId).toBe(victimContactId);
    expect(await unclaimed(victimOrg, SHARED_VISITOR)).toBe(0);

    // And the caller's rows still belong to the caller's contact.
    expect((await pv(id.callerPv1))!.contactId).toBe(callerContactId);
  });

  it('a visitor id with no rows changes nothing and still answers', async () => {
    // Negative control: the orphan case must not throw and must not touch
    // anyone's rows.
    const res = await identify({
      siteToken: callerSiteToken,
      visitorId: ORPHAN_VISITOR,
      email: callerEmail,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { contactId: string | null }).contactId).toBe(callerContactId);

    expect((await pv(id.callerPv1))!.contactId).toBe(callerContactId);
    expect((await pv(id.victimPv1))!.contactId).toBe(victimContactId);
    expect(await unclaimed(callerOrg, ORPHAN_VISITOR)).toBe(0);
  });
});
