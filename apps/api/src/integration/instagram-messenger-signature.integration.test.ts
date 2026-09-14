/**
 * The Instagram and Messenger webhooks skipped verification when the secret was
 * gone — not by returning true from a helper, but by never calling it:
 *
 *     const appSecret = process.env.META_APP_SECRET ?? '';
 *     if (appSecret && !verifyInstagramWebhook(rawBody, signature, appSecret)) {
 *       throw AppError.forbidden('Invalid Instagram webhook signature');
 *     }
 *
 * With `appSecret` empty the condition is false and the request walks straight
 * into processing. The two verify helpers themselves are clean
 * (channels/instagram/adapter.ts:164, channels/messenger/adapter.ts:233); the
 * hole is the guard around them, which is the same shape #180 removed from
 * lib/meta-signature.ts and #181 from routes/v1/webhooks/meta.ts.
 *
 * ─── Why this one is reachable, unlike meta.ts ───────────────────────────────
 *
 * These routes are registered at BOOT — `if (instagramWebhookEnabled()) await
 * app.register(...)` (index.ts:576-577) — so the switch, which does require the
 * secret, is consulted once. The handler then reads process.env per request. A
 * deployment that boots with the secret and later loses it (a rotation that
 * lands empty, an env file redeployed without it) keeps a registered route that
 * verifies nothing. meta.ts re-checked its switch on every request and so
 * answered 404 in that state; these answer 200 and file a ticket.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * A 403 with no ticket is also what an unregistered route or a handler that
 * does nothing look like. So each refusal is followed by a case that must
 * write, asserted on the ticket and its message.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { organizations, metaPageMappings } from '../db/schema/index.js';
import { helpdeskTickets, ticketMessages } from '../db/schema/helpdesk.js';

const tag = randomUUID().slice(0, 8);
const APP_SECRET = `itest-meta-sig-${tag}`;

const IG_PAGE = `ig${tag}`;
const FB_PAGE = `fb${tag}`;

/** One sender per case: the ticket is keyed on it, so cases cannot collide. */
const sender = (what: string) => `s-${what}-${tag}`;

let app: FastifyInstance;
let orgId: string;

const ticketsFor = async (externalThreadId: string) =>
  db
    .select()
    .from(helpdeskTickets)
    .where(
      and(eq(helpdeskTickets.orgId, orgId), eq(helpdeskTickets.externalThreadId, externalThreadId)),
    );

/** Processing is dispatched with .catch(), so rows are waited for. */
async function waitForTicket(
  externalThreadId: string,
  timeoutMs = 4000,
): Promise<Array<{ [k: string]: unknown }>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = (await ticketsFor(externalThreadId)) as Array<{ [k: string]: unknown }>;
    if (rows.length > 0) return rows;
    if (Date.now() > deadline) return rows;
    await new Promise((r) => setTimeout(r, 100));
  }
}

const event = (object: 'instagram' | 'page', pageId: string, senderId: string) => ({
  object,
  entry: [
    {
      id: pageId,
      time: Date.now(),
      messaging: [
        {
          sender: { id: senderId },
          recipient: { id: pageId },
          timestamp: Date.now(),
          message: { mid: `mid-${senderId}`, text: 'mate to skladem?' },
        },
      ],
    },
  ],
});

