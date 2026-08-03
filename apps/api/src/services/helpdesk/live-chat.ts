/**
 * Live chat / Conversations widget (#206)
 *
 * A lightweight chat session layer on top of the existing helpdesk ticket system.
 * Each chat conversation = one helpdesk ticket with channel='live_chat'.
 *
 * Flow:
 *   1. Visitor opens widget → POST /t/chat/start → returns { sessionToken, ticketId }
 *   2. Visitor sends message → POST /t/chat/:token/message
 *   3. Widget polls for replies → GET /t/chat/:token/messages?after=<ISO timestamp>
 *   4. Agent replies via the regular helpdesk ticket UI
 *   5. Visitor ends session → POST /t/chat/:token/end
 *
 * SSE stream (alternative to polling):
 *   GET /t/chat/:token/stream — sends named events on each new message / typing indicator
 */

import crypto from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { helpdeskTickets, ticketMessages, contacts } from '../../db/schema/index.js';
import { redis } from '@forgemsg/shared/redis';
import { openTicket, appendMessage } from './index.js';
import { AppError } from '../../lib/app-error.js';

const SESSION_TTL = 60 * 60 * 24; // 24 h
const SESSION_PREFIX = 'chat:session:';

export interface ChatSession {
  sessionToken: string;
  ticketId: string;
  orgId: string;
  visitorId: string;
  contactId: string | null;
}

// ─── Session management ───────────────────────────────────────────────────────

export async function startChatSession(input: {
  siteToken: string;
  visitorId: string;
  email?: string;
  name?: string;
  initialMessage?: string;
}): Promise<ChatSession> {
  // Resolve org from site token
  const { getSiteByToken } = await import('../tracking/site-tracker.js');
  const site = await getSiteByToken(input.siteToken);
  if (!site) throw AppError.notFound('Site not found');

  const orgId = site.orgId;

  // Look up contact by email
  let contactId: string | null = null;
  if (input.email) {
    const [c] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.email, input.email)))
      .limit(1);
    contactId = c?.id ?? null;
  }

  // Open a new ticket for this chat session
  const subject = input.name ? `Chat from ${input.name}` : 'Live chat inquiry';
  const ticket = await openTicket(orgId, {
    subject,
    contactId: contactId ?? undefined,
    channel: 'live_chat',
    body: input.initialMessage ?? '(chat session started)',
    priority: 'normal',
  });

  const sessionToken = crypto.randomBytes(32).toString('hex');
  const session: ChatSession = {
    sessionToken,
    ticketId: ticket.id,
    orgId,
    visitorId: input.visitorId,
    contactId,
  };

  await redis.set(`${SESSION_PREFIX}${sessionToken}`, JSON.stringify(session), 'EX', SESSION_TTL);

  return session;
}

export async function getChatSession(sessionToken: string): Promise<ChatSession> {
  const raw = await redis.get(`${SESSION_PREFIX}${sessionToken}`);
  if (!raw) throw AppError.unauthorized('Invalid or expired chat session');
  return JSON.parse(raw) as ChatSession;
}

// ─── Messaging ────────────────────────────────────────────────────────────────

export async function sendVisitorMessage(
  sessionToken: string,
  body: string,
): Promise<{ id: string; createdAt: Date }> {
  const session = await getChatSession(sessionToken);
  const msg = await appendMessage(session.orgId, session.ticketId, {
    sender: 'customer',
    body,
  });
  // Publish to Redis pub/sub so SSE streams can broadcast in real-time
  await redis.publish(
    `chat:new_msg:${session.ticketId}`,
    JSON.stringify({ id: msg.id, body, sender: 'customer', createdAt: msg.createdAt }),
  );
  return { id: msg.id, createdAt: msg.createdAt };
}

/**
 * Poll messages newer than a given timestamp.
 *
 * @param afterTs - ISO 8601 timestamp cursor. Only messages with createdAt > afterTs are returned.
 *                  Omit to get all messages in the session.
 */
export async function getMessages(
  sessionToken: string,
  afterTs?: string,
): Promise<{ id: string; sender: string; body: string; createdAt: Date }[]> {
  const session = await getChatSession(sessionToken);

  const conditions = [eq(ticketMessages.ticketId, session.ticketId)];
  if (afterTs) {
    const after = new Date(afterTs);
    if (!isNaN(after.getTime())) {
      conditions.push(gt(ticketMessages.createdAt, after));
    }
  }

  return db
    .select({
      id: ticketMessages.id,
      sender: ticketMessages.sender,
      body: ticketMessages.body,
      createdAt: ticketMessages.createdAt,
    })
    .from(ticketMessages)
    .where(and(...conditions))
    .orderBy(ticketMessages.createdAt)
    .limit(100);
}

export async function endChatSession(sessionToken: string): Promise<void> {
  const session = await getChatSession(sessionToken);
  await db
    .update(helpdeskTickets)
    .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(helpdeskTickets.id, session.ticketId), eq(helpdeskTickets.orgId, session.orgId)));
  await redis.del(`${SESSION_PREFIX}${sessionToken}`);
}

// ─── Typing indicator (ephemeral, Redis pub/sub) ──────────────────────────────

export async function publishTyping(sessionToken: string, isAgent: boolean): Promise<void> {
  const session = await getChatSession(sessionToken);
  await redis.publish(
    `chat:typing:${session.ticketId}`,
    JSON.stringify({ isAgent, ts: Date.now() }),
  );
}
