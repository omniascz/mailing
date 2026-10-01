/**
 * Two first messages from one Instagram or Messenger sender, arriving
 * together, end up as one ticket holding both.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * The handlers look for the sender's ticket, and create one when there is
 * none. Two messages processed at the same time both look, both find nothing,
 * and both insert. helpdesk_tickets has a partial unique index on (org_id,
 * channel, external_thread_id), so the second insert does not make a second
 * ticket — it fails. The transaction around it rolls back, the error goes to
 * the `.catch` that only logs it, and Meta has already been told 200. The
 * second message is gone: the agent sees one ticket with one message, and
 * the customer's other message exists nowhere.
 *
 * ─── How the race is made deterministic ──────────────────────────────────────
 *
 * Not with a delay in the product code. The test holds an uncommitted ticket
 * row with the same key in its own transaction. Both handlers read past it —
 * an uncommitted row is invisible, so each concludes there is no ticket — and
 * both then block on the unique index, behind the test's row. Postgres reports
 * them as two backends waiting on a lock; only then does the test roll back,
 * and the two inserts go one after the other, exactly as in the race.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "One ticket" is also what a handler that drops every second message looks
 * like — that is the bug. So the race cases assert both message bodies, and
 * the cases below assert that a single message still opens a ticket, a later
 * one joins it, a closed ticket reopens, and two senders get two tickets.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { organizations, metaPageMappings } from '../db/schema/index.js';
import { helpdeskTickets, ticketMessages } from '../db/schema/helpdesk.js';

const tag = randomUUID().slice(0, 8);
const APP_SECRET = `itest-meta-race-${tag}`;
const PAGE = { instagram: `igr${tag}`, messenger: `fbr${tag}` } as const;

type Channel = 'instagram' | 'messenger';

/** ticket_messages.sender is varchar(32), and the sender id lands in it. */
const sender = (what: string) => `r${what}${tag}`;

let app: FastifyInstance;
let orgId: string;

const prev = {
  ig: process.env.ENABLE_INSTAGRAM_WEBHOOK,
  fb: process.env.ENABLE_MESSENGER_WEBHOOK,
  secret: process.env.META_APP_SECRET,
  unsigned: process.env.ALLOW_UNSIGNED_WEBHOOKS,
};

async function post(channel: Channel, senderId: string, text: string): Promise<number> {
  const pageId = PAGE[channel];
  const payload = JSON.stringify({
    object: channel === 'instagram' ? 'instagram' : 'page',
    entry: [
      {
        id: pageId,
        time: Date.now(),
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: pageId },
            timestamp: Date.now(),
            message: { mid: `mid-${randomUUID()}`, text },
          },
        ],
      },
    ],
  });
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/webhooks/${channel}`,
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${createHmac('sha256', APP_SECRET).update(payload).digest('hex')}`,
    },
    payload,
  });
  return res.statusCode;
}

const ticketsOf = (channel: Channel, who: string) =>
  db
    .select()
    .from(helpdeskTickets)
    .where(
      and(
        eq(helpdeskTickets.orgId, orgId),
        eq(helpdeskTickets.channel, channel),
        eq(helpdeskTickets.externalThreadId, who),
      ),
    );

/** Every message body filed for this sender, across however many tickets. */
async function bodiesOf(channel: Channel, who: string): Promise<string[]> {
  const rows = await db
    .select({ body: ticketMessages.body })
    .from(ticketMessages)
    .innerJoin(helpdeskTickets, eq(ticketMessages.ticketId, helpdeskTickets.id))
    .where(
      and(
        eq(helpdeskTickets.orgId, orgId),
        eq(helpdeskTickets.channel, channel),
        eq(helpdeskTickets.externalThreadId, who),
      ),
    );
  return rows.map((r) => r.body).sort();
}

