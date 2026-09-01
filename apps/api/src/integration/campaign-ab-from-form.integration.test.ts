/**
 * An A/B test created the way the campaign form creates one, against a real
 * database.
 *
 * `abConfig` on the route is `z.record(z.unknown())` — it validates nothing
 * inside, so "the API accepted it" proves nothing on its own. What has to hold
 * is that the object survives the round trip with its types intact and that
 * the code which consumes it can read it: the splitter needs two variants with
 * a subject, a body and a percentage, and assertAbConfigCanFinish must not
 * refuse it at the click on Send.
 *
 * FORM_PAYLOAD below is the literal buildAbConfig produces for the form's
 * default state. The same literal is asserted in
 * apps/web/src/app/(dashboard)/campaigns/[id]/edit/ab-config.test.ts, so the
 * two files disagreeing is visible in a diff.
 *
 * WHAT THIS TEST CANNOT SEE
 * -------------------------
 * - It does not run the splitter or the winner job. It proves the config is
 *   stored and readable, not that a winner gets picked; that is #74/#76's own
 *   suite (ab-winner.integration.test.ts, ab-two-phase-reaper).
 * - It does not click the form. The web test covers the builder; nothing
 *   proves the checkboxes drive it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { campaigns, lists, segments, sendingDomains } from '../db/schema/index.js';

let app: FastifyInstance;
let session: Session;

const TAG = `abf-${randomUUID().slice(0, 8)}`;
const createdCampaigns: string[] = [];
const createdSegments: string[] = [];
let listId: string;

/**
 * A verified sending domain of our own.
 *
 * enqueueCampaignSend refuses an unverified From (403 FROM_NOT_VERIFIED)
 * before it reaches assertAbConfigCanFinish, and the seed ships no sending
 * domain — measured: without this the Send case below failed on the sender
 * guard, not on the A/B config it is there to test.
 */
const SEND_DOMAIN = `${TAG}.test`;

const BODY = { html: '<p>Ahoj</p>', plainText: 'Ahoj' };

/** Exactly what buildAbConfig returns for the form's default state. */
const FORM_PAYLOAD = {
  variants: [
    { id: 'a', subject: 'Sleva 20 %', content: BODY, percentage: 10 },
    { id: 'b', subject: 'Jenom dnes', content: BODY, percentage: 10 },
  ],
  winnerCriteria: 'click_rate',
  testDurationHours: 4,
  autoSendWinner: true,
  confidenceThreshold: 95,
};

async function newDraft(name: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    headers: { cookie: session.cookie },
    // Everything validateCampaignReadiness demands before it reaches the A/B
    // check: subject, fromEmail, fromName, listId, content. A segment does NOT
    // stand in for the list — that check is `if (!campaign.listId)`.
    payload: {
      name: `${TAG} ${name}`,
      subject: 'Anketa',
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

async function put(id: string, payload: Record<string, unknown>) {
  return app.inject({
    method: 'PUT',
    url: `/api/v1/campaigns/${id}`,
    headers: { cookie: session.cookie },
    payload,
  });
}

async function read(id: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/campaigns/${id}`,
    headers: { cookie: session.cookie },
  });
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
  return (res.json() as { data: Record<string, unknown> }).data;
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);

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
}, 180_000);

afterAll(async () => {
  for (const id of createdCampaigns) await db.delete(campaigns).where(eq(campaigns.id, id));
  for (const id of createdSegments) await db.delete(segments).where(eq(segments.id, id));
  await db.delete(sendingDomains).where(eq(sendingDomains.domain, SEND_DOMAIN));
  if (listId) await db.delete(lists).where(eq(lists.id, listId));
  await app?.close();
}, 180_000);

describe('the A/B config the form sends', () => {
  it('round-trips through PUT with its numbers still numbers and a body per variant', async () => {
    const id = await newDraft('ab');
    const res = await put(id, { abConfig: FORM_PAYLOAD });
    expect(res.statusCode, res.body.slice(0, 400)).toBe(200);

    const stored = (await read(id)).abConfig as typeof FORM_PAYLOAD;
    expect(stored).toEqual(FORM_PAYLOAD);
    // jsonb keeps the JSON types; a percentage arriving back as "10" would
    // make every sum in the splitter string concatenation.
    expect(typeof stored.variants[0]!.percentage).toBe('number');
    expect(typeof stored.testDurationHours).toBe('number');
    // The splitter reads `content: variant.content` with no fallback.
    expect(stored.variants[0]!.content).toEqual(BODY);
    expect(stored.variants[1]!.content).toEqual(BODY);
    // Two variants with an id is what parseAbConfig requires to see a test.
    expect(stored.variants).toHaveLength(2);
    expect(stored.variants.map((v) => v.id)).toEqual(['a', 'b']);
  });

  it('is switched off with {} — because null is rejected outright', async () => {
    const id = await newDraft('off');
    expect((await put(id, { abConfig: FORM_PAYLOAD })).statusCode).toBe(200);
    expect(((await read(id)).abConfig as { variants: unknown[] }).variants).toHaveLength(2);

    // This is the reason AB_OFF is `{}` and not `null`: the route's schema is
    // z.record(z.unknown()).optional(), which has no null in it.
    const asNull = await put(id, { abConfig: null });
    expect(asNull.statusCode).toBe(400);
    // ...and the rejected write changed nothing.
    expect(((await read(id)).abConfig as { variants: unknown[] }).variants).toHaveLength(2);

    const off = await put(id, { abConfig: {} });
    expect(off.statusCode, off.body.slice(0, 300)).toBe(200);
    expect(await read(id).then((c) => c.abConfig)).toEqual({});
  });

  it('refuses at Send the same holdback-with-no-duration the form refuses', async () => {
    const id = await newDraft('nodur');
    const { testDurationHours: _omitted, ...noDuration } = FORM_PAYLOAD;
    expect((await put(id, { abConfig: noDuration })).statusCode).toBe(200);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${id}/send`,
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode, res.body.slice(0, 500)).toBe(400);
    // 100 − (10 + 10) = 80 % held back with nothing to release it.
    expect(res.body).toContain('80.0%');
    expect(res.body).toContain('never be picked');
  });
});

describe('the audience fields the form now sets', () => {
  it('stores an include and an exclude segment through PUT', async () => {
    const [inc] = await db
      .insert(segments)
      .values({ orgId: session.orgId, name: `${TAG} include`, conditions: {} } as never)
      .returning({ id: segments.id });
    const [exc] = await db
      .insert(segments)
      .values({ orgId: session.orgId, name: `${TAG} exclude`, conditions: {} } as never)
      .returning({ id: segments.id });
    createdSegments.push(inc!.id, exc!.id);

    const id = await newDraft('seg');
    const res = await put(id, { segmentId: inc!.id, excludeSegmentId: exc!.id });
    expect(res.statusCode, res.body.slice(0, 400)).toBe(200);

    const stored = await read(id);
    expect(stored.segmentId).toBe(inc!.id);
    expect(stored.excludeSegmentId).toBe(exc!.id);
  });

  it('refuses an id that is not a uuid rather than storing it', async () => {
    const id = await newDraft('badseg');
    expect((await put(id, { segmentId: 'not-a-uuid' })).statusCode).toBe(400);
    expect((await read(id)).segmentId).toBeNull();
  });
});
