/**
 * Viber Business Messages channel adapter.
 *
 * Supports 3 providers with automatic failover:
 *   1. Rakuten Viber Business Messages (primary)
 *   2. Infobip (fallback 1)
 *   3. MessageBird (fallback 2)
 *
 * Implements BaseChannelAdapter from @forgemsg/shared.
 */

import {
  BaseChannelAdapter,
  type Channel,
  type UnifiedMessage,
  type Recipient,
  type DeliveryResult,
  type DeliveryStatus,
  type CostEstimate,
  type InboundMessage,
  type ChannelTemplate,
  type ValidationResult,
  type RateLimits,
  type ViberContent,
} from '@forgemsg/shared';

import { sendViber, type RakutenConfig } from './providers/rakuten.js';
import { sendViberInfobip, type InfobipConfig } from './providers/infobip.js';
import { sendViberMessagebird, type MessageBirdConfig } from './providers/messagebird.js';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface ViberAdapterConfig {
  primaryProvider: 'rakuten' | 'infobip' | 'messagebird';
  rakuten?: RakutenConfig;
  infobip?: InfobipConfig;
  messagebird?: MessageBirdConfig;
  defaultSender?: string;
  ttl?: number;
}

// ─── Webhook types ────────────────────────────────────────────────────────────

interface ViberWebhookMessage {
  event: string;             // 'message' | 'delivered' | 'seen' | 'failed' | 'subscribed' | 'unsubscribed'
  timestamp: number;
  message_token?: number;
  sender?: {
    id: string;
    name?: string;
    avatar?: string;
    country?: string;
    language?: string;
  };
  message?: {
    type: string;
    text?: string;
    media?: string;
    location?: unknown;
    tracking_data?: string;
  };
  user_id?: string;
  desc?: string;             // error description for 'failed' events
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class ViberAdapter extends BaseChannelAdapter {
  readonly channel: Channel = 'viber';
  readonly provider = 'viber-multi';

  constructor(private readonly cfg: ViberAdapterConfig) {
    super();
  }

  // ── send ──────────────────────────────────────────────────────────────────

  async send(message: UnifiedMessage, recipient: Recipient): Promise<DeliveryResult> {
    if (message.content.kind !== 'viber') {
      throw this.wrapError({
        code: 'WRONG_CONTENT',
        message: 'Expected viber content',
        retryable: false,
      });
    }

    const phone = this.normalizePhone(recipient.phone ?? '');
    if (!phone) {
      throw this.wrapError({
        code: 'INVALID_RECIPIENT',
        message: 'Recipient phone number is required for Viber',
        retryable: false,
      });
    }

    const content: ViberContent = {
      ...message.content,
      ttl: message.content.ttl ?? this.cfg.ttl ?? 86_400,
      sender: message.content.sender ?? this.cfg.defaultSender,
    };

    const order = this.buildProviderOrder();
    let lastError: Error | null = null;

    for (const providerName of order) {
      try {
        const { messageId } = await this.sendWithProvider(providerName, phone, content);
        return {
          messageId,
          status: 'sent',
          provider: providerName,
          recipientId: recipient.contactId,
        };
      } catch (err) {
        lastError = err as Error;
        // Try next provider (failover)
      }
    }

    throw this.wrapError({
      code: 'ALL_PROVIDERS_FAILED',
      message: lastError?.message ?? 'All Viber providers failed',
      retryable: true,
    });
  }

  // ── getStatus ─────────────────────────────────────────────────────────────
  // Viber status is delivered via webhooks; no poll endpoint.

  async getStatus(messageId: string): Promise<DeliveryStatus> {
    return {
      messageId,
      status: 'sent',
      updatedAt: new Date(),
      metadata: { note: 'Viber delivery status available via webhook only' },
    };
  }

  // ── estimateCost ──────────────────────────────────────────────────────────

  async estimateCost(_message: UnifiedMessage, recipients: Recipient[]): Promise<CostEstimate> {
    // Viber Business Messages pricing: ~$0.004–$0.007 per message depending on region
    const perMessage = 0.005;
    return {
      totalCost: perMessage * recipients.length,
      currency: 'USD',
      perRecipientCost: perMessage,
      recipientCount: recipients.length,
      breakdown: { viber_business_message: perMessage * recipients.length },
    };
  }

  // ── handleInbound ─────────────────────────────────────────────────────────

  async handleInbound(payload: unknown): Promise<InboundMessage> {
    const wh = payload as ViberWebhookMessage;

    try {
      const receivedAt = wh.timestamp
        ? new Date(wh.timestamp * 1000)
        : new Date();

      const from = wh.sender?.id ?? wh.user_id ?? '';
      const messageToken = wh.message_token ? String(wh.message_token) : undefined;

      if (wh.event === 'message' && wh.message) {
        return {
          channel: 'viber',
          from,
          content: wh.message.text ?? wh.message.type,
          receivedAt,
          providerMessageId: messageToken,
          metadata: {
            type: 'inbound',
            msgType: wh.message.type,
            senderName: wh.sender?.name,
            raw: payload,
          },
        };
      }

      // Delivery/status events
      return {
        channel: 'viber',
        from,
        content: wh.event,
        receivedAt,
        providerMessageId: messageToken,
        metadata: {
          type: 'status',
          event: wh.event,
          desc: wh.desc,
          raw: payload,
        },
      };
    } catch {
      // fall through to generic
    }

    return {
      channel: 'viber',
      from: '',
      content: JSON.stringify(payload),
      receivedAt: new Date(),
      metadata: { type: 'unknown', raw: payload },
    };
  }

  // ── validateTemplate ──────────────────────────────────────────────────────

  async validateTemplate(template: ChannelTemplate): Promise<ValidationResult> {
    const errors: { field: string; message: string }[] = [];
    const content = template.content as Record<string, unknown>;

    if (!content.type || !['text', 'picture', 'video', 'file', 'action'].includes(String(content.type))) {
      errors.push({ field: 'type', message: 'type must be one of: text, picture, video, file, action' });
    }

    if (!content.body || typeof content.body !== 'string' || (content.body as string).trim() === '') {
      errors.push({ field: 'body', message: 'body text is required' });
    }

    if (content.type === 'picture' || content.type === 'video' || content.type === 'file') {
      if (!content.mediaUrl) {
        errors.push({ field: 'mediaUrl', message: `mediaUrl is required for type=${String(content.type)}` });
      }
    }

    if (content.type === 'action') {
      if (!content.actionUrl) {
        errors.push({ field: 'actionUrl', message: 'actionUrl is required for type=action' });
      }
      if (!content.actionText) {
        errors.push({ field: 'actionText', message: 'actionText is required for type=action' });
      }
    }

    if (content.sender && typeof content.sender === 'string' && content.sender.length > 28) {
      errors.push({ field: 'sender', message: 'sender name must be 28 characters or fewer' });
    }

    return { valid: errors.length === 0, errors };
  }

  // ── getChannelLimits ──────────────────────────────────────────────────────

  getChannelLimits(): RateLimits {
    return {
      maxPerSecond: 30,
      maxPerMinute: 1_000,
      maxPerHour: 30_000,
      maxPerDay: 500_000,
    };
  }

  // ── private helpers ───────────────────────────────────────────────────────

  private buildProviderOrder(): Array<'rakuten' | 'infobip' | 'messagebird'> {
    const primary = this.cfg.primaryProvider;
    const all: Array<'rakuten' | 'infobip' | 'messagebird'> = ['rakuten', 'infobip', 'messagebird'];
    return [primary, ...all.filter((p) => p !== primary)];
  }

  private async sendWithProvider(
    providerName: 'rakuten' | 'infobip' | 'messagebird',
    to: string,
    content: ViberContent,
  ): Promise<{ messageId: string }> {
    switch (providerName) {
      case 'rakuten': {
        if (!this.cfg.rakuten) throw new Error('Rakuten config not provided');
        return sendViber(this.cfg.rakuten, to, content);
      }
      case 'infobip': {
        if (!this.cfg.infobip) throw new Error('Infobip config not provided');
        return sendViberInfobip(this.cfg.infobip, to, content);
      }
      case 'messagebird': {
        if (!this.cfg.messagebird) throw new Error('MessageBird config not provided');
        return sendViberMessagebird(this.cfg.messagebird, to, content);
      }
    }
  }

  /** Viber accepts E.164 format with leading + */
  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    return phone.startsWith('+') ? `+${digits}` : `+${digits}`;
  }
}
