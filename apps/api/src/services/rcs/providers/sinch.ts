/**
 * Sinch RCS provider adapter.
 * API: POST https://{region}.rcs.api.sinch.com/rcs/v1/{botId}/messages
 * Auth: Bearer token (Sinch RCS API token).
 *
 * buildSinchMessage() is pure + unit-tested; sendViaSinch() does the HTTP call.
 */
import type { RcsPayload } from '../../../db/schema/index.js';

export interface SinchConfig {
  token: string;
  botId: string;
  region?: string; // 'us' | 'eu' — default 'us'
}

export interface RcsSendResult {
  providerId: string;
  status: 'sent' | 'failed';
  error?: string;
}

/** Map our channel-agnostic RcsPayload to a Sinch RCS `message` object. */
export function buildSinchMessage(
  messageType: string,
  payload: RcsPayload,
): Record<string, unknown> {
  const suggestions = (payload.suggestedReplies ?? []).map((r) => ({
    reply: { text: r, postback_data: r },
  }));

  if (messageType === 'carousel' && payload.carousel?.length) {
    return {
      carousel_message: {
        cards: payload.carousel.map((c) => ({
          title: c.title,
          description: c.description ?? '',
          media: c.imageUrl ? { url: c.imageUrl } : undefined,
          suggestions: (c.buttons ?? []).map((b) =>
            b.url
              ? { action: { text: b.label, open_url_action: { url: b.url } } }
              : { reply: { text: b.label, postback_data: b.postback ?? b.label } },
          ),
        })),
      },
    };
  }

  if ((messageType === 'media' || messageType === 'rich_card') && payload.mediaUrl) {
    return {
      media_message: {
        url: payload.mediaUrl,
        ...(payload.text ? { caption: payload.text } : {}),
        ...(suggestions.length ? { suggestions } : {}),
      },
    };
  }

  return {
    text_message: {
      text: payload.text ?? '',
      ...(suggestions.length ? { suggestions } : {}),
    },
  };
}

export function sinchEndpoint(cfg: SinchConfig): string {
  const region = cfg.region ?? 'us';
  return `https://${region}.rcs.api.sinch.com/rcs/v1/${cfg.botId}/messages`;
}

export async function sendViaSinch(
  cfg: SinchConfig,
  to: string,
  messageType: string,
  payload: RcsPayload,
): Promise<RcsSendResult> {
  const body = {
    to: [to],
    message: buildSinchMessage(messageType, payload),
  };

  let res: Response;
  try {
    res = await fetch(sinchEndpoint(cfg), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return { providerId: '', status: 'failed', error: `network: ${(err as Error).message}` };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { providerId: '', status: 'failed', error: `sinch ${res.status}: ${text.slice(0, 300)}` };
  }

  const data = (await res.json().catch(() => ({}))) as { message_id?: string; id?: string };
  return { providerId: data.message_id ?? data.id ?? '', status: 'sent' };
}
