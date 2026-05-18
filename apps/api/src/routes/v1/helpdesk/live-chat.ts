/**
 * Live chat / Conversations widget routes (#206)
 *
 *  POST /t/chat/start            — start a chat session (public)
 *  POST /t/chat/:token/message   — send visitor message (public)
 *  GET  /t/chat/:token/messages  — poll messages with ?after=<ISO> cursor (public)
 *  POST /t/chat/:token/end       — end session (public)
 *  POST /t/chat/:token/typing    — publish typing indicator (public)
 *  GET  /t/chat/:token/stream    — SSE stream for real-time messages + typing (public)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  startChatSession,
  sendVisitorMessage,
  getMessages,
  endChatSession,
  publishTyping,
  getChatSession,
} from '../../../services/helpdesk/live-chat.js';
import { redis } from '../../../lib/redis.js';

const liveChatRoutes: FastifyPluginAsync = async (app) => {
  // ── Start session ─────────────────────────────────────────────────────────────

  const startSchema = z.object({
    siteToken: z.string().min(1),
    visitorId: z.string().min(1),
    email: z.string().email().optional(),
    name: z.string().max(255).optional(),
    initialMessage: z.string().max(5000).optional(),
  });

  app.post('/t/chat/start', {
    schema: { tags: ['LiveChat'], summary: 'Start a live chat session' },
  }, async (req, reply) => {
    const body = startSchema.parse(req.body);
    const session = await startChatSession(body);
    return reply.status(201).send({
      data: {
        sessionToken: session.sessionToken,
        ticketId: session.ticketId,
      },
    });
  });

  // ── Send message ──────────────────────────────────────────────────────────────

  app.post('/t/chat/:token/message', {
    schema: { tags: ['LiveChat'], summary: 'Send a visitor message' },
  }, async (req, reply) => {
    const { token } = req.params as { token: string };
    const { body: text } = z.object({ body: z.string().min(1).max(10_000) }).parse(req.body);
    const result = await sendVisitorMessage(token, text);
    return reply.status(201).send({ data: result });
  });

  // ── Poll messages ─────────────────────────────────────────────────────────────
  // Cursor is an ISO 8601 timestamp — returns only messages created AFTER that point.

  app.get('/t/chat/:token/messages', {
    schema: { tags: ['LiveChat'], summary: 'Poll messages (timestamp cursor)' },
  }, async (req) => {
    const { token } = req.params as { token: string };
    const { after } = z.object({ after: z.string().optional() }).parse(req.query);
    const messages = await getMessages(token, after);
    return { data: messages };
  });

  // ── End session ───────────────────────────────────────────────────────────────

  app.post('/t/chat/:token/end', {
    schema: { tags: ['LiveChat'], summary: 'End a chat session and close the ticket' },
  }, async (req, reply) => {
    const { token } = req.params as { token: string };
    await endChatSession(token);
    return reply.status(204).send();
  });

  // ── Typing indicator ──────────────────────────────────────────────────────────

  app.post('/t/chat/:token/typing', {
    schema: { tags: ['LiveChat'], summary: 'Publish typing indicator (ephemeral)' },
  }, async (req, reply) => {
    const { token } = req.params as { token: string };
    const { isAgent } = z.object({ isAgent: z.boolean().optional().default(false) }).parse(req.body);
    await publishTyping(token, isAgent);
    return reply.status(202).send({ ok: true });
  });

  // ── SSE stream ────────────────────────────────────────────────────────────────
  // Streams new messages + typing indicators to the browser widget via Server-Sent Events.
  // Uses a dedicated Redis subscriber connection (redis.duplicate) per SSE connection.

  app.get('/t/chat/:token/stream', {
    schema: { tags: ['LiveChat'], summary: 'SSE stream of new messages and typing indicators' },
  }, async (req, reply) => {
    const { token } = req.params as { token: string };

    // Validate session before opening the stream
    const session = await getChatSession(token);

    // Set SSE headers on the raw Node.js response
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    });
    reply.raw.flushHeaders?.();

    // Keep-alive comment every 25 s to prevent proxy timeouts
    const pingInterval = setInterval(() => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(': ping\n\n');
      }
    }, 25_000);

    // Dedicated Redis subscriber — pub/sub mode requires its own connection
    const sub = redis.duplicate();
    await sub.connect();

    const msgChannel = `chat:new_msg:${session.ticketId}`;
    const typingChannel = `chat:typing:${session.ticketId}`;
    await sub.subscribe(msgChannel, typingChannel);

    sub.on('message', (channel: string, payload: string) => {
      if (reply.raw.writableEnded) return;
      const event = channel === typingChannel ? 'typing' : 'message';
      reply.raw.write(`event: ${event}\ndata: ${payload}\n\n`);
    });

    // Resolve once the client disconnects (close or error)
    await new Promise<void>((resolve) => {
      const cleanup = () => {
        clearInterval(pingInterval);
        sub.unsubscribe(msgChannel, typingChannel).catch(() => undefined);
        sub.quit().catch(() => undefined);
        resolve();
      };
      req.raw.once('close', cleanup);
      req.raw.once('error', cleanup);
    });
  });
};

export default liveChatRoutes;
