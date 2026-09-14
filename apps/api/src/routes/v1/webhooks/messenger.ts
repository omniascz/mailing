/**
 * Facebook Messenger webhook routes (#243).
 *
 *  GET  /api/v1/webhooks/messenger  — Meta webhook verification challenge
 *  POST /api/v1/webhooks/messenger  — incoming Messenger events → helpdesk thread
 */

import type { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { helpdeskTickets, ticketMessages } from '../../../db/schema/helpdesk.js';
import { verifyMessengerWebhook } from '../../../channels/messenger/adapter.js';
import { AppError } from '../../../lib/app-error.js';
import { env } from '../../../config/env.js';
import { unsignedWebhooksAllowed } from '../../../lib/webhook-switches.js';

interface MetaWebhookEntry {
  id: string;
  time: number;
  messaging?: Array<{
    sender?: { id?: string };
    recipient?: { id?: string };
    timestamp?: number;
    message?: { mid?: string; text?: string; attachments?: unknown[] };
    postback?: { payload?: string; title?: string };
  }>;
}

interface MetaWebhookPayload {
  object: string;
  entry: MetaWebhookEntry[];
}

const messengerWebhookRoutes: FastifyPluginAsync = async (app) => {
  // Webhook verification (GET)
  app.get(
    '/api/v1/webhooks/messenger',
    {
      schema: { tags: ['Webhooks', 'Messenger'] },
    },
    async (req, reply) => {
      const {
        'hub.mode': mode,
        'hub.verify_token': token,
        'hub.challenge': challenge,
      } = req.query as Record<string, string>;
      const expected = env.META_WEBHOOK_VERIFY_TOKEN;
      if (mode === 'subscribe' && token === expected) {
        return reply.send(challenge);
      }
      throw AppError.forbidden('Messenger webhook verification failed');
    },
  );

  // Incoming events (POST)
  app.post(
    '/api/v1/webhooks/messenger',
    {
      config: { rawBody: true },
      schema: { tags: ['Webhooks', 'Messenger'] },
    },
    async (req, reply) => {
      const appSecret = process.env.META_APP_SECRET ?? '';
      const signature = (req.headers['x-hub-signature-256'] as string) ?? '';
      const rawBody = (req as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

      // An absent secret is the absence of a check, not a pass. The old guard
      // was "if (appSecret && !verify(...))", so an empty secret skipped
      // verification altogether and the request walked into processing — the
      // same shape #180 removed from lib/meta-signature.ts and #181 from
      // routes/v1/webhooks/meta.ts. This route is registered at boot
      // (index.ts), so the switch that does require the secret is consulted
      // once; losing the variable afterwards left a live endpoint verifying
      // nothing.
      if (!appSecret) {
        if (!unsignedWebhooksAllowed()) {
          throw AppError.forbidden('Messenger webhook is not configured to verify signatures');
        }
      } else if (!verifyMessengerWebhook(rawBody, signature, appSecret)) {
        throw AppError.forbidden('Invalid Messenger webhook signature');
      }

      const payload = req.body as MetaWebhookPayload;
      if (payload.object !== 'page') {
        return reply.send({ received: true });
      }

      processMessengerEvents(payload).catch((err) => {
        app.log.error({ err }, 'Messenger webhook processing error');
      });

      return reply.send({ received: true });
    },
  );
};

async function processMessengerEvents(payload: MetaWebhookPayload): Promise<void> {
  for (const entry of payload.entry ?? []) {
    const pageId = entry.id;
    for (const messaging of entry.messaging ?? []) {
      const psid = messaging.sender?.id;
      if (!psid) continue;

      const messageText = messaging.message?.text ?? messaging.postback?.title;
      const mid = messaging.message?.mid;
      if (!messageText) continue;

      const orgId = await resolveOrgByFacebookPage(pageId);
      if (!orgId) continue;

      const [existing] = await db
        .select({ id: helpdeskTickets.id })
        .from(helpdeskTickets)
        .where(
          and(
            eq(helpdeskTickets.orgId, orgId),
            eq(helpdeskTickets.channel, 'messenger'),
            eq(helpdeskTickets.externalThreadId, psid),
          ),
        )
        .limit(1);

      let ticketId: string;
      if (existing) {
        ticketId = existing.id;
        await db
          .update(helpdeskTickets)
          .set({ status: 'open', updatedAt: new Date() })
          .where(eq(helpdeskTickets.id, ticketId));
      } else {
        const [created] = await db
          .insert(helpdeskTickets)
          .values({
            orgId,
            subject: `Messenger from ${psid}`,
            channel: 'messenger',
            externalThreadId: psid,
            externalIdentity: psid,
            channelMetadata: {
              page_id: pageId,
              has_attachments: (messaging.message?.attachments ?? []).length > 0,
            },
          })
          .returning({ id: helpdeskTickets.id });
        ticketId = created!.id;
      }

      await db
        .insert(ticketMessages)
        .values({
          ticketId,
          sender: psid,
          direction: 'inbound',
          externalMessageId: mid ?? null,
          body: messageText,
          attachments: (messaging.message?.attachments ?? []) as Array<{
            url: string;
            name: string;
          }>,
        })
        .onConflictDoNothing();
    }
  }
}

async function resolveOrgByFacebookPage(_pageId: string): Promise<string | null> {
  return process.env.DEFAULT_ORG_ID ?? null;
}

export default messengerWebhookRoutes;
