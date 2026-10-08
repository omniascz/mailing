/**
 * The live chat visitor sees the conversation, not the agents' notes.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * GET /t/chat/:token/messages returned every ticket_messages row of the chat's
 * ticket. An agent's internal note (the inbox reply route with
 * `internal: true`) and an AI draft are rows of that same ticket, marked only
 * by `direction = 'internal'` — and the poll never looked at direction. So the
 * visitor's widget received "customer is a known chargeback abuser" next to
 * "Hi, how can I help?".
 *
 * ─── The trap ────────────────────────────────────────────────────────────────
 *
 * Polling is the ONLY way an agent's reply reaches the visitor: the SSE stream
 * forwards `chat:new_msg`, and only the visitor's own messages publish there.
 * A filter that hides too much — everything not sent by the customer, say —
 * would pass "the note is gone" and silently cut the agent off. So every case
 * asserts the full list of bodies that DO arrive, not only what does not.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { redis } from '@forgemsg/shared/redis';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { trackedSites } from '../db/schema/index.js';
import { helpdeskTickets } from '../db/schema/helpdesk.js';
import { createTestApp, login, type Session } from './setup/harness.js';
import { persistAgentDraft } from '../services/ai-agents/customer-support.js';

let app: FastifyInstance;
let session: Session;
let siteToken: string;
const madeTickets: string[] = [];

beforeAll(async () => {
  app = await createTestApp();
  session = await login(app);
  siteToken = `itest-chat-${randomUUID()}`;
  await db
    .insert(trackedSites)
    .values({ orgId: session.orgId, siteToken, domain: 'chat-itest.example.test' });
});

afterAll(async () => {
  if (madeTickets.length) {
    await db.delete(helpdeskTickets).where(inArray(helpdeskTickets.id, madeTickets));
  }
  await db.delete(trackedSites).where(eq(trackedSites.siteToken, siteToken));
  await app.close();
});

const agentHeaders = () => ({ authorization: `Bearer ${session.token}` });

async function startChat(initialMessage: string): Promise<{ token: string; ticketId: string }> {
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

async function visitorSays(token: string, body: string) {
  const res = await app.inject({
    method: 'POST',
    url: `/t/chat/${token}/message`,
    payload: { body },
  });
  expect(res.statusCode, res.body).toBe(201);
}

async function agentReply(ticketId: string, body: string, internal = false) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/helpdesk/inbox/${ticketId}/reply`,
    headers: agentHeaders(),
    payload: { body, ...(internal ? { internal: true } : {}) },
  });
  expect(res.statusCode, res.body).toBe(201);
}

async function poll(token: string, after?: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/t/chat/${token}/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`,
  });
  expect(res.statusCode, res.body).toBe(200);
  return {
    raw: res.body,
    data: res.json().data as Array<Record<string, unknown>>,
  };
}

describe('what the visitor polls', () => {
  it('gets the conversation and none of the agents’ internal notes', async () => {
    const { token, ticketId } = await startChat('V1 dobrý den, kde je moje objednávka?');
    await visitorSays(token, 'V2 číslo 2026-1234');
    await agentReply(ticketId, 'A1 dobrý den, hned se podívám');
    await agentReply(ticketId, 'N1 INTERNAL: zákazník už 3× reklamoval', true);
    await persistAgentDraft(ticketId, {
      outcome: 'suggest_draft',
      reply: 'D1 AI DRAFT: nabídnout slevu',
      confidence: 0.5,
      citations: [],
    } as unknown as Parameters<typeof persistAgentDraft>[1]);
    // The plain helpdesk route: an agent reply that lands with the default
    // direction ('inbound') — it is still meant for the visitor.
    const viaHelpdesk = await app.inject({
      method: 'POST',
      url: `/api/v1/helpdesk/tickets/${ticketId}/messages`,
      headers: agentHeaders(),
      payload: { sender: 'agent', body: 'A2 objednávka odešla včera' },
    });
    expect(viaHelpdesk.statusCode, viaHelpdesk.body).toBe(201);

    const { data } = await poll(token);

    expect(data.map((m) => [m.sender, m.body])).toEqual([
      ['customer', 'V1 dobrý den, kde je moje objednávka?'],
      ['customer', 'V2 číslo 2026-1234'],
      ['agent', 'A1 dobrý den, hned se podívám'],
      ['agent', 'A2 objednávka odešla včera'],
    ]);
    // The fields the visitor gets, and nothing else.
    for (const m of data)
      expect(Object.keys(m).sort()).toEqual(['body', 'createdAt', 'id', 'sender']);
  });

  it('the after-cursor still delivers a later agent reply and still hides a later note', async () => {
    const { token, ticketId } = await startChat('V1 haló');
    const first = await poll(token);
    expect(first.data.map((m) => m.body)).toEqual(['V1 haló']);
    const cursor = first.data[0]!.createdAt as string;

    await agentReply(ticketId, 'N1 INTERNAL: spam?', true);
    await agentReply(ticketId, 'A1 ano, jsem tu');

    // The cursor is a millisecond ISO string and created_at has microseconds,
    // so the message AT the cursor comes back again. That predates this test
    // and is not what it is about: compare only the rows not seen before.
    const seen = new Set(first.data.map((m) => m.id));
    const next = await poll(token, cursor);
    expect(next.data.filter((m) => !seen.has(m.id)).map((m) => m.body)).toEqual([
      'A1 ano, jsem tu',
    ]);
  });

  it('a chat with no notes reads exactly as before', async () => {
    const { token, ticketId } = await startChat('V1 otázka');
    await agentReply(ticketId, 'A1 odpověď');
    await visitorSays(token, 'V2 díky');

    const { data } = await poll(token);
    expect(data.map((m) => [m.sender, m.body])).toEqual([
      ['customer', 'V1 otázka'],
      ['agent', 'A1 odpověď'],
      ['customer', 'V2 díky'],
    ]);
  });
});

describe('what stays as it was', () => {
  it('the agent in the helpdesk still sees everything, notes and drafts included', async () => {
    const { ticketId } = await startChat('V1 dotaz');
    await agentReply(ticketId, 'A1 odpověď');
    await agentReply(ticketId, 'N1 INTERNAL: poznámka', true);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/helpdesk/tickets/${ticketId}`,
      headers: agentHeaders(),
    });
    expect(res.statusCode, res.body).toBe(200);
    const msgs = res.json().data.messages as Array<{ body: string; direction: string }>;
    expect(msgs.map((m) => [m.direction, m.body])).toEqual([
      ['inbound', 'V1 dotaz'],
      ['outbound', 'A1 odpověď'],
      ['internal', 'N1 INTERNAL: poznámka'],
    ]);
  });

  // The channel the SSE route forwards. Asserted at the pub/sub level because
  // the route itself cannot subscribe today: it calls connect() on a
  // redis.duplicate() that is already connecting, which throws — on master,
  // before this change, identically.
  it('the visitor’s message is still published to the SSE channel, a note is not', async () => {
    const { token, ticketId } = await startChat('V1 start');
    const sub = redis.duplicate();
    const got: string[] = [];
    sub.on('message', (_ch: string, payload: string) => got.push(payload));
    await sub.subscribe(`chat:new_msg:${ticketId}`);
    try {
      await agentReply(ticketId, 'N1 INTERNAL: nepublikovat', true);
      await visitorSays(token, 'V2 přes SSE');
      for (let i = 0; i < 50 && got.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
    } finally {
      await sub.quit();
    }
    expect(got.map((p) => (JSON.parse(p) as { body: string; sender: string }).body)).toEqual([
      'V2 přes SSE',
    ]);
  });
});
