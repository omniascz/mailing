/**
 * Identifying a visitor never merged their anonymous profile.
 *
 * site-tracker called `mergeVisitorIntoContact(input.visitorId, contactId)`
 * against a signature of `(orgId, { visitorId, contactId })`, through an
 * `as unknown as (a: string, b: string) => Promise<void>` cast that stopped
 * TypeScript from noticing. Measured against the real database before the fix:
 * it threw on the very first statement, every time, for a UUID-shaped visitor id
 * and for a non-UUID one alike —
 *
 *   update "anonymous_profiles" set "merged_at" = $1
 *   where ("org_id" = $2 and "visitor_id" = $3)
 *   params: 2026-…Z, 9a9faf4b-…(the VISITOR id, in the org_id slot),
 *   cause: UNDEFINED_VALUE: Undefined values are not allowed
 *
 * `merged_into` is not even in that SET list, because `input.contactId` was
 * `undefined` too — `input` was a string. And the `.catch(() => {})` around the
 * call swallowed the throw, so the route answered 200 and nothing anywhere said
 * a thing. `anonymous_profiles.merged_into` was never written by this path, for
 * any visitor, ever; `listUnmerged` therefore returned every profile forever.
 *
 * The fix is the call, not the function: mergeVisitorIntoContact filters on
 * org_id in both of its statements (services/identity-merge/index.ts:80 and :89),
 * so correcting the arguments cannot reach another tenant. The second case below
 * is what holds that claim up rather than asserting it.
 *
 * On silent green: the route answers 200 whatever happens, and the merge is the
 * last thing in the `if (contactId)` block. So every case first checks that the
 * two back-fills just above it ran — if the request had not reached that block
 * at all, a test that only looked at merged_into would pass against the broken
 * code as happily as against the fixed one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  organizations,
  contacts,
  trackedSites,
  sitePageViews,
  siteEvents,
  anonymousProfiles,
} from '../db/schema/index.js';

const tag = randomUUID().slice(0, 8);
/** Shaped like the id the on-page tracker mints, and shared by both orgs. */
const SHARED_VISITOR = randomUUID();
const ORPHAN_VISITOR = randomUUID();

let app: FastifyInstance;
let callerOrg: string;
let victimOrg: string;
let callerToken: string;
let callerContactId: string;
const callerEmail = `merge-caller-${tag}@example.invalid`;

const ids = { callerPv: '', callerEv: '', victimEv: '' };

const profile = async (orgId: string, visitorId: string) =>
  (
    await db
      .select()
      .from(anonymousProfiles)
      .where(and(eq(anonymousProfiles.orgId, orgId), eq(anonymousProfiles.visitorId, visitorId)))
  )[0];

const pvRow = async (rowId: string) =>
  (await db.select().from(sitePageViews).where(eq(sitePageViews.id, rowId)))[0];
const evRow = async (rowId: string) =>
  (await db.select().from(siteEvents).where(eq(siteEvents.id, rowId)))[0];

async function seedOrg(label: string, email: string | null) {
  const [org] = await db
    .insert(organizations)
    .values({ name: label, slug: `${label}-${tag}` })
    .returning({ id: organizations.id });
  const siteToken = `tok-${label}-${tag}`;
  const [site] = await db
    .insert(trackedSites)
    .values({
      orgId: org!.id,
      siteToken,
      domain: `${label}-${tag}.example.invalid`,
      trackingEnabled: true,
    })
    .returning({ id: trackedSites.id });
  let contactId: string | null = null;
  if (email) {
    const [c] = await db
      .insert(contacts)
      .values({ orgId: org!.id, email })
      .returning({ id: contacts.id });
    contactId = c!.id;
  }
  return { orgId: org!.id, siteId: site!.id, siteToken, contactId };
}

const identify = async (body: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/t/id', payload: body });

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();

  const caller = await seedOrg('merge-caller', callerEmail);
  const victim = await seedOrg('merge-victim', null);
  callerOrg = caller.orgId;
  victimOrg = victim.orgId;
  callerToken = caller.siteToken;
  callerContactId = caller.contactId!;

  // Both organisations have an anonymous profile for the same visitor id — the
  // situation that makes "did it stay inside one org?" a real question.
  await db.insert(anonymousProfiles).values({ orgId: callerOrg, visitorId: SHARED_VISITOR });
  await db.insert(anonymousProfiles).values({ orgId: victimOrg, visitorId: SHARED_VISITOR });

  const [pv] = await db
    .insert(sitePageViews)
    .values({
      orgId: callerOrg,
      siteId: caller.siteId,
      visitorId: SHARED_VISITOR,
      url: 'https://example.invalid/pricing',
      path: '/pricing',
    })
    .returning({ id: sitePageViews.id });
  const [ev] = await db
    .insert(siteEvents)
    .values({
      orgId: callerOrg,
      siteId: caller.siteId,
      visitorId: SHARED_VISITOR,
      eventName: 'viewed_pricing',
    })
    .returning({ id: siteEvents.id });
  const [vev] = await db
    .insert(siteEvents)
    .values({
      orgId: victimOrg,
      siteId: victim.siteId,
      visitorId: SHARED_VISITOR,
      eventName: 'victim_event',
    })
    .returning({ id: siteEvents.id });
  ids.callerPv = pv!.id;
  ids.callerEv = ev!.id;
  ids.victimEv = vev!.id;
}, 60_000);

