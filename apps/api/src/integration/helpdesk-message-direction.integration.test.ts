/**
 * A message written as internal is stored as internal, whichever route wrote it.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * The live chat poll shows the visitor rows whose direction is 'inbound' or
 * 'outbound' (#231). POST /api/v1/helpdesk/tickets/:id/messages could not set
 * a direction at all: it took `sender` and nothing else, and appendMessage
 * stored the column default, 'inbound', for every sender. So the one way that
 * route has of marking a message as not-for-the-customer — `sender: 'system'`
 * — produced a row the visitor was shown, and an agent's reply was recorded as
 * a message FROM the customer.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "The note is not in the poll" also holds for a poll that returns nothing. So
 * the case asserts the whole list the visitor DOES get — their own messages
 * and the agent's replies through both routes — and the stored direction of
 * every row, so a hidden reply cannot pass for a hidden note.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { trackedSites } from '../db/schema/index.js';
import { helpdeskTickets, ticketMessages } from '../db/schema/helpdesk.js';
import { createTestApp, login, type Session } from './setup/harness.js';

let app: FastifyInstance;
let session: Session;
let siteToken: string;
const madeTickets: string[] = [];

beforeAll(async () => {
  app = await createTestApp();
  session = await login(app);
  siteToken = `itest-dir-${randomUUID()}`;
  await db
    .insert(trackedSites)
    .values({ orgId: session.orgId, siteToken, domain: 'direction-itest.example.test' });
});

afterAll(async () => {
  if (madeTickets.length) {
    await db.delete(helpdeskTickets).where(inArray(helpdeskTickets.id, madeTickets));
  }
  await db.delete(trackedSites).where(eq(trackedSites.siteToken, siteToken));
  await app.close();
});

const auth = () => ({ authorization: `Bearer ${session.token}` });

async function startChat(initialMessage: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/t/chat/start',
    payload: { siteToken, visitorId: `v-${randomUUID()}`, initialMessage },
  });
  expect(res.statusCode, res.body).toBe(201);
  const { sessionToken, ticketId } = res.json().data as { sessionToken: string; ticketId: string };
  madeTickets.push(ticketId);
  return { token: sessionToken, ticketId };
}

/** POST /api/v1/helpdesk/tickets/:id/messages — the route under test. */
async function helpdeskMessage(ticketId: string, payload: Record<string, unknown>) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/helpdesk/tickets/${ticketId}/messages`,
    headers: auth(),
    payload,
  });
  return res;
}

/** POST /api/v1/helpdesk/inbox/:ticketId/reply — the other agent write path. */
async function inboxReply(ticketId: string, body: string, internal = false) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/helpdesk/inbox/${ticketId}/reply`,
    headers: auth(),
    payload: { body, ...(internal ? { internal: true } : {}) },
  });
  expect(res.statusCode, res.body).toBe(201);
}

async function visitorPoll(token: string) {
  const res = await app.inject({ method: 'GET', url: `/t/chat/${token}/messages` });
  expect(res.statusCode, res.body).toBe(200);
  return (res.json().data as Array<{ sender: string; body: string }>).map((m) => [
    m.sender,
    m.body,
  ]);
}

async function storedRows(ticketId: string) {
  const rows = await db
    .select({
      sender: ticketMessages.sender,
      direction: ticketMessages.direction,
      body: ticketMessages.body,
    })
    .from(ticketMessages)
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(asc(ticketMessages.createdAt));
  return rows.map((r) => [r.sender, r.direction, r.body]);
}

