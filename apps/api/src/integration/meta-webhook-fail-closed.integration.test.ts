/**
 * The Meta webhook's own signature check opened when the secret was missing.
 *
 *     function verifySignature(req, signature) {
 *       const appSecret = process.env['META_APP_SECRET'];
 *       if (!appSecret) return true; // Skip verification in dev
 *
 * That is routes/v1/webhooks/meta.ts — a second copy of the shape #180 removed
 * from lib/meta-signature.ts, in a file that never imported the shared helper.
 * An accepted payload becomes rows in inbox_messages, so an unconfigured
 * deployment would store forged customer messages in a real inbox.
 *
 * ─── What this file can and cannot show ──────────────────────────────────────
 *
 * Measured, not assumed: through the route that hole is currently unreachable.
 * `metaWebhookEnabled()` is evaluated per request and requires the secret as
 * well as the flag (webhook-switches.ts), so a deployment with no secret gets
 * 404 at meta.ts:72 and never arrives at the signature check. The first case
 * below pins exactly that, because it is the reason the fix cannot be
 * demonstrated end to end — and because a switch is configuration, not an
 * invariant: the day somebody widens it, the function underneath has to be the
 * thing that refuses. The fix itself is proved where it lives, in the unit test
 * beside the route (routes/v1/webhooks/meta.test.ts).
 *
 * What this file does prove is that the route still works after it: a correctly
 * signed request is accepted and stored, and an unsigned one is refused with
 * nothing written.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { organizations, inboxMessages, metaPageMappings } from '../db/schema/index.js';

const tag = randomUUID().slice(0, 8);
const APP_SECRET = `itest-meta-app-secret-${tag}`;

const PAGE = `9100${tag}`;
const PSID = `psid-${tag}`;

/** One message id per case, so no assertion can be satisfied by another's row. */
const MID_NOSECRET = `mid-nosecret-${tag}`;
const MID_UNSIGNED = `mid-unsigned-${tag}`;
const MID_FORGED = `mid-forged-${tag}`;
const MID_SIGNED = `mid-signed-${tag}`;

let app: FastifyInstance;
let orgId: string;

const messagesFor = async (mid: string) =>
  db.select().from(inboxMessages).where(eq(inboxMessages.providerMessageId, mid));

/**
 * handlePayload is dispatched with `void` — the route answers before the insert
 * finishes — so a row is waited for rather than read once. The refusal cases
 * wait out a window of their own before concluding that nothing was written.
 */
async function waitForMessage(
  mid: string,
  timeoutMs = 4000,
): Promise<Array<{ [k: string]: unknown }>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = (await messagesFor(mid)) as Array<{ [k: string]: unknown }>;
    if (rows.length > 0) return rows;
    if (Date.now() > deadline) return rows;
    await new Promise((r) => setTimeout(r, 100));
  }
}

const messengerEvent = (mid: string) => ({
  object: 'page',
  entry: [
    {
      id: PAGE,
      time: Date.now(),
      messaging: [
        {
          sender: { id: PSID },
          recipient: { id: PAGE },
          timestamp: Date.now(),
          message: { mid, text: 'ahoj' },
        },
      ],
    },
  ],
});

/** `sign` is the secret to sign with, or undefined to send no signature. */
const post = async (mid: string, sign?: string) => {
  const payload = JSON.stringify(messengerEvent(mid));
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (sign !== undefined) {
    headers['x-hub-signature-256'] =
      `sha256=${createHmac('sha256', sign).update(payload).digest('hex')}`;
  }
  return app.inject({ method: 'POST', url: '/webhook/meta', headers, payload });
};

const prev = {
  enable: process.env.ENABLE_META_WEBHOOK,
  secret: process.env.META_APP_SECRET,
  unsigned: process.env.ALLOW_UNSIGNED_WEBHOOKS,
  orgEnv: process.env.META_ORG_ID,
};

beforeAll(async () => {
  process.env.ENABLE_META_WEBHOOK = 'true';
  process.env.META_APP_SECRET = APP_SECRET;
  delete process.env.ALLOW_UNSIGNED_WEBHOOKS;
  // No fallback org, so nothing here can be attributed to one.
  delete process.env.META_ORG_ID;

  const { createTestApp } = await import('./setup/harness.js');
  app = await createTestApp();
  await app.ready();

  const [org] = await db
    .insert(organizations)
    .values({ name: 'meta sig', slug: `meta-sig-${tag}` })
    .returning({ id: organizations.id });
  orgId = org!.id;

  await db.insert(metaPageMappings).values({
    orgId,
    pageId: PAGE,
    channel: 'messenger',
    pageName: `page ${PAGE}`,
    active: true,
  });
}, 120_000);

beforeEach(() => {
  process.env.META_APP_SECRET = APP_SECRET;
  delete process.env.ALLOW_UNSIGNED_WEBHOOKS;
});

afterAll(async () => {
  for (const mid of [MID_NOSECRET, MID_UNSIGNED, MID_FORGED, MID_SIGNED]) {
    await db.delete(inboxMessages).where(eq(inboxMessages.providerMessageId, mid));
  }
  if (orgId) {
    await db.delete(metaPageMappings).where(eq(metaPageMappings.orgId, orgId));
    await db.delete(inboxMessages).where(eq(inboxMessages.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  for (const [k, v] of Object.entries({
    ENABLE_META_WEBHOOK: prev.enable,
    META_APP_SECRET: prev.secret,
    ALLOW_UNSIGNED_WEBHOOKS: prev.unsigned,
    META_ORG_ID: prev.orgEnv,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await app?.close();
}, 120_000);

describe('the Meta webhook refuses what it cannot verify', () => {
  it('with no secret the route answers 404 before the signature is looked at', async () => {
    // The measured reason the fail-open was not exploitable through this route:
    // metaWebhookEnabled() needs the secret too, so the endpoint disappears at
    // exactly the configuration where verification would have been skipped.
    // Pinned so that widening the switch fails here rather than in production.
    delete process.env.META_APP_SECRET;

    const res = await post(MID_NOSECRET);
    expect(res.statusCode, `body: ${res.body}`).toBe(404);
    expect(res.json()).toMatchObject({ code: 'INTEGRATION_DISABLED' });
    expect(await waitForMessage(MID_NOSECRET, 1000)).toHaveLength(0);
  });

  it('an unsigned request is refused and stores nothing', async () => {
    const res = await post(MID_UNSIGNED);
    // 403 is this route's own answer to a bad signature (meta.ts:81); what
    // matters is that it refuses, not which of 401/403 it picks.
    expect(res.statusCode, `body: ${res.body}`).toBe(403);
    expect(await waitForMessage(MID_UNSIGNED, 1500)).toHaveLength(0);
  });

  it('a signature made with the wrong secret is refused and stores nothing', async () => {
    const res = await post(MID_FORGED, 'not-the-app-secret');
    expect(res.statusCode, `body: ${res.body}`).toBe(403);
    expect(await waitForMessage(MID_FORGED, 1500)).toHaveLength(0);
  });

  it('a correctly signed request is accepted and stores the message', async () => {
    // The case that must write: without it every assertion above would also
    // hold for a route that had simply stopped working.
    const res = await post(MID_SIGNED, APP_SECRET);
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    const rows = await waitForMessage(MID_SIGNED);
    expect(rows, 'the handler never reached the inbox insert').toHaveLength(1);
    expect(rows[0]!.orgId).toBe(orgId);
    expect(rows[0]!.channel).toBe('messenger');
    expect(rows[0]!.content).toBe('ahoj');
    expect(rows[0]!.senderId).toBe(PSID);
  });
});
