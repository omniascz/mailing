/**
 * One shape, eighteen routes: an identifier arrives in the URL and the query
 * that uses it never asks whose it is.
 *
 * There is no Postgres RLS in this repository. Tenant isolation is exactly the
 * set of `eq(x.orgId, req.user.orgId)` clauses that happen to be written, so a
 * single missing one is a leak with nothing behind it.
 *
 * Every case is asserted in three directions, and all three are load-bearing:
 *
 *   1. org B aimed at org A's row is refused (404) or reads nothing
 *   2. org A aimed at org B's row is refused too — one direction passes against
 *      a handler that simply returns nothing for everyone (#50, #52)
 *   3. each org still reaches its OWN row — otherwise this is a deletion
 *      dressed as a guard (#86)
 *
 * For writes the check is not the status code. A 404 with the row already
 * modified is not a fix, so the write cases re-read the victim's row from the
 * database afterwards and assert it is untouched.
 *
 * Fixtures live in two orgs this file creates and drops, never the seed org.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  organizations,
  contacts,
  apiKeys,
  contactEmails,
  contactEngagement,
  ctas,
  ctaVariants,
} from '../db/schema/index.js';
import { groups, groupCategories, contactGroups } from '../db/schema/groups.js';
import { loyaltyPrograms } from '../db/schema/loyalty-programs.js';
import { loyaltyMembers } from '../db/schema/loyalty-members.js';
import { loyaltyPoints } from '../db/schema/loyalty-points.js';
import { cdpSources, cdpSyncRuns } from '../db/schema/cdp-sources.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];

interface Tenant {
  label: string;
  orgId: string;
  key: string;
  contactId: string;
  emailId: string;
  memberId: string;
  programId: string;
  ctaId: string;
  variantId: string;
  sourceId: string;
  groupId: string;
}
let A: Tenant;
let B: Tenant;

let addr = 0;
function nextAddress(): string {
  addr = (addr % 250) + 1;
  return `198.51.100.${addr}`;
}

function call(opts: {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  as?: Tenant;
  payload?: unknown;
}) {
  return app.inject({
    method: opts.method ?? 'GET',
    url: opts.url,
    payload: opts.payload as never,
    headers: opts.as ? { 'x-api-key': opts.as.key } : undefined,
    remoteAddress: nextAddress(),
  });
}

async function makeTenant(label: string): Promise<Tenant> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `iso ${label} ${tag}`, slug: `iso-${label}-${tag}` })
    .returning({ id: organizations.id });
  const orgId = org!.id;
  orgIds.push(orgId);

  const raw = `fm_live_${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId,
    name: `iso ${label} ${tag}`,
    keyHash: createHash('sha256').update(raw).digest('hex'),
    keyPrefix: raw.slice(0, 12),
    scopes: [],
  });

  const [c] = await db
    .insert(contacts)
    .values({ orgId, email: `iso-${label}-${tag}@test.local`, status: 'active' })
    .returning({ id: contacts.id });
  const contactId = c!.id;

  const [ce] = await db
    .insert(contactEmails)
    .values({
      orgId,
      contactId,
      email: `alt-${label}-${tag}@test.local`,
      isPrimary: true,
      consent: 'subscribed',
    })
    .returning({ id: contactEmails.id });

  // Engagement row backs channel-scores, engagement-score, rfm and best-hour.
  // The histogram peaks at a different hour per tenant so a leak is visible as
  // the WRONG NUMBER, not merely as a 200.
  const peak = label === 'a' ? 3 : 19;
  const hist = Array.from({ length: 24 }, (_, i) => (i === peak ? 100 : 0));
  await db.insert(contactEngagement).values({
    orgId,
    contactId,
    openHourHistogram: hist,
    emailScore: label === 'a' ? 11 : 22,
    smsScore: 5,
    preferredChannel: label === 'a' ? 'email' : 'sms',
    channelScoredAt: new Date(),
    engagementScore: label === 'a' ? 33 : 44,
    rfmRecency: label === 'a' ? 1 : 5,
    rfmFrequency: 2,
    rfmMonetary: 3,
    rfmSegment: label === 'a' ? 'champions' : 'at_risk',
  });

  const [prog] = await db
    .insert(loyaltyPrograms)
    .values({ orgId, name: `prog ${label} ${tag}` })
    .returning({ id: loyaltyPrograms.id });
  const [member] = await db
    .insert(loyaltyMembers)
    .values({ orgId, programId: prog!.id, contactId, pointBalance: label === 'a' ? 100 : 900 })
    .returning({ id: loyaltyMembers.id });
  await db.insert(loyaltyPoints).values({
    orgId,
    memberId: member!.id,
    type: 'earn',
    points: label === 'a' ? 100 : 900,
    balanceAfter: label === 'a' ? 100 : 900,
    expiresAt: new Date(Date.now() + 10 * 86_400_000),
  });

  const [cta] = await db
    .insert(ctas)
    .values({ orgId, name: `cta ${label} ${tag}`, type: 'button', content: {}, active: true })
    .returning({ id: ctas.id });
  const [variant] = await db
    .insert(ctaVariants)
    .values({ ctaId: cta!.id, name: `v-${label}-${tag}`, weight: 1, content: {} })
    .returning({ id: ctaVariants.id });

  const [source] = await db
    .insert(cdpSources)
    .values({ orgId, name: `src ${label} ${tag}`, kind: 'webhook', direction: 'push' })
    .returning({ id: cdpSources.id });
  await db.insert(cdpSyncRuns).values({
    orgId,
    sourceId: source!.id,
    status: 'completed',
    rowsPulled: label === 'a' ? 7 : 77,
  });

  const [cat] = await db
    .insert(groupCategories)
    .values({ orgId, name: `cat ${label} ${tag}` })
    .returning({ id: groupCategories.id });
  const [grp] = await db
    .insert(groups)
    .values({ orgId, categoryId: cat!.id, name: `grp ${label} ${tag}` })
    .returning({ id: groups.id });
  await db.insert(contactGroups).values({ contactId, groupId: grp!.id });

  return {
    label,
    orgId,
    key: raw,
    contactId,
    emailId: ce!.id,
    memberId: member!.id,
    programId: prog!.id,
    ctaId: cta!.id,
    variantId: variant!.id,
    sourceId: source!.id,
    groupId: grp!.id,
  };
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  A = await makeTenant('a');
  B = await makeTenant('b');
}, 120_000);

afterAll(async () => {
  if (orgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

/** Refused, or answered with nothing. Both are acceptable; a leak is not. */
function refusedOrEmpty(res: { statusCode: number; body: string }): boolean {
  if (res.statusCode === 404 || res.statusCode === 403) return true;
  if (res.statusCode !== 200) return false;
  try {
    const d = (JSON.parse(res.body) as { data?: unknown }).data;
    return d === null || d === undefined || (Array.isArray(d) && d.length === 0);
  } catch {
    return false;
  }
}

