/**
 * Rakuten Viber (direct Viber Business API) provider.
 *
 * Uses the official Viber Business Messages REST API.
 * API docs: https://developers.viber.com/docs/api/rest-bot-api/
 *
 * Auth: X-Viber-Auth-Token header
 * Base: https://chatapi.viber.com/pa
 *
 * Note: Business-initiated messages require a pre-approved service account
 * and can only be sent to subscribers. Use Infobip/MessageBird for
 * campaign sends to opted-in contacts without a prior conversation.
 */

import type { Recipient, DeliveryResult, DeliveryStatus, ViberContent } from '../../index.js';

export const RAKUTEN_API_BASE = 'https://chatapi.viber.com/pa';

export interface RakutenConfig {
  authToken: string; // X-Viber-Auth-Token
  senderName: string; // max 28 chars
  senderAvatar?: string; // URL
  apiBase?: string;
  fetchImpl?: typeof globalThis.fetch;
}

interface RakutenSendResponse {
  status: number;
  status_message: string;
  message_token?: number;
  chat_hostname?: string;
}

function mapRakutenStatus(
  status: number,
): 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'bounced' {
  if (status === 0) return 'sent';
  if (status === 1) return 'failed'; // 1 = not subscribed
  if (status === 6) return 'failed'; // 6 = account blocked
  return 'failed';
}

export async function sendViaRakuten(
  content: ViberContent,
  recipient: Recipient,
  cfg: RakutenConfig,
): Promise<DeliveryResult> {
  const fetch = cfg.fetchImpl ?? globalThis.fetch;
  const base = cfg.apiBase ?? RAKUTEN_API_BASE;

  if (!recipient.phone) throw new Error('Rakuten Viber requires recipient phone number');

  const body = buildRakutenMessage(content, recipient.phone, cfg);

  const res = await fetch(`${base}/send_message`, {
    method: 'POST',
    headers: {
      'X-Viber-Auth-Token': cfg.authToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as RakutenSendResponse;
  if (!res.ok || json.status !== 0) {
    throw new Error(`Rakuten Viber send failed (status=${json.status}): ${json.status_message}`);
  }

  return {
    messageId: String(json.message_token ?? Date.now()),
    status: mapRakutenStatus(json.status),
    provider: 'rakuten',
    recipientId: recipient.contactId ?? '',
    cost: 0.015,
  };
}

export async function getStatusFromRakuten(
  _messageId: string,
  _cfg: Pick<RakutenConfig, 'authToken' | 'apiBase' | 'fetchImpl'>,
): Promise<DeliveryStatus> {
  // Rakuten does not have a pull-based status API — status arrives via DLR webhook.
  return {
    messageId: _messageId,
    status: 'sent',
    updatedAt: new Date(),
    metadata: { note: 'status delivered via DLR webhook' },
  };
}

function buildRakutenMessage(
  content: ViberContent,
  phone: string,
  cfg: RakutenConfig,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    receiver: phone,
    sender: {
      name: cfg.senderName.slice(0, 28),
      ...(cfg.senderAvatar ? { avatar: cfg.senderAvatar } : {}),
    },
    min_api_version: 1,
  };

  switch (content.type) {
    case 'picture':
      return {
        ...base,
        type: 'picture',
        text: content.body,
        media: content.mediaUrl,
        thumbnail: content.thumbnailUrl,
      };
    case 'video':
      return {
        ...base,
        type: 'video',
        media: content.mediaUrl,
        thumbnail: content.thumbnailUrl,
        size: 0,
        duration: 0,
      };
    case 'file':
      return { ...base, type: 'file', media: content.mediaUrl, file_name: 'attachment', size: 0 };
    case 'action':
      return {
        ...base,
        type: 'rich_media',
        rich_media: {
          Type: 'rich_media',
          ButtonsGroupColumns: 6,
          ButtonsGroupRows: 1,
          BgColor: '#FFFFFF',
          Buttons: [
            {
              Columns: 6,
              Rows: 1,
              Text: content.body,
              ActionType: 'open-url',
              ActionBody: content.actionUrl,
            },
          ],
        },
      };
    default:
      return { ...base, type: 'text', text: content.body };
  }
}
