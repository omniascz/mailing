/**
 * Instagram DM channel adapter (#242).
 *
 * Uses Meta Graph API (Messaging API for Instagram) to:
 *   - Send DMs to Instagram users
 *   - Receive inbound DMs via webhook → helpdesk thread
 *
 * Docs: https://developers.facebook.com/docs/messenger-platform/instagram
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
} from '@forgemsg/shared';

export interface InstagramAdapterConfig {
  pageAccessToken: string;
  pageId: string;
  appSecret?: string;
}

interface MetaMessagingResponse {
  recipient_id: string;
  message_id: string;
}

export class InstagramAdapter extends BaseChannelAdapter {
  readonly channel: Channel = 'instagram';
  readonly provider = 'meta-instagram';

  constructor(private readonly cfg: InstagramAdapterConfig) {
    super();
  }

  async send(message: UnifiedMessage, recipient: Recipient): Promise<DeliveryResult> {
    const igUserId = recipient.externalId ?? recipient.contactId;
    if (!igUserId) {
      throw this.wrapError({
        code: 'INVALID_RECIPIENT',
        message: 'Instagram IGSID is required',
        retryable: false,
      });
    }

    const text = this.extractText(message);
    if (!text) {
      throw this.wrapError({
        code: 'INVALID_CONTENT',
        message: 'Instagram DM requires text content',
        retryable: false,
      });
    }

    const res = await fetch(`https://graph.facebook.com/v19.0/${this.cfg.pageId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cfg.pageAccessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: igUserId },
        message: { text },
        messaging_type: 'RESPONSE',
      }),
    });

    if (!res.ok) {
      const err = (await res.json()) as { error?: { message?: string } };
      throw this.wrapError({
        code: 'SEND_FAILED',
        message: err.error?.message ?? `Meta API ${res.status}`,
        retryable: res.status === 429 || res.status >= 500,
      });
    }

    const data = (await res.json()) as MetaMessagingResponse;
    return {
      messageId: data.message_id,
      status: 'sent',
      provider: 'meta-instagram',
      recipientId: recipient.contactId ?? '',
    };
  }

  async getStatus(messageId: string): Promise<DeliveryStatus> {
    // Meta Instagram does not expose a polling endpoint for DM status;
    // delivery/read receipts arrive via webhook only.
    return {
      messageId,
      status: 'sent',
      updatedAt: new Date(),
      metadata: { note: 'Instagram DM status via webhook only' },
    };
  }

  async estimateCost(_message: UnifiedMessage, recipients: Recipient[]): Promise<CostEstimate> {
    // Instagram Messaging API is currently free within rate limits
    return {
      totalCost: 0,
      currency: 'USD',
      perRecipientCost: 0,
      recipientCount: recipients.length,
    };
  }

  async handleInbound(payload: unknown): Promise<InboundMessage> {
    const entry = (payload as { entry?: Array<{ messaging?: Array<unknown> }> }).entry?.[0];
    const messaging = (entry?.messaging ?? []) as Array<{
      sender?: { id?: string };
      message?: { mid?: string; text?: string };
      timestamp?: number;
    }>;
    const msg = messaging[0];

    return {
      channel: 'instagram',
      from: msg?.sender?.id ?? '',
      content: msg?.message?.text ?? JSON.stringify(payload),
      receivedAt: msg?.timestamp ? new Date(msg.timestamp) : new Date(),
      providerMessageId: msg?.message?.mid,
      metadata: { raw: payload },
    };
  }

  async validateTemplate(template: ChannelTemplate): Promise<ValidationResult> {
    const errors: { field: string; message: string }[] = [];
    const content = template.content as unknown as Record<string, unknown>;
    if (!content.text || typeof content.text !== 'string' || !content.text.trim()) {
      errors.push({ field: 'text', message: 'text is required for Instagram DMs' });
    } else if ((content.text as string).length > 1000) {
      errors.push({ field: 'text', message: 'Instagram DM text must be 1000 characters or fewer' });
    }
    return { valid: errors.length === 0, errors };
  }

  getChannelLimits(): RateLimits {
    return {
      maxPerSecond: 250,
      maxPerMinute: 10_000,
      maxPerHour: 250_000,
      maxPerDay: 1_000_000,
    };
  }

  private extractText(message: UnifiedMessage): string | undefined {
    const c = message.content as unknown as Record<string, unknown>;
    return (c['text'] as string | undefined) ?? (c['body'] as string | undefined);
  }
}

// ─── Webhook signature verification ──────────────────────────────────────────

import crypto from 'node:crypto';

export function verifyInstagramWebhook(
  rawBody: string,
  signature: string,
  appSecret: string,
): boolean {
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