// ─── Reads: each tenant's own row, and never the other's ────────────────────

describe('reads are scoped to the caller', () => {
  const cases: Array<{
    name: string;
    url: (t: Tenant) => string;
    ownProof: (body: string) => boolean;
  }> = [
    {
      name: 'loyalty ledger summary',
      url: (t) => `/api/v1/loyalty/programs/${t.programId}/members/${t.memberId}/ledger/summary`,
      ownProof: (b) => JSON.parse(b).data.transactionCount === 1,
    },
    {
      name: 'loyalty ledger expiring',
      url: (t) => `/api/v1/loyalty/programs/${t.programId}/members/${t.memberId}/ledger/expiring`,
      ownProof: (b) => (JSON.parse(b).data as unknown[]).length === 1,
    },
    {
      name: 'cta variants',
      url: (t) => `/api/v1/ctas/${t.ctaId}/variants`,
      ownProof: (b) => (JSON.parse(b).data as unknown[]).length === 1,
    },
    {
      name: 'cdp sync runs',
      url: (t) => `/api/v1/cdp/sources/${t.sourceId}/runs`,
      ownProof: (b) => (JSON.parse(b).data as unknown[]).length === 1,
    },
    {
      name: 'contact emails',
      url: (t) => `/api/v1/contacts/${t.contactId}/emails`,
      ownProof: (b) => (JSON.parse(b).data as unknown[]).length === 1,
    },
    {
      name: 'best sendable email',
      url: (t) => `/api/v1/contacts/${t.contactId}/emails/best`,
      ownProof: (b) => JSON.parse(b).data !== null,
    },
    {
      name: 'channel scores',
      url: (t) => `/api/v1/contacts/${t.contactId}/channel-scores`,
      ownProof: (b) => JSON.parse(b).data.contactId !== undefined,
    },
    {
      name: 'engagement score',
      url: (t) => `/api/v1/contacts/${t.contactId}/engagement-score`,
      ownProof: (b) => JSON.parse(b).data !== null,
    },
    {
      name: 'rfm',
      url: (t) => `/api/v1/rfm/contacts/${t.contactId}`,
      ownProof: (b) => JSON.parse(b).data !== null,
    },
    {
      name: 'contact groups',
      url: (t) => `/api/v1/contacts/${t.contactId}/groups`,
      ownProof: (b) => (JSON.parse(b).data as unknown[]).length === 1,
    },
  ];

  it.each(cases)('$name — each org reads its own', async (c) => {
    for (const t of [A, B]) {
      const res = await call({ url: c.url(t), as: t });
      expect(res.statusCode, `${c.name} own (${t.label}): ${res.body}`).toBe(200);
      expect(c.ownProof(res.body), `${c.name} own (${t.label}) returned nothing: ${res.body}`).toBe(
        true,
      );
    }
  });

  it.each(cases)('$name — neither org reads the other', async (c) => {
    const bAtA = await call({ url: c.url(A), as: B });
    expect(refusedOrEmpty(bAtA), `B read A's ${c.name}: ${bAtA.statusCode} ${bAtA.body}`).toBe(
      true,
    );

    const aAtB = await call({ url: c.url(B), as: A });
    expect(refusedOrEmpty(aAtB), `A read B's ${c.name}: ${aAtB.statusCode} ${aAtB.body}`).toBe(
      true,
    );
  });
});

