/**
 * MessageBird Viber Business Messages provider.
 *
 * Base URL: https://conversations.messagebird.com/v1/send
 * Auth:     Authorization: AccessKey {accessKey}
 * Docs:     https://developers.messagebird.com/api/conversations/
 */

import type { ViberContent } from '@forgemsg/shared';

export interface MessageBirdConfig {
  accessKey: string;
  sender: string;
}

interface MessageBirdSendBody {
  to: string;
  from: string;
  type: 'viber';
  content: {
    viber: {
      text?: string;
      media?: {
        url: string;
        mediaType: string;
      };
      action?: {
        caption: string;
        url: string;
      };
    };
  };
}

interface MessageBirdSendResponse {
  id: string;
  status: string;
  createdDatetime?: string;
}

export async function sendViberMessagebird(
  config: MessageBirdConfig,
  to: string,
  content: ViberContent,
): Promise<{ messageId: string }> {
  const viberPayload: MessageBirdSendBody['content']['viber'] = {};

  if (content.body) viberPayload.text = content.body;
  if (content.mediaUrl) {
    const isVideo = content.type === 'video';
    viberPayload.media = {
      url: content.mediaUrl,
      mediaType: isVideo ? 'video/mp4' : 'image/jpeg',
    };
  }
  if (content.actionUrl && content.actionText) {
    viberPayload.action = {
      caption: content.actionText,
      url: content.actionUrl,
    };
  }

  const body: MessageBirdSendBody = {
    to,
    from: content.sender ?? config.sender,
    type: 'viber',
    content: { viber: viberPayload },
  };

  let resp: MessageBirdSendResponse;

  try {
    const httpResp = await fetch('https://conversations.messagebird.com/v1/send', {
      method: 'POST',
      headers: {
        Authorization: `AccessKey ${config.accessKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    resp = (await httpResp.json()) as MessageBirdSendResponse;

    if (!httpResp.ok) {
      throw new Error(`MessageBird Viber HTTP ${httpResp.status}`);
    }
  } catch (err) {
    throw new Error(`MessageBird Viber error: ${(err as Error).message}`);
  }

  return { messageId: resp.id ?? '' };
}