/** Processing is detached from the response, so the result is waited for. */
async function settle(channel: Channel, who: string, want: number, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const bodies = await bodiesOf(channel, who);
    if (bodies.length >= want || Date.now() > deadline) return bodies;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Backends blocked on a lock while inserting a ticket — the two racers. */
async function waitersOnTicketInsert(): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM pg_stat_activity
    WHERE datname = current_database()
      AND wait_event_type = 'Lock'
      AND query ILIKE 'insert into "helpdesk_tickets"%'
  `);
  return Number((rows as unknown as Array<{ n: number }>)[0]?.n ?? 0);
}

class Rollback extends Error {}

/**
 * Deliver two first messages so that both handlers pass the lookup before
 * either inserts. Returns once both are waiting on the index and the gate has
 * been released.
 */
async function raceTwoFirstMessages(channel: Channel, who: string, texts: [string, string]) {
  let waiting = 0;
  await db
    .transaction(async (tx) => {
      await tx.insert(helpdeskTickets).values({
        orgId,
        subject: 'gate',
        channel,
        externalThreadId: who,
        externalIdentity: who,
      });
      expect(await post(channel, who, texts[0])).toBe(200);
      expect(await post(channel, who, texts[1])).toBe(200);
      const deadline = Date.now() + 10_000;
      while ((waiting = await waitersOnTicketInsert()) < 2 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Rollback();
    })
    .catch((err) => {
      if (!(err instanceof Rollback)) throw err;
    });
  // Without this the case proves nothing: both handlers must have got past
  // the lookup and be inserting, or there was no race to lose.
  expect(waiting, 'the two handlers never met at the ticket insert').toBe(2);
}

beforeAll(async () => {
  process.env.ENABLE_INSTAGRAM_WEBHOOK = 'true';
  process.env.ENABLE_MESSENGER_WEBHOOK = 'true';
  process.env.META_APP_SECRET = APP_SECRET;
  delete process.env.ALLOW_UNSIGNED_WEBHOOKS;

  const [org] = await db
    .insert(organizations)
    .values({ name: 'meta race', slug: `meta-race-${tag}` })
    .returning({ id: organizations.id });
  orgId = org!.id;
  await db.insert(metaPageMappings).values([
    { orgId, pageId: PAGE.instagram, channel: 'instagram', pageName: `ig ${tag}`, active: true },
    { orgId, pageId: PAGE.messenger, channel: 'messenger', pageName: `fb ${tag}`, active: true },
  ]);

  const { createTestApp } = await import('./setup/harness.js');
  app = await createTestApp();
  await app.ready();
}, 120_000);

afterAll(async () => {
  if (orgId) {
    // ticket_messages cascade with their ticket.
    await db.delete(helpdeskTickets).where(eq(helpdeskTickets.orgId, orgId));
    await db.delete(metaPageMappings).where(eq(metaPageMappings.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  for (const [k, v] of Object.entries({
    ENABLE_INSTAGRAM_WEBHOOK: prev.ig,
    ENABLE_MESSENGER_WEBHOOK: prev.fb,
    META_APP_SECRET: prev.secret,
    ALLOW_UNSIGNED_WEBHOOKS: prev.unsigned,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await app?.close();
}, 120_000);

for (const channel of ['instagram', 'messenger'] as const) {
  describe(`${channel}: first messages that arrive together`, () => {
    it('two at once make one ticket holding both messages', async () => {
      const who = sender(`${channel.slice(0, 2)}race`);
      await raceTwoFirstMessages(channel, who, ['prvni zprava', 'druha zprava']);

      expect(await settle(channel, who, 2), 'a message was lost').toEqual([
        'druha zprava',
        'prvni zprava',
      ]);
      expect(await ticketsOf(channel, who)).toHaveLength(1);
    });

    it('one message alone still opens a ticket, and a later one joins it', async () => {
      const who = sender(`${channel.slice(0, 2)}seq`);
      expect(await post(channel, who, 'jedna')).toBe(200);
      expect(await settle(channel, who, 1)).toEqual(['jedna']);
      expect(await post(channel, who, 'dva')).toBe(200);
      expect(await settle(channel, who, 2)).toEqual(['dva', 'jedna']);
      expect(await ticketsOf(channel, who)).toHaveLength(1);
    });

    it('a message on a closed ticket reopens it', async () => {
      const who = sender(`${channel.slice(0, 2)}reo`);
      expect(await post(channel, who, 'puvodni')).toBe(200);
      expect(await settle(channel, who, 1)).toEqual(['puvodni']);
      const [ticket] = await ticketsOf(channel, who);
      await db
        .update(helpdeskTickets)
        .set({ status: 'closed', closedAt: new Date() })
        .where(eq(helpdeskTickets.id, ticket!.id));

      expect(await post(channel, who, 'znovu')).toBe(200);
      expect(await settle(channel, who, 2)).toEqual(['puvodni', 'znovu']);
      const after = await ticketsOf(channel, who);
      expect(after).toHaveLength(1);
      expect(after[0]!.id).toBe(ticket!.id);
      expect(after[0]!.status).toBe('open');
    });

    it('two different senders get two tickets', async () => {
      const a = sender(`${channel.slice(0, 2)}a`);
      const b = sender(`${channel.slice(0, 2)}b`);
      expect(await post(channel, a, 'od A')).toBe(200);
      expect(await post(channel, b, 'od B')).toBe(200);
      expect(await settle(channel, a, 1)).toEqual(['od A']);
      expect(await settle(channel, b, 1)).toEqual(['od B']);
      const [ta] = await ticketsOf(channel, a);
      const [tb] = await ticketsOf(channel, b);
      expect(ta).toBeTruthy();
      expect(tb).toBeTruthy();
      expect(ta!.id).not.toBe(tb!.id);
    });
  });
}
