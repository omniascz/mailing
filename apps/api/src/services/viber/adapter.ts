/**
 * ViberAdapter — IChannelAdapter implementation for Viber Business Messages.
 *
 * Delegates to one of three provider implementations:
 *  - infobip   (default, best for CZ/SK market)
 *  - rakuten   (direct Viber API, requires signed partnership)
 *  - messagebird
 *
 * Provider selection: set VIBER_PROVIDER env var, default = "infobip".
 * Provider credentials come from org-level settings stored in the DB
 * (passed as `providerConfig` to the constructor).
 */

import { BaseChannelAdapter } from '@forgemsg/shared';
import type {
  Channel,
  UnifiedMessage,
  Recipient,
  DeliveryResult,
  DeliveryStatus,
  CostEstimate,
  InboundMessage,
  ChannelTemplate,
  ValidationResult,
  RateLimits,
} from '@forgemsg/shared';
import { sendViaInfobip, getStatusFromInfobip } from './providers/infobip.js';
import type { InfobobipConfig } from './providers/infobip.js';
import { sendViaRakuten, getStatusFromRakuten } from './providers/rakuten.js';
import type { RakutenConfig } from './providers/rakuten.js';
import { sendViaMessageBird, getStatusFromMessageBird } from './providers/messagebird.js';
import type { MessageBirdConfig } from './providers/messagebird.js';

export type ViberProvider = 'infobip' | 'rakuten' | 'messagebird';

export interface ViberAdapterConfig {
  provider: ViberProvider;
  infobip?: InfobobipConfig;
  rakuten?: RakutenConfig;
  messagebird?: MessageBirdConfig;
}

/** Parse an Infobip DLR webhook and return a common DeliveryStatus. */
interface InfobipDlrPayload {
  results?: Array<{
    messageId?: string;
    to?: string;
    sentAt?: string;
    doneAt?: string;
    status?: { groupName?: string; name?: string; description?: string };
    error?: { groupName?: string; description?: string };
  }>;
}

export class ViberAdapter extends BaseChannelAdapter {
  readonly channel: Channel = 'viber';
  readonly provider: string;

  private readonly cfg: ViberAdapterConfig;

  constructor(cfg: ViberAdapterConfig) {
    super();
    this.cfg = cfg;
    this.provider = cfg.provider;
  }

  async send(message: UnifiedMessage, recipient: Recipient): Promise<DeliveryResult> {
    if (message.content.kind !== 'viber') {
      throw this.wrapError({
        code: 'INVALID_CONTENT',
        message: `ViberAdapter received content of kind '${message.content.kind}'`,
        retryable: false,
      });
    }
    if (!recipient.phone) {
      throw this.wrapError({
        code: 'MISSING_PHONE',
        message: `Viber message requires a phone number (contact ${recipient.contactId})`,
        retryable: false,
      });
    }

    const content = message.content;
    try {
      switch (this.cfg.provider) {
        case 'infobip': {
          if (!this.cfg.infobip) throw new Error('Infobip config not provided');
          return await sendViaInfobip(content, recipient, this.cfg.infobip);
        }
        case 'rakuten': {
          if (!this.cfg.rakuten) throw new Error('Rakuten config not provided');
          return await sendViaRakuten(content, recipient, this.cfg.rakuten);
        }
        case 'messagebird': {
          if (!this.cfg.messagebird) throw new Error('MessageBird config not provided');
          return await sendViaMessageBird(content, recipient, this.cfg.messagebird);
        }
      }
    } catch (err) {
      throw this.wrapError({
        code: 'SEND_FAILED',
        message: err instanceof Error ? err.message : String(err),
        retryable: true,
        providerError: err,
      });
    }
  }

  async getStatus(messageId: string): Promise<DeliveryStatus> {
    switch (this.cfg.provider) {
      case 'infobip':
        return getStatusFromInfobip(messageId, this.cfg.infobip!);
      case 'rakuten':
        return getStatusFromRakuten(messageId, this.cfg.rakuten!);
      case 'messagebird':
        return getStatusFromMessageBird(messageId, this.cfg.messagebird!);
    }
  }

  async estimateCost(_message: UnifiedMessage, recipients: Recipient[]): Promise<CostEstimate> {
    const perMsg = 0.015; // USD — typical Viber Business rate
    return {
      totalCost: recipients.length * perMsg,
      currency: 'USD',
      perRecipientCost: perMsg,
      recipientCount: recipients.length,
    };
  }

