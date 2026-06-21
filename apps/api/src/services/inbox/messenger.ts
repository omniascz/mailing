/**
 * Facebook Messenger adapter for Universal Inbox.
 *
 * Uses Meta Graph API (Messenger Platform) to:
 *  - Receive inbound messages via webhook (shared with Instagram — /webhook/meta)
 *  - Send replies to Messenger users
 *  - Fetch user profile for contact enrichment
 *
 * Requires:
 *  - Facebook Page with a connected Messenger app
 *  - Page Access Token with pages_messaging permission
 *  - Webhook subscription to "messages" on the Page object
 *
 * API docs: https://developers.facebook.com/docs/messenger-platform/
 */

import type { NewInboxMessage } from '../../db/schema/inbox-messages.js';
import { db } from '../../db/client.js';
import { inboxMessages } from '../../db/schema/inbox-messages.js';
// contacts imported below for future phone-based matching

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

export interface MessengerConfig {
  pageAccessToken: string;
  pageId: string;
  fetchImpl?: typeof globalThis.fetch;
}

// ─── Webhook payload shapes ───────────────────────────────────────────────────

interface MessengerEntry {
  id: string;
  time: number;
  messaging: MessengerEvent[];
}

interface MessengerEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: Array<{ type: string; payload: { url?: string; sticker_id?: number } }>;
    is_echo?: boolean;
  };
  postback?: { title: string; payload: string; mid: string };
  read?: { watermark: number };
  delivery?: { mids: string[]; watermark: number };
}

export interface MessengerWebhookPayload {
  object: 'page';
  entry: MessengerEntry[];
}

/**
 * Process a Messenger webhook payload and persist all inbound messages.
 */
export async function processMessengerWebhook(
  orgId: string,
  payload: MessengerWebhookPayload,
): Promise<void> {
  if (payload.object !== 'page') return;

  const toInsert: NewInboxMessage[] = [];

  for (const entry of payload.entry) {
    for (const event of entry.messaging ?? []) {
      // Skip echoes (our own outbound messages), read receipts, deliveries
      if (event.message?.is_echo) continue;
      if (event.read || event.delivery) continue;

      const mid = event.message?.mid ?? event.postback?.mid ?? '';
      if (!mid) continue;

      const psid = event.sender.id; // Page-Scoped User ID
      const text = event.message?.text ?? event.postback?.title ?? '';
      const attachments = (event.message?.attachments ?? []).map((a) => ({
        type: a.type,
        url: a.payload?.url,
        stickerId: a.payload?.sticker_id,
      }));

      const contactId = await resolveContactByExternalId(orgId, psid);

      toInsert.push({
        orgId,
        contactId,
        channel: 'messenger',
        threadId: psid, // one thread per sender PSID
        providerMessageId: mid,
        senderId: psid,
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
    await db.insert(inboxMessages).values(toInsert).onConflictDoNothing();
  }
}

/**
 * Send a text reply to a Messenger user (PSID).
 */
export async function sendMessengerReply(
  recipientPsid: string,
  text: string,
  cfg: MessengerConfig,
): Promise<string> {
  const fetch = cfg.fetchImpl ?? globalThis.fetch;

  const res = await fetch(`${GRAPH_API_BASE}/me/messages?access_token=${cfg.pageAccessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientPsid },
      message: { text },
      messaging_type: 'RESPONSE',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Messenger send failed: ${err}`);
  }

  const json = (await res.json()) as { message_id?: string };
  return json.message_id ?? '';
}

/**
 * Fetch public profile fields for a Messenger user.
 * Used to pre-fill contact name on first contact.
 */
export async function fetchMessengerProfile(
  psid: string,
  cfg: MessengerConfig,
): Promise<{ firstName?: string; lastName?: string; profilePic?: string } | null> {
  const fetch = cfg.fetchImpl ?? globalThis.fetch;
  const fields = 'first_name,last_name,profile_pic';
  const url = `${GRAPH_API_BASE}/${psid}?fields=${fields}&access_token=${cfg.pageAccessToken}`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const json = (await res.json()) as {
    first_name?: string;
    last_name?: string;
    profile_pic?: string;
  };

  return {
    firstName: json.first_name,
    lastName: json.last_name,
    profilePic: json.profile_pic,
  };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/** Resolve a ForgeMsg contactId from a Facebook Messenger PSID. */
async function resolveContactByExternalId(orgId: string, externalId: string): Promise<string | null> {
  const { socialContactIdentifiers } = await import('../../db/schema/index.js');
  const { eq, and } = await import('drizzle-orm');
  const [row] = await db
    .select({ contactId: socialContactIdentifiers.contactId })
    .from(socialContactIdentifiers)
    .where(
      and(
        eq(socialContactIdentifiers.orgId, orgId),
        eq(socialContactIdentifiers.platform, 'messenger'),
        eq(socialContactIdentifiers.externalId, externalId),
      ),
    )
    .limit(1);
  return row?.contactId ?? null;
}
