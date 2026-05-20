/**
 * Instagram DM webhook routes (#242).
 *
 *  GET  /api/v1/webhooks/instagram  — Meta webhook verification challenge
 *  POST /api/v1/webhooks/instagram  — incoming DM events → helpdesk thread
 */

import type { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { helpdeskTickets, ticketMessages } from '../../../db/schema/helpdesk.js';
import { verifyInstagramWebhook } from '../../../channels/instagram/adapter.js';
import { AppError } from '../../../lib/app-error.js';

interface MetaWebhookEntry {
  id: string;
  time: number;
  messaging?: Array<{
    sender?: { id?: string };
    recipient?: { id?: string };
    timestamp?: number;
    message?: { mid?: string; text?: string };
  }>;
}

interface MetaWebhookPayload {
  object: string;
  entry: MetaWebhookEntry[];
}

const instagramWebhookRoutes: FastifyPluginAsync = async (app) => {
  // Webhook verification (GET) — Meta sends a hub.challenge during subscription setup
  app.get(
    '/api/v1/webhooks/instagram',
    {
      schema: { tags: ['Webhooks', 'Instagram'] },
    },
    async (req, reply) => {
      const {
        'hub.mode': mode,
        'hub.verify_token': token,
        'hub.challenge': challenge,
      } = req.query as Record<string, string>;
      const expected = process.env.META_WEBHOOK_VERIFY_TOKEN ?? '';
      if (mode === 'subscribe' && token === expected) {
        return reply.send(challenge);
      }
      throw AppError.forbidden('Instagram webhook verification failed');
    },
  );

  // Incoming events (POST)
  app.post(
    '/api/v1/webhooks/instagram',
    {
      config: { rawBody: true },
      schema: { tags: ['Webhooks', 'Instagram'] },
    },
    async (req, reply) => {
      const appSecret = process.env.META_APP_SECRET ?? '';
      const signature = (req.headers['x-hub-signature-256'] as string) ?? '';
      const rawBody = (req as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

      if (appSecret && !verifyInstagramWebhook(rawBody, signature, appSecret)) {
        throw AppError.forbidden('Invalid Instagram webhook signature');
      }

      const payload = req.body as MetaWebhookPayload;
      if (payload.object !== 'instagram') {
        return reply.send({ received: true });
      }

      // Dispatch events — we process them best-effort; always return 200 quickly
      processInstagramEvents(payload).catch((err) => {
        app.log.error({ err }, 'Instagram webhook processing error');
      });

      return reply.send({ received: true });
    },
  );
};

async function processInstagramEvents(payload: MetaWebhookPayload): Promise<void> {
  for (const entry of payload.entry ?? []) {
    const pageId = entry.id;
    for (const messaging of entry.messaging ?? []) {
      const igSenderId = messaging.sender?.id;
      const messageText = messaging.message?.text;
      const mid = messaging.message?.mid;
      if (!igSenderId || !messageText) continue;

      // Find an org that owns this Instagram page
      // (In production, we'd look up by page_id in a connections table)
      const orgId = await resolveOrgByInstagramPage(pageId);
      if (!orgId) continue;

      // Find or create helpdesk ticket for this conversation
      const [existing] = await db
        .select({ id: helpdeskTickets.id })
        .from(helpdeskTickets)
        .where(
          and(
            eq(helpdeskTickets.orgId, orgId),
            eq(helpdeskTickets.channel, 'instagram'),
            eq(helpdeskTickets.externalThreadId, igSenderId),
          ),
        )
        .limit(1);

      let ticketId: string;
      if (existing) {
        ticketId = existing.id;
        // Reopen if closed
        await db
          .update(helpdeskTickets)
          .set({ status: 'open', updatedAt: new Date() })
          .where(eq(helpdeskTickets.id, ticketId));
      } else {
        const [created] = await db
          .insert(helpdeskTickets)
          .values({
            orgId,
            subject: `Instagram DM from ${igSenderId}`,
            channel: 'instagram',
            externalThreadId: igSenderId,
            externalIdentity: igSenderId,
            channelMetadata: { page_id: pageId },
          })
          .returning({ id: helpdeskTickets.id });
        ticketId = created!.id;
      }

      // Insert the inbound message (idempotent on mid)
      await db
        .insert(ticketMessages)
        .values({
          ticketId,
          sender: igSenderId,
          direction: 'inbound',
          externalMessageId: mid ?? null,
          body: messageText,
        })
        .onConflictDoNothing();
    }
  }
}

async function resolveOrgByInstagramPage(_pageId: string): Promise<string | null> {
  // Stub: in production, look up ecommerce_connections or a meta_pages table
  // by page_id. For now, fall back to env variable for single-org deployments.
  return process.env.DEFAULT_ORG_ID ?? null;
}

export default instagramWebhookRoutes;