describe('POST /api/v1/helpdesk/tickets/:id/messages', () => {
  it('a note never reaches the visitor; replies through both routes do', async () => {
    const { token, ticketId } = await startChat('V1 dobrý den');
    await inboxReply(ticketId, 'A1 reply via inbox');
    await inboxReply(ticketId, 'N1 note via inbox', true);

    for (const payload of [
      { sender: 'system', body: 'S1 system note via helpdesk' },
      { sender: 'agent', body: 'N2 agent note via helpdesk', direction: 'internal' },
      { sender: 'agent', body: 'A2 reply via helpdesk' },
    ]) {
      const res = await helpdeskMessage(ticketId, payload);
      expect(res.statusCode, res.body).toBe(201);
    }
    await app.inject({
      method: 'POST',
      url: `/t/chat/${token}/message`,
      payload: { body: 'V2 díky' },
    });

    expect(await visitorPoll(token)).toEqual([
      ['customer', 'V1 dobrý den'],
      ['agent', 'A1 reply via inbox'],
      ['agent', 'A2 reply via helpdesk'],
      ['customer', 'V2 díky'],
    ]);

    expect(await storedRows(ticketId)).toEqual([
      ['customer', 'inbound', 'V1 dobrý den'],
      ['agent', 'outbound', 'A1 reply via inbox'],
      ['system', 'internal', 'N1 note via inbox'],
      ['system', 'internal', 'S1 system note via helpdesk'],
      ['agent', 'internal', 'N2 agent note via helpdesk'],
      ['agent', 'outbound', 'A2 reply via helpdesk'],
      ['customer', 'inbound', 'V2 díky'],
    ]);
  });

  it('the agent in the helpdesk still sees every row, notes included', async () => {
    const { ticketId } = await startChat('V1 otázka');
    await helpdeskMessage(ticketId, { sender: 'system', body: 'S1 poznámka' });
    await helpdeskMessage(ticketId, { sender: 'agent', body: 'A1 odpověď' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/helpdesk/tickets/${ticketId}`,
      headers: auth(),
    });
    expect(res.statusCode, res.body).toBe(200);
    const msgs = res.json().data.messages as Array<{ body: string; direction: string }>;
    expect(msgs.map((m) => [m.direction, m.body])).toEqual([
      ['inbound', 'V1 otázka'],
      ['internal', 'S1 poznámka'],
      ['outbound', 'A1 odpověď'],
    ]);
  });

  it('an explicit customer message through the route is still inbound', async () => {
    const { ticketId } = await startChat('V1');
    const res = await helpdeskMessage(ticketId, {
      sender: 'customer',
      body: 'C2 přepsáno agentem',
    });
    expect(res.statusCode, res.body).toBe(201);
    expect((await storedRows(ticketId)).at(-1)).toEqual([
      'customer',
      'inbound',
      'C2 přepsáno agentem',
    ]);
  });

  it('an unknown direction is refused, not stored', async () => {
    const { ticketId } = await startChat('V1');
    const res = await helpdeskMessage(ticketId, {
      sender: 'agent',
      body: 'X',
      direction: 'sideways',
    });
    expect(res.statusCode).toBe(400);
    expect(await storedRows(ticketId)).toEqual([['customer', 'inbound', 'V1']]);
  });
});

describe('customer intake is unchanged', () => {
  it('an inbound email is stored inbound, first message and reply alike', async () => {
    vi.resetModules();
    const prev = process.env.FEATURE_BEYOND_CORE;
    process.env.FEATURE_BEYOND_CORE = 'true';
    const first = `<${randomUUID()}@example.test>`;
    try {
      const { receiveInbound } = await import('../services/inbound-email/index.js');
      const base = { from: 'smer@example.test', to: 'support@acme.test', subject: 'Dotaz' };
      await receiveInbound(session.orgId, { ...base, textBody: 'E1', messageId: first });
      await receiveInbound(session.orgId, { ...base, textBody: 'E2', inReplyTo: first });
    } finally {
      if (prev === undefined) delete process.env.FEATURE_BEYOND_CORE;
      else process.env.FEATURE_BEYOND_CORE = prev;
    }
    const [hit] = await db
      .select({ ticketId: ticketMessages.ticketId })
      .from(ticketMessages)
      .where(eq(ticketMessages.externalMessageId, first.slice(1, -1)));
    madeTickets.push(hit!.ticketId);
    expect(await storedRows(hit!.ticketId)).toEqual([
      ['customer', 'inbound', 'E1'],
      ['customer', 'inbound', 'E2'],
    ]);
  });
});
