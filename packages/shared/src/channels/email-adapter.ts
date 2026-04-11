import { BaseChannelAdapter } from './base-adapter.js';
import {
  isEmailContent,
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
} from '../types/channels.js';

/**
 * Skeleton EmailAdapter — first reference implementation of IChannelAdapter.
 *
 * In Phase 3 this is replaced by a real adapter that talks to the Go MTA
 * service via gRPC. For now this exists to:
 *   1. Validate the IChannelAdapter contract is sufficient
 *   2. Give the queue/orchestration layer something to call in dev/tests
 *   3. Document expected behavior for future channel implementations
 */
export class EmailAdapter extends BaseChannelAdapter {
  readonly channel: Channel = 'email';
  readonly provider: string;

  constructor(provider = 'internal-mta') {
    super();
    this.provider = provider;
  }

  async send(message: UnifiedMessage, recipient: Recipient): Promise<DeliveryResult> {
    if (!isEmailContent(message.content)) {
      throw this.wrapError({
        code: 'INVALID_CONTENT',
        message: `EmailAdapter received non-email content: ${message.content.kind}`,
        retryable: false,
      });
    }
    if (!recipient.email) {
      throw this.wrapError({
        code: 'MISSING_EMAIL',
        message: `Recipient ${recipient.contactId} has no email address`,
        retryable: false,
      });
    }

    // TODO(phase-3): replace with gRPC call to Go MTA service.
    // For now we return a queued result so callers can exercise the pipeline.
    return {
      messageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      status: 'queued',
      provider: this.provider,
      recipientId: recipient.contactId,
      cost: 0.0001,
    };
  }

  async getStatus(messageId: string): Promise<DeliveryStatus> {
    // TODO(phase-3): query Go MTA / event store
    return {
      messageId,
      status: 'sent',
      updatedAt: new Date(),
    };
  }

  async estimateCost(_message: UnifiedMessage, recipients: Recipient[]): Promise<CostEstimate> {
    const perRecipient = 0.0001;
    return {
      totalCost: perRecipient * recipients.length,
      currency: 'USD',
      perRecipientCost: perRecipient,
      recipientCount: recipients.length,
    };
  }

  async handleInbound(payload: unknown): Promise<InboundMessage> {
    // TODO(phase-3): parse SES/Mailgun-style inbound webhook
    const data = (payload ?? {}) as Record<string, unknown>;
    return {
      channel: 'email',
      from: String(data.from ?? ''),
      to: data.to ? String(data.to) : undefined,
      content: String(data.text ?? data.html ?? ''),
      receivedAt: new Date(),
      providerMessageId: data.messageId ? String(data.messageId) : undefined,
    };
  }

  async validateTemplate(template: ChannelTemplate): Promise<ValidationResult> {
    const errors: { field: string; message: string }[] = [];
    const c = template.content as { subject?: string; html?: string };

    if (!c.subject || c.subject.length === 0) {
      errors.push({ field: 'subject', message: 'Subject is required' });
    } else if (c.subject.length > 255) {
      errors.push({ field: 'subject', message: 'Subject must be 255 characters or less' });
    }
    if (!c.html || c.html.length === 0) {
      errors.push({ field: 'html', message: 'HTML body is required' });
    }

    return { valid: errors.length === 0, errors };
  }

  getChannelLimits(): RateLimits {
    // Conservative defaults; per-ISP throttling lives in Phase 3.
    return {
      maxPerSecond: 50,
      maxPerMinute: 1000,
      maxPerHour: 30_000,
      maxPerDay: 500_000,
    };
  }
}