afterAll(async () => {
  for (const orgId of [callerOrg, victimOrg]) {
    await db.delete(sitePageViews).where(eq(sitePageViews.orgId, orgId));
    await db.delete(siteEvents).where(eq(siteEvents.orgId, orgId));
    await db.delete(anonymousProfiles).where(eq(anonymousProfiles.orgId, orgId));
    await db.delete(trackedSites).where(eq(trackedSites.orgId, orgId));
    await db.delete(contacts).where(eq(contacts.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  await app?.close();
}, 60_000);

describe('identifying a visitor also merges their anonymous profile', () => {
  it('marks the caller profile merged, and leaves the other tenant profile alone', async () => {
    const callerBefore = await profile(callerOrg, SHARED_VISITOR);
    const victimBefore = await profile(victimOrg, SHARED_VISITOR);
    expect(callerBefore, 'fixture missing — caller profile was not seeded').toBeDefined();
    expect(victimBefore, 'fixture missing — victim profile was not seeded').toBeDefined();
    expect(callerBefore!.mergedInto).toBeNull();
    expect(callerBefore!.mergedAt).toBeNull();
    expect(victimBefore!.mergedInto).toBeNull();

    const res = await identify({
      siteToken: callerToken,
      visitorId: SHARED_VISITOR,
      email: callerEmail,
    });
    expect(res.statusCode, `body: ${res.body}`).toBe(200);
    expect((res.json() as { contactId: string | null }).contactId).toBe(callerContactId);

    // Did the run even get to the merge? The two back-fills sit immediately
    // above it in the same `if (contactId)` block, so their effect is the
    // evidence that the block ran at all. Without this, everything below would
    // pass against a request that never reached the call.
    expect((await pvRow(ids.callerPv))!.contactId, 'back-fill above the merge did not run').toBe(
      callerContactId,
    );
    expect((await evRow(ids.callerEv))!.contactId).toBe(callerContactId);

    // The merge itself, field by field. merged_into is the only column this
    // path writes that nothing else does.
    const callerAfter = await profile(callerOrg, SHARED_VISITOR);
    expect(callerAfter!.mergedInto, 'the anonymous profile was not merged').toBe(callerContactId);
    expect(callerAfter!.mergedAt).not.toBeNull();
    expect(callerAfter!.id).toBe(callerBefore!.id);
    expect(callerAfter!.orgId).toBe(callerOrg);
    expect(callerAfter!.visitorId).toBe(SHARED_VISITOR);

    // Negative control: the same visitor id in another organisation. This is
    // what makes "correcting the arguments cannot reach another tenant" a
    // measurement rather than a claim about the code.
    const victimAfter = await profile(victimOrg, SHARED_VISITOR);
    expect(victimAfter!.mergedInto).toBeNull();
    expect(victimAfter!.mergedAt).toBeNull();
    expect(victimAfter!.id).toBe(victimBefore!.id);
    expect(victimAfter!.orgId).toBe(victimOrg);
    expect(victimAfter!.visitorId).toBe(victimBefore!.visitorId);
    expect((await evRow(ids.victimEv))!.contactId).toBeNull();
  });

  it('is idempotent: identifying the same pair again keeps the merge as it is', async () => {
    const before = await profile(callerOrg, SHARED_VISITOR);
    const res = await identify({
      siteToken: callerToken,
      visitorId: SHARED_VISITOR,
      email: callerEmail,
    });
    expect(res.statusCode).toBe(200);

    const after = await profile(callerOrg, SHARED_VISITOR);
    expect(after!.mergedInto).toBe(before!.mergedInto);
    expect((await profile(victimOrg, SHARED_VISITOR))!.mergedInto).toBeNull();
  });

  it('an unknown visitor id changes nothing and the route still answers', async () => {
    // Negative control: no profile, no page views, no events for this visitor.
    const res = await identify({
      siteToken: callerToken,
      visitorId: ORPHAN_VISITOR,
      email: callerEmail,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { contactId: string | null }).contactId).toBe(callerContactId);

    expect(await profile(callerOrg, ORPHAN_VISITOR)).toBeUndefined();
    expect((await profile(callerOrg, SHARED_VISITOR))!.mergedInto).toBe(callerContactId);
    expect((await profile(victimOrg, SHARED_VISITOR))!.mergedInto).toBeNull();
  });
});
