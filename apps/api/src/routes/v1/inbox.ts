/**
 * Universal Inbox routes.
 *
 *   GET  /api/v1/inbox                        — list all inbound messages
 *   GET  /api/v1/inbox/:id                    — get single message
 *   PATCH /api/v1/inbox/:id                   — update (assign, mark replied)
 *   DELETE /api/v1/inbox/:id                  — delete message
 *   GET  /api/v1/inbox/threads/:threadId      — get all messages in a thread
 *   POST /api/v1/inbox/threads/:threadId/reply — send reply
 *
 * Filtering: ?channel=instagram|messenger&replied=true|false&contactId=uuid
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { inboxMessages } from '../../db/schema/inbox-messages.js';
import { and, eq, desc, sql } from 'drizzle-orm';
import { sendInstagramReply } from '../../services/inbox/instagram.js';
import { sendMessengerReply } from '../../services/inbox/messenger.js';

const idParam = z.object({ id: z.string().uuid() });
const threadParam = z.object({ threadId: z.string().min(1).max(255) });

const listQuery = z.object({
  channel: z.enum(['instagram', 'messenger', 'whatsapp', 'sms', 'email']).optional(),
  replied: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  contactId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

const patchBody = z.object({
  assignedAgentId: z.string().uuid().nullable().optional(),
  replied: z.boolean().optional(),
});

const replyBody = z.object({
  text: z.string().min(1).max(2000),
  channel: z.enum(['instagram', 'messenger']),
});

export default async function inboxRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };
  const editorAuth = {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner', 'editor')],
  };

  // ── List messages ─────────────────────────────────────────────────────────

  app.get('/api/v1/inbox', auth, async (req, reply) => {
    const query = listQuery.parse(req.query);
    const orgId = req.user!.orgId;

    const conditions = [eq(inboxMessages.orgId, orgId), eq(inboxMessages.isOutbound, false)];

    if (query.channel) conditions.push(eq(inboxMessages.channel, query.channel));
    if (query.replied !== undefined) conditions.push(eq(inboxMessages.replied, query.replied));
    if (query.contactId) conditions.push(eq(inboxMessages.contactId, query.contactId));

    const data = await db
      .select()
      .from(inboxMessages)
      .where(and(...conditions))
      .orderBy(desc(inboxMessages.receivedAt))
      .limit(query.limit);

    return reply.send({ data });
  });

  // ── Get single message ────────────────────────────────────────────────────

  app.get('/api/v1/inbox/:id', auth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [row] = await db
      .select()
      .from(inboxMessages)
      .where(and(eq(inboxMessages.orgId, req.user!.orgId), eq(inboxMessages.id, id)));
    if (!row) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Message not found' });
    return reply.send({ data: row });
  });

  // ── Update message (assign / mark replied) ────────────────────────────────

  app.patch('/api/v1/inbox/:id', editorAuth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = patchBody.parse(req.body);

    const updates: Record<string, unknown> = {};
    if (body.assignedAgentId !== undefined) updates['assignedAgentId'] = body.assignedAgentId;
    if (body.replied !== undefined) updates['replied'] = body.replied;

    if (!Object.keys(updates).length) {
      return reply.code(400).send({ code: 'NO_UPDATE', message: 'No fields to update' });
    }

    const [updated] = await db
      .update(inboxMessages)
      .set(updates)
      .where(and(eq(inboxMessages.orgId, req.user!.orgId), eq(inboxMessages.id, id)))
      .returning();

    if (!updated) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Message not found' });
    return reply.send({ data: updated });
  });

  // ── Delete message ────────────────────────────────────────────────────────

  app.delete('/api/v1/inbox/:id', editorAuth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [deleted] = await db
      .delete(inboxMessages)
      .where(and(eq(inboxMessages.orgId, req.user!.orgId), eq(inboxMessages.id, id)))
      .returning();
    if (!deleted) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Message not found' });
    return reply.code(204).send();
  });

  // ── Thread view ───────────────────────────────────────────────────────────

  app.get('/api/v1/inbox/threads/:threadId', auth, async (req, reply) => {
    const { threadId } = threadParam.parse(req.params);
    const data = await db
      .select()
      .from(inboxMessages)
      .where(
        and(eq(inboxMessages.orgId, req.user!.orgId), eq(inboxMessages.threadId, threadId)),
      )
      .orderBy(desc(inboxMessages.sentAt));
    return reply.send({ data });
  });

  // ── Send reply ────────────────────────────────────────────────────────────

  app.post('/api/v1/inbox/threads/:threadId/reply', editorAuth, async (req, reply) => {
    const { threadId } = threadParam.parse(req.params);
    const { text, channel } = replyBody.parse(req.body);
    const orgId = req.user!.orgId;

    // Load page/account credentials from environment (production: from org settings table)
    let messageId: string;

    if (channel === 'instagram') {
      const cfg = {
        pageAccessToken: process.env['META_PAGE_ACCESS_TOKEN'] ?? '',
        igAccountId: process.env['META_IG_ACCOUNT_ID'] ?? '',
      };
      messageId = await sendInstagramReply(threadId, text, cfg);
    } else {
      const cfg = {
        pageAccessToken: process.env['META_PAGE_ACCESS_TOKEN'] ?? '',
        pageId: process.env['META_PAGE_ID'] ?? '',
      };
      messageId = await sendMessengerReply(threadId, text, cfg);
    }

    // Persist outbound message in inbox_messages
    const [saved] = await db
      .insert(inboxMessages)
      .values({
        orgId,
        channel,
        threadId,
        providerMessageId: messageId,
        senderId: 'page', // we are the sender
        content: text,
        isOutbound: true,
        replied: true,
        sentAt: new Date(),
      })
      .returning();

    // Mark the thread as replied
    await db
      .update(inboxMessages)
      .set({ replied: true })
      .where(
        and(
          eq(inboxMessages.orgId, orgId),
          eq(inboxMessages.threadId, threadId),
          eq(inboxMessages.isOutbound, false),
        ),
      );

    return reply.code(201).send({ data: saved });
  });

  // ── Stats summary ─────────────────────────────────────────────────────────

  app.get('/api/v1/inbox/stats', auth, async (req, reply) => {
    const orgId = req.user!.orgId;
    const [stats] = await db.execute(
      sql`
        SELECT
          COUNT(*) FILTER (WHERE is_outbound = false)                        AS total_inbound,
          COUNT(*) FILTER (WHERE is_outbound = false AND replied = false)    AS unread,
          COUNT(*) FILTER (WHERE channel = 'instagram' AND is_outbound = false) AS instagram,
          COUNT(*) FILTER (WHERE channel = 'messenger'  AND is_outbound = false) AS messenger
        FROM inbox_messages
        WHERE org_id = ${orgId}
      `,
    );
    return reply.send({ data: stats });
  });
}
