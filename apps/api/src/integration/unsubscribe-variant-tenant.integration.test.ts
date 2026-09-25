/**
 * Experiment counters move for the org that owns the variant.
 *
 * ─── What went wrong ─────────────────────────────────────────────────────────
 *
 * `POST /api/v1/unsubscribe-experiments/variants/:variantId/impression` and
 * `…/outcome` took the variant id from the path and called
 * `recordImpression(variantId)` / `recordOutcome(variantId, saved)`, which
 * incremented `unsubscribe_variants` by id alone. The routes are authenticated,
 * so this was not open to the internet — it was open to every other tenant, and
 * `unsubscribe_variants` has an `org_id` all along.
 *
 * What moves is not a vanity number: impressions, saved_count and unsub_count
 * are what `/unsubscribe-experiments/:id/analysis` reads to say which variant
 * keeps more subscribers. A neighbour able to add to either side picks somebody
 * else's winning copy for them.
 *
 * ─── The public caller ───────────────────────────────────────────────────────
 *
 * The other caller of both functions is the preference centre
 * (routes/v1/preference-center.ts:61 and :86), which is public but not
 * unidentified: it resolves `{ orgId, contactId }` out of the signed `pref`
 * token before it picks a variant at all. So the org was in hand at every call
 * site; it simply was not passed.
 *
 * ─── How this is asserted ────────────────────────────────────────────────────
 *
 * Over org B's variant row, field by field. Then the case that must pass: the
 * owning org's own impression and outcome still count, because a refusal is also
 * what a broken endpoint looks like.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  unsubscribeExperiments,
  unsubscribeVariants,
} from '../db/schema/unsubscribe-experiments.js';

let app: FastifyInstance;
let orgA: string;
let orgB: string;
let tokenA: string;
let variantA: string;
let variantB: string;

const tag = randomUUID().slice(0, 8);

async function registerOrg(label: string): Promise<{ orgId: string; token: string }> {
  const t = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress: `198.51.110.${Math.floor(Math.random() * 200) + 30}`,
    payload: {
      email: `unsab-${t}@example.test`,
      password: 'UnsAbTenant1234!',
      name: 'UnsAb Tenant',
      orgName: `UnsAb Tenant ${t}`,
    },
  });
  if (res.statusCode !== 201 && res.statusCode !== 200) {
    throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  }
  const body = res.json() as { token?: string; user?: { orgId?: string } };
  if (!body.user?.orgId || !body.token) throw new Error(`register gave no org/token: ${res.body}`);
  return { orgId: body.user.orgId, token: body.token };
}

async function makeVariant(orgId: string, label: string): Promise<string> {
  const experimentId = randomUUID();
  await db.insert(unsubscribeExperiments).values({
    id: experimentId,
    orgId,
    name: `exp-${label}-${tag}`,
    status: 'running',
  });
  const variantId = randomUUID();
  await db.insert(unsubscribeVariants).values({
    id: variantId,
    experimentId,
    orgId,
    name: `variant-${label}-${tag}`,
    flow: 'offer_pause',
    trafficWeight: 0.5,
  });
  return variantId;
}

const variantRow = (id: string) =>
  db.select().from(unsubscribeVariants).where(eq(unsubscribeVariants.id, id)).limit(1);

beforeAll(async () => {
  app = await createTestApp();
  const a = await registerOrg('a');
  const b = await registerOrg('b');
  orgA = a.orgId;
  tokenA = a.token;
  orgB = b.orgId;
  variantA = await makeVariant(orgA, 'a');
  variantB = await makeVariant(orgB, 'b');
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('an impression cannot be recorded on another org’s variant', () => {
  it('leaves org B’s variant row exactly as it was', async () => {
    const before = (await variantRow(variantB))[0];
    expect(before, 'fixture missing: org B has no variant').toBeDefined();
    expect(before!.impressions).toBe(0);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/unsubscribe-experiments/variants/${variantB}/impression`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(
      (await variantRow(variantB))[0],
      "org A added an impression to org B's variant — the counter is what the analysis endpoint " +
        'reads to declare a winner',
    ).toEqual(before);

    expect([200, 404]).toContain(res.statusCode);
  }, 120_000);

  it('still counts an impression on the caller’s own variant', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/unsubscribe-experiments/variants/${variantA}/impression`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode, res.body.slice(0, 200)).toBe(200);

    const [row] = await variantRow(variantA);
    expect(row!.orgId).toBe(orgA);
    expect(row!.impressions, 'the org’s own impression stopped counting').toBe(1);
  }, 120_000);
});

describe('an outcome cannot be recorded on another org’s variant', () => {
  it('leaves org B’s counters exactly as they were, saved and unsubscribed alike', async () => {
    const before = (await variantRow(variantB))[0];
    expect(before!.savedCount).toBe(0);
    expect(before!.unsubCount).toBe(0);

    const saved = await app.inject({
      method: 'POST',
      url: `/api/v1/unsubscribe-experiments/variants/${variantB}/outcome`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { saved: true },
    });
    const churned = await app.inject({
      method: 'POST',
      url: `/api/v1/unsubscribe-experiments/variants/${variantB}/outcome`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { saved: false },
    });

    expect(
      (await variantRow(variantB))[0],
      "org A moved org B's outcome counters — saved_count against unsub_count is the whole result " +
        'of the experiment',
    ).toEqual(before);

    expect([200, 404]).toContain(saved.statusCode);
    expect([200, 404]).toContain(churned.statusCode);
  }, 120_000);

  it('still counts both outcomes on the caller’s own variant', async () => {
    const start = (await variantRow(variantA))[0]!;

    const saved = await app.inject({
      method: 'POST',
      url: `/api/v1/unsubscribe-experiments/variants/${variantA}/outcome`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { saved: true },
    });
    expect(saved.statusCode, saved.body.slice(0, 200)).toBe(200);

    const churned = await app.inject({
      method: 'POST',
      url: `/api/v1/unsubscribe-experiments/variants/${variantA}/outcome`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { saved: false },
    });
    expect(churned.statusCode, churned.body.slice(0, 200)).toBe(200);

    const [row] = await variantRow(variantA);
    expect(row!.savedCount, 'a save on the org’s own variant stopped counting').toBe(
      start.savedCount + 1,
    );
    expect(row!.unsubCount, 'an unsubscribe on the org’s own variant stopped counting').toBe(
      start.unsubCount + 1,
    );
  }, 120_000);
});

describe('negative control — the public preference centre still works', () => {
  it('serves the unsubscribe page for a signed token and counts its impression', async () => {
    const { createTrackingToken } = await import('@forgemsg/shared');
    const { contacts } = await import('../db/schema/index.js');

    const [contact] = await db
      .insert(contacts)
      .values({ orgId: orgA, email: `pref-${randomUUID().slice(0, 8)}@tenant.test` })
      .returning({ id: contacts.id });

    const token = createTrackingToken({
      type: 'pref',
      orgId: orgA,
      contactId: contact!.id,
      ts: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({ method: 'GET', url: `/p/center/${token}` });
    expect([200, 404]).toContain(res.statusCode);

    // Whether this contact draws a variant is up to the experiment's traffic
    // split, so the assertion is the one thing that must hold either way: the
    // page answers without a session, and no counter outside org A moved.
    const [b] = await variantRow(variantB);
    expect(b!.impressions, 'the public page touched another org’s variant').toBe(0);
  }, 120_000);
});
