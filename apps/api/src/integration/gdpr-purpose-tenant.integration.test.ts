/**
 * A consent is granted against a purpose of the granting org, never another's.
 *
 * ─── What went wrong ─────────────────────────────────────────────────────────
 *
 * `grantConsent` looked the purpose up by id alone:
 *
 *     .from(processingPurposes).where(eq(processingPurposes.id, input.purposeId))
 *
 * and `purposeId` arrives in the request body of
 * `POST /api/v1/contacts/:contactId/gdpr/consents`
 * (routes/v1/gdpr/processing-purposes.ts:133) with nothing checking whose
 * purpose it is. Two things followed, and both are GDPR records rather than
 * cosmetics:
 *
 *   1. Another org's `retention_days` was read and used to compute `expires_at`
 *      — so how long we keep processing this person's data was decided by a
 *      row belonging to a different tenant, which can change it at any time.
 *   2. The consent row written into our own org carried a `purpose_id` pointing
 *      at that foreign purpose. The FK is satisfied (it references
 *      processing_purposes.id, which says nothing about the org), so the row
 *      persists. Every later reader — the consent state map, the pre-send
 *      guardrail, the erasure log — then resolves a legal basis that our org
 *      cannot see, cannot audit and did not define. On a subject access request
 *      we could not say what the person consented to.
 *
 * ─── What the fix is ─────────────────────────────────────────────────────────
 *
 * The lookup is scoped by org, and a purpose that is not ours is refused
 * (404, the same answer the neighbouring purpose routes already give for an id
 * from another tenant) instead of silently producing a consent with a null
 * expiry and a foreign reference.
 *
 * ─── How this is asserted ────────────────────────────────────────────────────
 *
 * Over rows, not over the status code: the defect was a written row, so the
 * test reads `contact_gdpr_consents` back and compares org B's purpose row
 * field by field before and after. A refusal alone would also be satisfied by
 * a route that has stopped working, so the case that must pass — granting
 * against the org's OWN purpose, with the expiry actually computed — runs right
 * after it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts } from '../db/schema/index.js';
import { processingPurposes, contactGdprConsents } from '../db/schema/processing-purposes.js';

let app: FastifyInstance;
let orgA: string;
let orgB: string;
let tokenA: string;
let contactA: string;
/** Org B's purpose — the one org A must not be able to reach. */
let purposeB: string;
/** Org A's own purpose, for the case that must pass. */
let purposeA: string;

const RETENTION_B = 3650;
const RETENTION_A = 30;

async function registerOrg(label: string): Promise<{ orgId: string; token: string }> {
  const tag = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress: `198.51.105.${Math.floor(Math.random() * 200) + 30}`,
    payload: {
      email: `gdpr-${tag}@example.test`,
      password: 'GdprTenant1234!',
      name: 'Gdpr Tenant',
      orgName: `Gdpr Tenant ${tag}`,
    },
  });
  if (res.statusCode !== 201 && res.statusCode !== 200) {
    throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  }
  const body = res.json() as { token?: string; user?: { orgId?: string } };
  if (!body.user?.orgId || !body.token) {
    throw new Error(`register returned no org id or token: ${res.body}`);
  }
  return { orgId: body.user.orgId, token: body.token };
}

const purposeRow = (id: string) =>
  db.select().from(processingPurposes).where(eq(processingPurposes.id, id)).limit(1);

