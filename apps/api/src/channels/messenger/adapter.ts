/**
 * Facebook Messenger channel adapter (#243).
 *
 * Uses Meta Graph API (Messenger Platform) to:
 *   - Send messages to Facebook users
 *   - Receive inbound messages via webhook → helpdesk thread
 *
 * Docs: https://developers.facebook.com/docs/messenger-platform
 */

import crypto from 'node:crypto';
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

export interface MessengerAdapterConfig {
  pageAccessToken: string;
  pageId: string;
  appSecret?: string;
}

interface MetaMessagingResponse {
  recipient_id: string;
  message_id: string;
}

export class MessengerAdapter extends BaseChannelAdapter {
  readonly channel: Channel = 'messenger';
  readonly provider = 'meta-messenger';

  constructor(private readonly cfg: MessengerAdapterConfig) {
    super();
  }

  async send(message: UnifiedMessage, recipient: Recipient): Promise<DeliveryResult> {
    const psid = recipient.externalId ?? recipient.contactId;
    if (!psid) {
      throw this.wrapError({
        code: 'INVALID_RECIPIENT',
        message: 'Facebook Page-Scoped ID (PSID) is required',
        retryable: false,
      });
    }

    const text = this.extractText(message);
    if (!text) {
      throw this.wrapError({
        code: 'INVALID_CONTENT',
        message: 'Messenger message requires text content',
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
        recipient: { id: psid },
        message: { text },
        messaging_type: 'RESPONSE',
      }),
    });

    if (!res.ok) {
      const err = (await res.json()) as { error?: { message?: string; code?: number } };
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
      provider: 'meta-messenger',
      recipientId: recipient.contactId ?? '',
    };
  }

  async sendTemplate(
    templateId: string,
    variables: Record<string, string>,
    recipient: Recipient,
  ): Promise<DeliveryResult> {
    const psid = recipient.externalId ?? recipient.contactId;
    if (!psid) {
      throw this.wrapError({
        code: 'INVALID_RECIPIENT',
        message: 'PSID is required',
        retryable: false,
      });
    }

    // Generic template (button template)
    const res = await fetch(`https://graph.facebook.com/v19.0/${this.cfg.pageId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cfg.pageAccessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: psid },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'generic',
              elements: [
                {
                  title: variables['title'] ?? templateId,
                  subtitle: variables['subtitle'],
                  ...variables,
                },
              ],
            },
          },
        },
      }),
    });

    if (!res.ok) {
      const err = (await res.json()) as { error?: { message?: string } };
      throw this.wrapError({
        code: 'SEND_FAILED',
        message: err.error?.message ?? `Meta API ${res.status}`,
        retryable: false,
      });
    }

    const data = (await res.json()) as MetaMessagingResponse;
    return {
      messageId: data.message_id,
      status: 'sent',
      provider: 'meta-messenger',
      recipientId: recipient.contactId ?? '',
    };
  }

  async getStatus(messageId: string): Promise<DeliveryStatus> {
    return {
      messageId,
      status: 'sent',
      updatedAt: new Date(),
      metadata: { note: 'Messenger delivery status via webhook only' },
    };
  }

  async estimateCost(_message: UnifiedMessage, recipients: Recipient[]): Promise<CostEstimate> {
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
      message?: { mid?: string; text?: string; attachments?: unknown[] };
      timestamp?: number;
      postback?: { payload?: string; title?: string };
    }>;
    const msg = messaging[0];

    const text = msg?.message?.text ?? msg?.postback?.title ?? JSON.stringify(payload);
    return {
      channel: 'messenger',
      from: msg?.sender?.id ?? '',
      content: text,
      receivedAt: msg?.timestamp ? new Date(msg.timestamp) : new Date(),
      providerMessageId: msg?.message?.mid,
      metadata: {
        hasAttachments: (msg?.message?.attachments ?? []).length > 0,
        postbackPayload: msg?.postback?.payload,
        raw: payload,
      },
    };
  }

  async validateTemplate(template: ChannelTemplate): Promise<ValidationResult> {
    const errors: { field: string; message: string }[] = [];
    const content = template.content as unknown as Record<string, unknown>;
    if (!content.text && !content.templateType) {
      errors.push({
        field: 'text',
        message: 'text or templateType is required for Messenger messages',
      });
    }
    if (
      content.text &&
      typeof content.text === 'string' &&
      (content.text as string).length > 2000
    ) {
      errors.push({ field: 'text', message: 'Messenger text must be 2000 characters or fewer' });
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

export function verifyMessengerWebhook(
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
