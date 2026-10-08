/**
 * Two messages from one sender, routed into the universal inbox at the same
 * time, end up in one ticket.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * routeInbound looks for a ticket — by thread id, then by the sender's
 * identity, then by contact — and creates one when nothing matches. Two
 * messages routed together both look, both find nothing, and both create:
 *
 *   - without a thread id there is no unique key at all, so the sender gets
 *     two tickets (and, when the address is new, two contacts);
 *   - with a thread id the partial unique index on (org_id, channel,
 *     external_thread_id) refuses the second insert, and routeInbound throws:
 *     POST /api/v1/helpdesk/inbox/ingest answers 500 and the message is not
 *     filed.
 *
 * ─── How the race is made deterministic ──────────────────────────────────────
 *
 * The test takes LOCK TABLE helpdesk_tickets IN SHARE MODE. Reads still pass,
 * so both routings do every lookup and find nothing; both then block on their
 * INSERT. Only when Postgres shows two backends waiting on a lock does the test
 * release it. A routing that serialises per sender waits earlier — on its own
 * lock — and that wait counts too, so the same gate measures both versions.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "One ticket" is also what a router that drops the second message produces.
 * So the race cases assert both bodies, and the cases below assert that a lone
 * message opens a ticket, a later one joins it, a closed thread reopens, and a
 * different sender gets a ticket of their own.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, organizations } from '../db/schema/index.js';
import { helpdeskTickets, ticketMessages } from '../db/schema/helpdesk.js';
import {
  routeInbound,
  type InboundMessage,
  type RouteResult,
} from '../services/helpdesk/universal-inbox.js';

const tag = randomUUID().slice(0, 8);
let orgId: string;

const addr = (who: string) => `${who}-${tag}@example.test`;

const message = (who: string, body: string, threadId?: string): InboundMessage => ({
  orgId,
  channel: 'email',
  identity: { email: addr(who) },
  body,
  subject: 'Dotaz',
  ...(threadId ? { externalThreadId: threadId } : {}),
});

const ticketsOf = (who: string) =>
  db
    .select()
    .from(helpdeskTickets)
    .where(and(eq(helpdeskTickets.orgId, orgId), eq(helpdeskTickets.externalIdentity, addr(who))));

async function bodiesOf(who: string): Promise<string[]> {
  const ids = (await ticketsOf(who)).map((t) => t.id);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ body: ticketMessages.body })
    .from(ticketMessages)
    .where(inArray(ticketMessages.ticketId, ids));
  return rows.map((r) => r.body).sort();
}

/** Backends blocked on a lock on their way to creating a ticket. */
async function lockWaiters(): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM pg_stat_activity
    WHERE datname = current_database()
      AND wait_event_type = 'Lock'
      -- The integration harness runs an EXPLAIN ahead of each statement, so the
      -- text may start with EXPLAIN; the lock is taken either way.
      AND (query ILIKE '%insert into "helpdesk_tickets"%' OR query ILIKE '%pg_advisory_xact_lock%')
  `);
  return Number((rows as unknown as Array<{ n: number }>)[0]?.n ?? 0);
}

/**
 * Route two messages so that, in an unserialised router, both finish their
 * lookups before either inserts. Returns how each routing ended.
 */
async function raceTwo(a: InboundMessage, b: InboundMessage) {
  let waiting = 0;
  let pending: Promise<PromiseSettledResult<RouteResult>[]> | undefined;
  await db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE helpdesk_tickets IN SHARE MODE`);
    pending = Promise.allSettled([routeInbound(a), routeInbound(b)]);
    const deadline = Date.now() + 10_000;
    while ((waiting = await lockWaiters()) < 2 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // Returning commits, which releases the table lock.
  });
  const outcomes = await pending!;
  // Without this the case proves nothing: both routings must have been in
  // flight together, or there was no race to lose.
  expect(waiting, 'the two routings never met').toBe(2);
  return outcomes.map((o) => (o.status === 'fulfilled' ? 'ok' : String(o.reason)));
}

beforeAll(async () => {
  const [org] = await db
    .insert(organizations)
    .values({ name: 'inbox race', slug: `inbox-race-${tag}` })
    .returning({ id: organizations.id });
  orgId = org!.id;
}, 60_000);

afterAll(async () => {
  if (orgId) {
    await db.delete(helpdeskTickets).where(eq(helpdeskTickets.orgId, orgId));
    await db.delete(contacts).where(eq(contacts.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
}, 60_000);

describe('routeInbound: two messages from one sender at once', () => {
  it('without a thread id: one ticket holding both messages', async () => {
    const outcomes = await raceTwo(message('nothr', 'prvni'), message('nothr', 'druha'));
    expect(outcomes).toEqual(['ok', 'ok']);
    expect(await ticketsOf('nothr'), 'the sender got two tickets').toHaveLength(1);
    expect(await bodiesOf('nothr')).toEqual(['druha', 'prvni']);
  });

  it('with a thread id: both are filed, in one ticket', async () => {
    const thread = `thr-${tag}`;
    const outcomes = await raceTwo(
      message('thr', 'prvni', thread),
      message('thr', 'druha', thread),
    );
    expect(outcomes, 'a routing failed').toEqual(['ok', 'ok']);
    expect(await ticketsOf('thr')).toHaveLength(1);
    expect(await bodiesOf('thr')).toEqual(['druha', 'prvni']);
  });
});

describe('routeInbound: what must keep working', () => {
  it('a lone message opens a ticket, and a later one from the same sender joins it', async () => {
    const first = await routeInbound(message('seq', 'jedna'));
    expect(first.created).toBe(true);
    const second = await routeInbound(message('seq', 'dva'));
    expect(second.created).toBe(false);
    expect(second.ticket.id).toBe(first.ticket.id);
    expect(await bodiesOf('seq')).toEqual(['dva', 'jedna']);
  });

  it('a different sender gets a ticket of their own', async () => {
    const a = await routeInbound(message('own-a', 'od A'));
    const b = await routeInbound(message('own-b', 'od B'));
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.ticket.id).not.toBe(b.ticket.id);
  });

  it('a message on a closed thread reopens that ticket', async () => {
    const thread = `reo-${tag}`;
    const first = await routeInbound(message('reo', 'puvodni', thread));
    await db
      .update(helpdeskTickets)
      .set({ status: 'closed', closedAt: new Date() })
      .where(eq(helpdeskTickets.id, first.ticket.id));
    const again = await routeInbound(message('reo', 'znovu', thread));
    expect(again.ticket.id).toBe(first.ticket.id);
    expect(again.matchReason).toBe('thread');
    const [row] = await db
      .select()
      .from(helpdeskTickets)
      .where(eq(helpdeskTickets.id, first.ticket.id));
    expect(row!.status).toBe('open');
  });
});