/** `sign` is the secret to sign with, or undefined to send no signature. */
const post = async (
  channel: 'instagram' | 'messenger',
  senderId: string,
  sign?: string,
): Promise<{ statusCode: number; body: string }> => {
  const payload = JSON.stringify(
    channel === 'instagram'
      ? event('instagram', IG_PAGE, senderId)
      : event('page', FB_PAGE, senderId),
  );
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (sign !== undefined) {
    headers['x-hub-signature-256'] =
      `sha256=${createHmac('sha256', sign).update(payload).digest('hex')}`;
  }
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/webhooks/${channel}`,
    headers,
    payload,
  });
  return { statusCode: res.statusCode, body: res.body };
};

const prev = {
  ig: process.env.ENABLE_INSTAGRAM_WEBHOOK,
  fb: process.env.ENABLE_MESSENGER_WEBHOOK,
  secret: process.env.META_APP_SECRET,
  unsigned: process.env.ALLOW_UNSIGNED_WEBHOOKS,
  defaultOrg: process.env.DEFAULT_ORG_ID,
};

beforeAll(async () => {
  process.env.ENABLE_INSTAGRAM_WEBHOOK = 'true';
  process.env.ENABLE_MESSENGER_WEBHOOK = 'true';
  process.env.META_APP_SECRET = APP_SECRET;
  delete process.env.ALLOW_UNSIGNED_WEBHOOKS;

  const [org] = await db
    .insert(organizations)
    .values({ name: 'ig/fb sig', slug: `igfb-sig-${tag}` })
    .returning({ id: organizations.id });
  orgId = org!.id;

  // Both routes must be able to resolve this org, whichever way they do it —
  // the page mapping and the legacy env fallback point at the same place, so
  // this file says nothing about which of the two is used. That is the other
  // commit's subject.
  process.env.DEFAULT_ORG_ID = orgId;
  await db.insert(metaPageMappings).values([
    { orgId, pageId: IG_PAGE, channel: 'instagram', pageName: `ig ${tag}`, active: true },
    { orgId, pageId: FB_PAGE, channel: 'messenger', pageName: `fb ${tag}`, active: true },
  ]);

  const { createTestApp } = await import('./setup/harness.js');
  app = await createTestApp();
  await app.ready();
}, 120_000);

beforeEach(() => {
  process.env.META_APP_SECRET = APP_SECRET;
  delete process.env.ALLOW_UNSIGNED_WEBHOOKS;
});

afterAll(async () => {
  if (orgId) {
    const ids = await db
      .select({ id: helpdeskTickets.id })
      .from(helpdeskTickets)
      .where(eq(helpdeskTickets.orgId, orgId));
    for (const { id } of ids) {
      await db.delete(ticketMessages).where(eq(ticketMessages.ticketId, id));
    }
    await db.delete(helpdeskTickets).where(eq(helpdeskTickets.orgId, orgId));
    await db.delete(metaPageMappings).where(eq(metaPageMappings.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  for (const [k, v] of Object.entries({
    ENABLE_INSTAGRAM_WEBHOOK: prev.ig,
    ENABLE_MESSENGER_WEBHOOK: prev.fb,
    META_APP_SECRET: prev.secret,
    ALLOW_UNSIGNED_WEBHOOKS: prev.unsigned,
    DEFAULT_ORG_ID: prev.defaultOrg,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await app?.close();
}, 120_000);

for (const channel of ['instagram', 'messenger'] as const) {
  describe(`the ${channel} webhook refuses what it cannot verify`, () => {
    it('an unsigned request with the secret gone is refused and files nothing', async () => {
      const who = sender(`${channel}-nosecret`);
      delete process.env.META_APP_SECRET;

      const res = await post(channel, who);
      expect(res.statusCode, `body: ${res.body}`).toBe(403);

      expect(
        await waitForTicket(who, 1500),
        'a forged message opened a helpdesk ticket because the secret was missing',
      ).toHaveLength(0);
    });

    it('a signature made with the wrong secret is refused and files nothing', async () => {
      const who = sender(`${channel}-forged`);
      const res = await post(channel, who, 'not-the-app-secret');
      expect(res.statusCode, `body: ${res.body}`).toBe(403);
      expect(await waitForTicket(who, 1500)).toHaveLength(0);
    });

    it('a correctly signed request is accepted and files the ticket', async () => {
      // The case that must write.
      const who = sender(`${channel}-signed`);
      const res = await post(channel, who, APP_SECRET);
      expect(res.statusCode, `body: ${res.body}`).toBe(200);

      const rows = await waitForTicket(who);
      expect(rows, 'the handler never reached the ticket insert').toHaveLength(1);
      expect(rows[0]!.orgId).toBe(orgId);
      expect(rows[0]!.channel).toBe(channel);
      expect(rows[0]!.externalThreadId).toBe(who);

      const msgs = await db
        .select()
        .from(ticketMessages)
        .where(eq(ticketMessages.ticketId, rows[0]!.id as string));
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.body).toBe('mate to skladem?');
      expect(msgs[0]!.direction).toBe('inbound');
    });

    it('the dev escape hatch opens it without a secret, but only when asked for', async () => {
      const who = sender(`${channel}-devflag`);
      delete process.env.META_APP_SECRET;
      process.env.ALLOW_UNSIGNED_WEBHOOKS = 'true';

      const res = await post(channel, who);
      expect(res.statusCode, `body: ${res.body}`).toBe(200);

      const rows = await waitForTicket(who);
      expect(rows, 'the escape hatch did not let the request through').toHaveLength(1);
      expect(rows[0]!.orgId).toBe(orgId);
    });
  });
}
