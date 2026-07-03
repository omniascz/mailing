/**
 * MessageBird Viber Business Messages provider.
 *
 * Uses MessageBird Conversations API which supports Viber Business.
 * API docs: https://developers.messagebird.com/api/conversations/
 *
 * Auth: AccessKey header
 * Base: https://conversations.messagebird.com/v1
 */

import type { Recipient, DeliveryResult, DeliveryStatus, ViberContent } from '@forgemsg/shared';

export const MESSAGEBIRD_API_BASE = 'https://conversations.messagebird.com/v1';

export interface MessageBirdConfig {
  accessKey: string;
  channelId: string; // MessageBird Viber channel ID
  apiBase?: string;
  fetchImpl?: typeof globalThis.fetch;
}

interface MBConversationStartResponse {
  id?: string;
  status?: string;
  error?: { description?: string };
}

interface MBMessageResponse {
  id?: string;
  status?: string;
  error?: { description?: string };
}

function mapMBStatus(
  status?: string,
): 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'bounced' {
  switch (status) {
    case 'pending':
      return 'queued';
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
    case 'deleted':
      return 'failed';
    default:
      return 'sent';
  }
}

export async function sendViaMessageBird(
  content: ViberContent,
  recipient: Recipient,
  cfg: MessageBirdConfig,
): Promise<DeliveryResult> {
  const fetch = cfg.fetchImpl ?? globalThis.fetch;
  const base = cfg.apiBase ?? MESSAGEBIRD_API_BASE;

  if (!recipient.phone) throw new Error('MessageBird Viber requires recipient phone number');

  // Step 1: Start or retrieve conversation
  const convRes = await fetch(`${base}/conversations/start`, {
    method: 'POST',
    headers: {
      Authorization: `AccessKey ${cfg.accessKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channelId: cfg.channelId,
      to: recipient.phone,
    }),
  });

  const convJson = (await convRes.json()) as MBConversationStartResponse;
  if (!convRes.ok || !convJson.id) {
    throw new Error(
      `MessageBird conversation start failed: ${convJson.error?.description ?? `HTTP ${convRes.status}`}`,
    );
  }

  // Step 2: Send message into conversation
  const msgRes = await fetch(`${base}/conversations/${convJson.id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `AccessKey ${cfg.accessKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildMessageBirdPayload(content)),
  });

  const msgJson = (await msgRes.json()) as MBMessageResponse;
  if (!msgRes.ok || !msgJson.id) {
    throw new Error(
      `MessageBird message send failed: ${msgJson.error?.description ?? `HTTP ${msgRes.status}`}`,
    );
  }

  return {
    messageId: msgJson.id,
    status: mapMBStatus(msgJson.status),
    provider: 'messagebird',
    recipientId: recipient.contactId ?? '',
    cost: 0.015,
  };
}

export async function getStatusFromMessageBird(
  messageId: string,
  cfg: Pick<MessageBirdConfig, 'accessKey' | 'apiBase' | 'fetchImpl'>,
): Promise<DeliveryStatus> {
  const fetch = cfg.fetchImpl ?? globalThis.fetch;
  const base = cfg.apiBase ?? MESSAGEBIRD_API_BASE;

  const res = await fetch(`${base}/messages/${encodeURIComponent(messageId)}`, {
    headers: { Authorization: `AccessKey ${cfg.accessKey}` },
  });

  if (!res.ok) throw new Error(`MessageBird status lookup failed: HTTP ${res.status}`);
  const json = (await res.json()) as MBMessageResponse;

  return {
    messageId,
    status: mapMBStatus(json.status),
    updatedAt: new Date(),
  };
}

function buildMessageBirdPayload(content: ViberContent): Record<string, unknown> {
  switch (content.type) {
    case 'picture':
      return {
        type: 'image',
        content: { image: { url: content.mediaUrl, caption: content.body } },
      };
    case 'video':
      return {
        type: 'video',
        content: { video: { url: content.mediaUrl, caption: content.body } },
      };
    case 'file':
      return { type: 'file', content: { file: { url: content.mediaUrl } } };
    default:
      return { type: 'text', content: { text: content.body } };
  }
}