beforeAll(async () => {
  app = await createTestApp();
  const a = await registerOrg('a');
  const b = await registerOrg('b');
  orgA = a.orgId;
  tokenA = a.token;
  orgB = b.orgId;

  const [cA] = await db
    .insert(contacts)
    .values({
      orgId: orgA,
      email: `gdpr-subject-${randomUUID().slice(0, 8)}@tenant.test`,
      firstName: 'Consent',
      lastName: 'Subject',
    })
    .returning({ id: contacts.id });
  contactA = cA!.id;

  // A ten-year retention in org B, so an expiry computed from it is impossible
  // to mistake for one computed from org A's thirty days.
  const [pB] = await db
    .insert(processingPurposes)
    .values({
      orgId: orgB,
      slug: `b-analytics-${randomUUID().slice(0, 8)}`,
      name: 'Org B analytics',
      legalBasis: 'consent',
      retentionDays: RETENTION_B,
    })
    .returning({ id: processingPurposes.id });
  purposeB = pB!.id;

  const [pA] = await db
    .insert(processingPurposes)
    .values({
      orgId: orgA,
      slug: `a-newsletter-${randomUUID().slice(0, 8)}`,
      name: 'Org A newsletter',
      legalBasis: 'consent',
      retentionDays: RETENTION_A,
    })
    .returning({ id: processingPurposes.id });
  purposeA = pA!.id;
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('granting consent cannot reach another org’s processing purpose', () => {
  it('writes no consent row referencing org B’s purpose, and leaves that purpose untouched', async () => {
    const before = (await purposeRow(purposeB))[0];
    expect(before, 'fixture missing: org B has no purpose row').toBeDefined();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/contacts/${contactA}/gdpr/consents`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { purposeId: purposeB, source: 'api', consentText: 'I agree' },
    });

    // Secondary to the rows below, but the refusal has to be a clean answer and
    // not a crash: 404 NOT_FOUND, the same as for an id that does not exist.
    expect(res.statusCode, res.body.slice(0, 300)).toBe(404);
    expect((res.json() as { code?: string }).code).toBe('NOT_FOUND');

    // Where the damage lands: a consent in org A pointing at org B's purpose.
    const leaked = await db
      .select()
      .from(contactGdprConsents)
      .where(and(eq(contactGdprConsents.orgId, orgA), eq(contactGdprConsents.purposeId, purposeB)));
    expect(
      leaked,
      "org A recorded a GDPR consent against org B's processing purpose — the purpose lookup " +
        'in grantConsent has no org filter, so the retention period and the legal basis of the ' +
        'consent come from a tenant org A cannot see',
    ).toEqual([]);

    // Nothing anywhere may reference it either — not under org B's id.
    const anywhere = await db
      .select({ id: contactGdprConsents.id, orgId: contactGdprConsents.orgId })
      .from(contactGdprConsents)
      .where(eq(contactGdprConsents.purposeId, purposeB));
    expect(anywhere, 'a consent row was created against org B’s purpose').toEqual([]);

    // And org B's own row is byte-for-byte what it was, field by field.
    expect(
      (await purposeRow(purposeB))[0],
      "org B's purpose row changed while org A granted consent",
    ).toEqual(before);
  }, 120_000);

  it('still grants consent against the org’s OWN purpose, with the expiry computed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/contacts/${contactA}/gdpr/consents`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { purposeId: purposeA, source: 'api', consentText: 'I agree' },
    });
    expect(res.statusCode, res.body.slice(0, 300)).toBe(201);

    const rows = await db
      .select()
      .from(contactGdprConsents)
      .where(and(eq(contactGdprConsents.orgId, orgA), eq(contactGdprConsents.purposeId, purposeA)));
    expect(rows.length, 'granting against the org’s own purpose stopped working').toBe(1);

    const row = rows[0]!;
    expect(row.contactId).toBe(contactA);
    expect(row.granted).toBe(true);
    expect(row.source).toBe('api');
    expect(row.grantedAt).toBeInstanceOf(Date);

    // The retention that was applied is org A's thirty days, not org B's ten
    // years — this is the read half of the defect, asserted on the value.
    expect(
      row.expiresAt,
      'no expiry was computed from the org’s own retention_days',
    ).not.toBeNull();
    const days = (row.expiresAt!.getTime() - row.grantedAt!.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(RETENTION_A);

    // And the response carried the row back, so the route returns something.
    const sent = (res.json() as { data?: { purposeId?: string } }).data;
    expect(sent?.purposeId).toBe(purposeA);
  }, 120_000);
});

describe('negative control — the neighbouring consent paths still work', () => {
  it('lists the org’s own consent states and sees only its own purposes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/contacts/${contactA}/gdpr/consents`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode, res.body.slice(0, 200)).toBe(200);

    const data = (res.json() as { data: Array<{ purposeId?: string; granted?: boolean }> }).data;
    expect(data.length, 'the consent state list came back empty').toBeGreaterThan(0);
    expect(data.some((d) => d.purposeId === purposeA)).toBe(true);
    expect(
      data.some((d) => d.purposeId === purposeB),
      'org B’s purpose appeared in org A’s consent states',
    ).toBe(false);
  }, 120_000);

  it('lists purposes for the org and not for the other one', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/gdpr/purposes',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = (res.json() as { data: Array<{ id: string }> }).data.map((p) => p.id);
    expect(ids).toContain(purposeA);
    expect(ids).not.toContain(purposeB);
  }, 120_000);

  it('revokes the org’s own consent and the log records it', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/contacts/${contactA}/gdpr/consents/${purposeA}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { reason: 'negative control' },
    });
    expect(res.statusCode, res.body.slice(0, 200)).toBe(200);

    // The consent log is append-only: revokeConsent inserts a second row with
    // granted=false rather than updating the grant, so the grant stays on the
    // record and the state is whichever row is newest.
    const rows = await db
      .select()
      .from(contactGdprConsents)
      .where(and(eq(contactGdprConsents.orgId, orgA), eq(contactGdprConsents.purposeId, purposeA)));
    expect(
      rows.some((r) => r.granted === false && r.source === 'explicit_revoke'),
      'no revocation row was appended for the org’s own purpose',
    ).toBe(true);
    expect(
      rows.some((r) => r.granted === true),
      'the original grant disappeared — the log must keep it',
    ).toBe(true);

    const state = await app.inject({
      method: 'GET',
      url: `/api/v1/contacts/${contactA}/gdpr/consents`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const current = (state.json() as { data: Array<{ purposeId: string; granted: boolean }> }).data;
    expect(
      current.find((d) => d.purposeId === purposeA)?.granted,
      'the reported state is still granted after a revoke',
    ).toBe(false);
  }, 120_000);
});