/**
 * best-hour is separated out because it never 404s: it returns a default hour
 * when it finds no row, so "refused or empty" cannot express the property. The
 * histograms peak at different hours per tenant, so a leak is a wrong number.
 */
describe('send-optimization best hour', () => {
  it('each org gets its own peak, and the other org gets the default', async () => {
    const own = async (t: Tenant) =>
      (
        JSON.parse(
          (await call({ url: `/api/v1/send-optimization/best-hour/${t.contactId}`, as: t })).body,
        ) as {
          data: { hour: number };
        }
      ).data.hour;

    expect(await own(A)).toBe(3);
    expect(await own(B)).toBe(19);

    const bAtA = JSON.parse(
      (await call({ url: `/api/v1/send-optimization/best-hour/${A.contactId}`, as: B })).body,
    ) as { data: { hour: number } };
    // 10 is the "no data" default in bestHourForContact.
    expect(bAtA.data.hour, "B must not learn A's peak hour").toBe(10);

    const aAtB = JSON.parse(
      (await call({ url: `/api/v1/send-optimization/best-hour/${B.contactId}`, as: A })).body,
    ) as { data: { hour: number } };
    expect(aAtB.data.hour, "A must not learn B's peak hour").toBe(10);
  });
});

// ─── Writes: refused AND the victim's row untouched ─────────────────────────

