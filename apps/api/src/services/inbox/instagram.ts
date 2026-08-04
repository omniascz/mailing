/**
 * Instagram DM adapter for Universal Inbox.
 *
 * Uses Meta Graph API (Instagram Messaging) to:
 *  - Receive inbound DMs via webhook (handled in meta webhook route)
 *  - Send replies to Instagram users
 *  - Fetch conversation history
 *
 * Requires:
 *  - Instagram Business Account linked to a Facebook Page
 *  - Page Access Token with instagram_manage_messages permission
 *  - Webhook subscription to "messages" field on the Instagram account object
 *
 * API docs: https://developers.facebook.com/docs/messenger-platform/instagram/
 */

import type { NewInboxMessage } from '../../db/schema/inbox-messages.js';
import { db } from '../../db/client.js';
import { inboxMessages } from '../../db/schema/inbox-messages.js';
// contacts imported below for future phone-based matching

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

export interface InstagramConfig {
  pageAccessToken: string;
  igAccountId: string; // Instagram business account ID
  fetchImpl?: typeof globalThis.fetch;
}

// ─── Webhook payload shapes ───────────────────────────────────────────────────

interface MetaWebhookEntry {
  id: string;
  time: number;
  messaging?: MetaMessagingEvent[];
  changes?: MetaChange[];
}

interface MetaChange {
  field: string;
  value: unknown;
}

interface MetaMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: Array<{ type: string; payload: { url?: string } }>;
  };
  postback?: { title: string; payload: string };
  read?: { watermark: number };
  delivery?: { mids: string[]; watermark: number };
}

export interface MetaWebhookPayload {
  object: 'instagram' | 'page';
  entry: MetaWebhookEntry[];
}

/**
 * Process a Meta webhook payload and persist all inbound Instagram DMs.
 * Returns the list of inserted inbox_messages rows.
 */
export async function processInstagramWebhook(
  orgId: string,
  payload: MetaWebhookPayload,
): Promise<void> {
  if (payload.object !== 'instagram') return;

  const toInsert: NewInboxMessage[] = [];

  for (const entry of payload.entry) {
    for (const event of entry.messaging ?? []) {
      if (!event.message?.mid) continue;
      // Skip read receipts and delivery notifications
      if (event.read || event.delivery) continue;

      const igsid = event.sender.id; // Instagram-Scoped User ID
      const text = event.message.text ?? '';
      const attachments = (event.message.attachments ?? []).map((a) => ({
        type: a.type,
        url: a.payload?.url,
      }));

      // Try to resolve to a ForgeMsg contact by IGSID
      const contactId = await resolveContactByExternalId(orgId, igsid);

      toInsert.push({
        orgId,
        contactId,
        channel: 'instagram',
        threadId: igsid, // thread per sender IGSID
        providerMessageId: event.message.mid,
        senderId: igsid,
        content: text,
        attachments: attachments as Record<string, unknown>[],
        isOutbound: false,
        replied: false,
        sentAt: new Date(event.timestamp),
        rawPayload: event as unknown as Record<string, unknown>,
      });
    }
  }

  if (toInsert.length > 0) {
    // INSERT OR IGNORE via onConflictDoNothing to handle duplicate webhooks
    await db.insert(inboxMessages).values(toInsert).onConflictDoNothing();
  }
}

/**
 * Send a reply to an Instagram user.
 */
export async function sendInstagramReply(
  recipientIgsid: string,
  text: string,
  cfg: InstagramConfig,
): Promise<string> {
  const fetch = cfg.fetchImpl ?? globalThis.fetch;

  const res = await fetch(`${GRAPH_API_BASE}/me/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.pageAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: recipientIgsid },
      message: { text },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Instagram send failed: ${err}`);
  }

  const json = (await res.json()) as { message_id?: string };
  return json.message_id ?? '';
}

/**
 * Fetch conversation history for an IGSID from the Graph API.
 * Used for initial load when a contact replies for the first time.
 */
export async function fetchInstagramThread(
  igsid: string,
  cfg: InstagramConfig,
): Promise<Array<{ id: string; message: string; from: { id: string }; created_time: string }>> {
  const fetch = cfg.fetchImpl ?? globalThis.fetch;

  const url = new URL(`${GRAPH_API_BASE}/${cfg.igAccountId}/conversations`);
  url.searchParams.set('platform', 'instagram');
  url.searchParams.set('user_id', igsid);
  url.searchParams.set('fields', 'messages{id,message,from,created_time}');
  url.searchParams.set('access_token', cfg.pageAccessToken);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Instagram thread fetch failed: HTTP ${res.status}`);

  const json = (await res.json()) as {
    data?: Array<{
      messages?: {
        data?: Array<{ id: string; message: string; from: { id: string }; created_time: string }>;
      };
    }>;
  };
  return json.data?.[0]?.messages?.data ?? [];
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/** Resolve a ForgeMsg contactId from an Instagram IGSID using social_contact_identifiers. */
async function resolveContactByExternalId(
  orgId: string,
  externalId: string,
): Promise<string | null> {
  const { socialContactIdentifiers } = await import('../../db/schema/index.js');
  const { eq, and } = await import('drizzle-orm');
  const [row] = await db
    .select({ contactId: socialContactIdentifiers.contactId })
    .from(socialContactIdentifiers)
    .where(
      and(
        eq(socialContactIdentifiers.orgId, orgId),
        eq(socialContactIdentifiers.platform, 'instagram'),
        eq(socialContactIdentifiers.externalId, externalId),
      ),
    )
    .limit(1);
  return row?.contactId ?? null;
}
