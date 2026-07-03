/**
 * Infobip Viber Business Messages provider.
 *
 * Infobip is the primary Viber Business intermediary for the CZ/SK market.
 * API docs: https://www.infobip.com/docs/viber/viber-business-messages
 *
 * Auth: Authorization: App {API_KEY}  (header)
 * Base: https://api.infobip.com
 */

import type {
  Recipient,
  DeliveryResult,
  DeliveryStatus,
  ViberContent,
} from '@forgemsg/shared';

export const INFOBIP_API_BASE = 'https://api.infobip.com';

export interface InfobobipConfig {
  apiKey: string;
  senderId: string; // Viber service name (registered with Infobip)
  apiBase?: string;
  fetchImpl?: typeof globalThis.fetch;
}

interface InfobipViberResponse {
  messages?: Array<{ messageId?: string; status?: { groupName?: string; description?: string } }>;
  requestError?: { serviceException?: { text?: string } };
}

interface InfobipStatusResponse {
  results?: Array<{
    messageId?: string;
    status?: { groupName?: string; name?: string; description?: string };
  }>;
}

/**
 * Map Infobip status groupName to our DeliveryStatusType.
 */
function mapStatus(
  groupName?: string,
): 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'bounced' {
  switch (groupName) {
    case 'PENDING':
      return 'queued';
    case 'DELIVERED':
      return 'delivered';
    case 'SEEN':
      return 'read';
    case 'REJECTED':
    case 'UNDELIVERABLE':
      return 'failed';
    default:
      return 'sent';
  }
}

export async function sendViaInfobip(
  content: ViberContent,
  recipient: Recipient,
  cfg: InfobobipConfig,
): Promise<DeliveryResult> {
  const fetch = cfg.fetchImpl ?? globalThis.fetch;
  const base = cfg.apiBase ?? INFOBIP_API_BASE;

  const body: Record<string, unknown> = {
    messages: [
      {
        from: cfg.senderId,
        destinations: [{ to: recipient.phone }],
        viber: buildViberPayload(content),
      },
    ],
  };

  const res = await fetch(`${base}/viber/2/messages`, {
    method: 'POST',
    headers: {
      Authorization: `App ${cfg.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as InfobipViberResponse;

  if (!res.ok || json.requestError) {
    const msg = json.requestError?.serviceException?.text ?? `HTTP ${res.status}`;
    throw new Error(`Infobip Viber send failed: ${msg}`);
  }

  const first = json.messages?.[0];
  const messageId = first?.messageId ?? `infobip-${Date.now()}`;
  const status = mapStatus(first?.status?.groupName);

  return {
    messageId,
    status,
    provider: 'infobip',
    recipientId: recipient.contactId ?? '',
    cost: 0.015, // ~typical Viber Business cost — caller replaces with actual billing
  };
}

export async function getStatusFromInfobip(
  messageId: string,
  cfg: Pick<InfobobipConfig, 'apiKey' | 'apiBase' | 'fetchImpl'>,
): Promise<DeliveryStatus> {
  const fetch = cfg.fetchImpl ?? globalThis.fetch;
  const base = cfg.apiBase ?? INFOBIP_API_BASE;

  const res = await fetch(`${base}/viber/2/messages/${encodeURIComponent(messageId)}`, {
    headers: {
      Authorization: `App ${cfg.apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) throw new Error(`Infobip status lookup failed: HTTP ${res.status}`);
  const json = (await res.json()) as InfobipStatusResponse;
  const result = json.results?.[0];

  return {
    messageId,
    status: mapStatus(result?.status?.groupName),
    updatedAt: new Date(),
    metadata: result?.status ?? undefined,
  };
}

function buildViberPayload(content: ViberContent): Record<string, unknown> {
  const base: Record<string, unknown> = {
    text: content.body,
    validityPeriod: content.ttl ?? 86400,
  };

  if (content.type === 'picture' || content.type === 'video' || content.type === 'file') {
    base.imageUrl = content.mediaUrl;
    base.thumbnailUrl = content.thumbnailUrl;
  }

  if (content.type === 'action' && content.actionUrl) {
    base.buttonUrl = content.actionUrl;
    base.buttonText = content.actionText ?? 'Open';
  }

  return base;
}