  async handleInbound(payload: unknown): Promise<InboundMessage> {
    // Viber delivers DLRs and inbound messages via the same webhook endpoint.
    // Here we handle both Infobip-style DLR + Rakuten-style inbound.
    const p = payload as Record<string, unknown>;

    // Rakuten / direct Viber: event=message
    if (p['event'] === 'message' && p['sender']) {
      const sender = p['sender'] as Record<string, unknown>;
      const msg = p['message'] as Record<string, unknown> | undefined;
      return {
        channel: 'viber',
        from: String(sender['id'] ?? sender['name'] ?? 'unknown'),
        content: String(msg?.['text'] ?? ''),
        receivedAt: new Date(),
        providerMessageId: String(p['message_token'] ?? ''),
        metadata: p,
      };
    }

    // Infobip DLR: { results: [...] }
    const ibPayload = payload as InfobipDlrPayload;
    if (ibPayload.results?.length) {
      const r = ibPayload.results[0]!;
      return {
        channel: 'viber',
        from: r.to ?? 'unknown',
        content: r.status?.description ?? '',
        receivedAt: new Date(),
        providerMessageId: r.messageId ?? '',
        metadata: { status: r.status, error: r.error },
      };
    }

    // MessageBird Conversations webhook
    const mbPayload = p as Record<string, unknown>;
    if (mbPayload['type'] === 'message.created' || mbPayload['type'] === 'message.updated') {
      const msg = mbPayload['message'] as Record<string, unknown> | undefined;
      return {
        channel: 'viber',
        from: String(mbPayload['conversationId'] ?? 'unknown'),
        content: String((msg?.['content'] as Record<string, unknown>)?.['text'] ?? ''),
        receivedAt: new Date(),
        providerMessageId: String(msg?.['id'] ?? ''),
        metadata: mbPayload,
      };
    }

    return {
      channel: 'viber',
      from: 'unknown',
      content: JSON.stringify(payload),
      receivedAt: new Date(),
      metadata: { raw: payload },
    };
  }

  async validateTemplate(template: ChannelTemplate): Promise<ValidationResult> {
    const errors: { field: string; message: string }[] = [];
    const content = template.content as Record<string, unknown>;

    if (!content['body'] || typeof content['body'] !== 'string' || !content['body'].trim()) {
      errors.push({ field: 'body', message: 'Viber message body is required' });
    } else if ((content['body'] as string).length > 1000) {
      errors.push({ field: 'body', message: 'Viber body must be ≤ 1000 characters' });
    }

    const validTypes = ['text', 'picture', 'video', 'file', 'action'];
    if (content['type'] && !validTypes.includes(content['type'] as string)) {
      errors.push({
        field: 'type',
        message: `Invalid Viber type. Must be: ${validTypes.join(', ')}`,
      });
    }

    if (content['type'] === 'action' && !content['actionUrl']) {
      errors.push({ field: 'actionUrl', message: 'actionUrl is required for type=action' });
    }

    if (
      (content['type'] === 'picture' ||
        content['type'] === 'video' ||
        content['type'] === 'file') &&
      !content['mediaUrl']
    ) {
      errors.push({
        field: 'mediaUrl',
        message: `mediaUrl is required for type=${content['type']}`,
      });
    }

    return { valid: errors.length === 0, errors };
  }

  getChannelLimits(): RateLimits {
    // Infobip/Rakuten: burst up to 100 TPS, daily cap by tier
    return {
      maxPerSecond: 100,
      maxPerMinute: 3000,
      maxPerHour: 100_000,
      maxPerDay: 1_000_000,
    };
  }
}

/**
 * Build a ViberAdapter from environment variables.
 * Used by the BullMQ viber worker and the campaign send service.
 */
export function createViberAdapter(): ViberAdapter {
  const provider = (process.env['VIBER_PROVIDER'] ?? 'infobip') as ViberProvider;

  if (provider === 'infobip') {
    return new ViberAdapter({
      provider: 'infobip',
      infobip: {
        apiKey: process.env['INFOBIP_API_KEY'] ?? '',
        senderId: process.env['INFOBIP_VIBER_SENDER_ID'] ?? '',
      },
    });
  }

  if (provider === 'rakuten') {
    return new ViberAdapter({
      provider: 'rakuten',
      rakuten: {
        authToken: process.env['VIBER_AUTH_TOKEN'] ?? '',
        senderName: process.env['VIBER_SENDER_NAME'] ?? 'ForgeMsg',
        senderAvatar: process.env['VIBER_SENDER_AVATAR'],
      },
    });
  }

  // messagebird
  return new ViberAdapter({
    provider: 'messagebird',
    messagebird: {
      accessKey: process.env['MESSAGEBIRD_ACCESS_KEY'] ?? '',
      channelId: process.env['MESSAGEBIRD_VIBER_CHANNEL_ID'] ?? '',
    },
  });
}