describe('writes cannot cross a tenant boundary', () => {
  it('a variant cannot be added to another org’s CTA', async () => {
    const before = await db.select().from(ctaVariants).where(eq(ctaVariants.ctaId, A.ctaId));

    const res = await call({
      method: 'POST',
      url: `/api/v1/ctas/${A.ctaId}/variants`,
      as: B,
      payload: { name: `injected-${tag}`, content: {} },
    });
    expect(res.statusCode, res.body).toBe(404);

    const after = await db.select().from(ctaVariants).where(eq(ctaVariants.ctaId, A.ctaId));
    expect(after.length, "no variant may be written into A's CTA").toBe(before.length);

    // And the owner can still add one.
    const ok = await call({
      method: 'POST',
      url: `/api/v1/ctas/${A.ctaId}/variants`,
      as: A,
      payload: { name: `legit-${tag}`, content: {} },
    });
    expect(ok.statusCode, ok.body).toBe(201);
  });

  it('another org’s contact email cannot be made primary', async () => {
    const res = await call({
      method: 'PATCH',
      url: `/api/v1/contacts/${A.contactId}/emails/${A.emailId}/primary`,
      as: B,
    });
    expect(res.statusCode).toBe(404);
  });

  it('another org’s consent cannot be flipped, and the row is unchanged', async () => {
    const res = await call({
      method: 'PATCH',
      url: `/api/v1/contacts/${A.contactId}/emails/${A.emailId}/consent`,
      as: B,
      payload: { consent: 'unsubscribed' },
    });
    expect(res.statusCode).toBe(404);

    const [row] = await db
      .select({ consent: contactEmails.consent })
      .from(contactEmails)
      .where(eq(contactEmails.id, A.emailId));
    expect(row!.consent, "A's consent must be untouched").toBe('subscribed');
  });

  it('another org’s email cannot be marked verified', async () => {
    const res = await call({
      method: 'POST',
      url: `/api/v1/contacts/${A.contactId}/emails/${A.emailId}/verify`,
      as: B,
    });
    expect(res.statusCode).toBe(404);

    const [row] = await db
      .select({ verifiedAt: contactEmails.verifiedAt })
      .from(contactEmails)
      .where(eq(contactEmails.id, A.emailId));
    expect(row!.verifiedAt, 'B must not verify A’s address').toBeNull();
  });

  it('another org’s email cannot be deleted — the row survives', async () => {
    const res = await call({
      method: 'DELETE',
      url: `/api/v1/contacts/${A.contactId}/emails/${A.emailId}`,
      as: B,
    });
    // removeEmail returns void, so the route answers 204 either way. The
    // assertion is the row, not the status.
    expect([204, 404]).toContain(res.statusCode);

    const rows = await db
      .select({ id: contactEmails.id })
      .from(contactEmails)
      .where(eq(contactEmails.id, A.emailId));
    expect(rows.length, "A's email row must still exist").toBe(1);
  });

  it('the owner can still change and then delete their own email', async () => {
    const consent = await call({
      method: 'PATCH',
      url: `/api/v1/contacts/${B.contactId}/emails/${B.emailId}/consent`,
      as: B,
      payload: { consent: 'unsubscribed' },
    });
    expect(consent.statusCode, consent.body).toBe(200);

    const del = await call({
      method: 'DELETE',
      url: `/api/v1/contacts/${B.contactId}/emails/${B.emailId}`,
      as: B,
    });
    expect(del.statusCode).toBe(204);

    const rows = await db
      .select({ id: contactEmails.id })
      .from(contactEmails)
      .where(eq(contactEmails.id, B.emailId));
    expect(rows.length, 'the owner’s delete must actually delete').toBe(0);
  });

  it('a contact cannot be removed from another org’s group', async () => {
    const res = await call({
      method: 'DELETE',
      url: `/api/v1/groups/${A.groupId}/members/${A.contactId}`,
      as: B,
    });
    expect(res.statusCode).toBe(404);

    const rows = await db
      .select({ contactId: contactGroups.contactId })
      .from(contactGroups)
      .where(and(eq(contactGroups.groupId, A.groupId), eq(contactGroups.contactId, A.contactId)));
    expect(rows.length, 'the membership must survive').toBe(1);
  });

  it('the owner can still remove their own group member', async () => {
    const res = await call({
      method: 'DELETE',
      url: `/api/v1/groups/${A.groupId}/members/${A.contactId}`,
      as: A,
    });
    expect(res.statusCode).toBe(204);

    const rows = await db
      .select({ contactId: contactGroups.contactId })
      .from(contactGroups)
      .where(and(eq(contactGroups.groupId, A.groupId), eq(contactGroups.contactId, A.contactId)));
    expect(rows.length).toBe(0);
  });

  it('another org’s calendar integration cannot be synced', async () => {
    // No integration row is planted: the property under test is that an id the
    // caller does not own is refused before any OAuth work happens, and a
    // non-existent id exercises exactly the same lookup.
    const res = await call({
      method: 'POST',
      url: `/api/v1/calendar/integrations/${randomUUID()}/sync`,
      as: B,
      payload: {},
    });
    expect(res.statusCode, res.body).toBe(404);
  });
});
