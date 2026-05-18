/**
 * Infobip Viber Business Messages provider.
 *
 * Base URL: https://{baseUrl}/viber/2/messages
 * Auth:     Authorization: App {apiKey}
 * Docs:     https://www.infobip.com/docs/viber
 */

import type { ViberContent } from '@forgemsg/shared';

export interface InfobipConfig {
  baseUrl: string;
  apiKey: string;
  sender: string;
}

interface InfobipViberBody {
  from: string;
  to: string[];
  content: {
    body?: string;
    media?: {
      url: string;
      altText?: string;
    };
    button?: {
      text: string;
      url: string;
    };
  };
}

interface InfobipSendResponse {
  messages: Array<{
    messageId: string;
    to: string;
    status: {
      groupId: number;
      groupName: string;
      id: number;
      name: string;
      description: string;
    };
  }>;
  bulkId?: string;
}

export async function sendViberInfobip(
  config: InfobipConfig,
  to: string,
  content: ViberContent,
): Promise<{ messageId: string }> {
  const body: InfobipViberBody = {
    from: content.sender ?? config.sender,
    to: [to],
    content: {},
  };

  if (content.body) body.content.body = content.body;
  if (content.mediaUrl) {
    body.content.media = { url: content.mediaUrl };
  }
  if (content.actionUrl && content.actionText) {
    body.content.button = {
      text: content.actionText,
      url: content.actionUrl,
    };
  }

  let resp: InfobipSendResponse;

  try {
    const httpResp = await fetch(`https://${config.baseUrl}/viber/2/messages`, {
      method: 'POST',
      headers: {
        Authorization: `App ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    resp = (await httpResp.json()) as InfobipSendResponse;

    if (!httpResp.ok) {
      throw new Error(`Infobip Viber HTTP ${httpResp.status}`);
    }
  } catch (err) {
    throw new Error(`Infobip Viber error: ${(err as Error).message}`);
  }

  const messageId = resp.messages?.[0]?.messageId ?? '';
  return { messageId };
}
