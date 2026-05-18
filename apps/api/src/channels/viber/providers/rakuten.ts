/**
 * Rakuten Viber Business Messages API provider.
 *
 * Base URL: https://chatapi.viber.com/pa/
 * Auth:     X-Viber-Auth-Token: {authToken}
 * Docs:     https://developers.viber.com/docs/api/rest-bot-api/
 */

import type { ViberContent } from '@forgemsg/shared';

export interface RakutenConfig {
  serviceId: string;
  authToken: string;
}

interface RakutenSendBody {
  receiver: string;
  type: string;
  sender: { name: string; avatar: string };
  text?: string;
  media?: string;
  thumbnail?: string;
  ttl?: number;
  action_body?: string;
  action_type?: string;
}

interface RakutenSendResponse {
  status: number;
  status_message: string;
  message_token?: number;
  chat_hostname?: string;
  billing_status?: number;
}

const BASE_URL = 'https://chatapi.viber.com/pa';

export async function sendViber(
  config: RakutenConfig,
  to: string,
  content: ViberContent,
): Promise<{ messageId: string }> {
  const senderName = content.sender ?? config.serviceId;

  const body: RakutenSendBody = {
    receiver: to,
    type: content.type,
    sender: { name: senderName.slice(0, 28), avatar: '' },
    ttl: content.ttl ?? 86_400,
  };

  if (content.body) body.text = content.body;
  if (content.mediaUrl) body.media = content.mediaUrl;
  if (content.thumbnailUrl) body.thumbnail = content.thumbnailUrl;
  if (content.actionUrl) {
    body.action_body = content.actionUrl;
    body.action_type = 'open-url';
  }

  let resp: RakutenSendResponse;

  try {
    const httpResp = await fetch(`${BASE_URL}/send_message`, {
      method: 'POST',
      headers: {
        'X-Viber-Auth-Token': config.authToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    resp = (await httpResp.json()) as RakutenSendResponse;
  } catch (err) {
    throw new Error(`Rakuten Viber network error: ${(err as Error).message}`);
  }

  if (resp.status !== 0) {
    throw new Error(`Rakuten Viber error ${resp.status}: ${resp.status_message}`);
  }

  return { messageId: String(resp.message_token ?? '') };
}
