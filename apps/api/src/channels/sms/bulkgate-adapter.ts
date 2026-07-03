/**
 * Bulkgate SMS adapter (task 7.1).
 *
 * Wraps @shared/sms-sender BulkGateClient with Mailforge's IChannelAdapter interface.
 *
 * DLR (delivery reports) are pushed to our webhook endpoint
 *   POST /api/v1/sms/webhooks/bulkgate/dlr
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

import {
  BulkGateClient,
  BulkGateError,
  countSegments,
  normalizePhone,
  DLR_STATUS_MAP,
} from '@shared/sms-sender';

// Re-export DLR status map for webhook handler
export { DLR_STATUS_MAP };

// ─── Adapter config ──────────────────────────────────────────────────────────

export interface BulkgateAdapterConfig {
  applicationId: string;
  applicationToken: string;
  dlrBaseUrl?: string;
}

export class BulkgateSmsAdapter extends BaseChannelAdapter {
  readonly channel: Channel = 'sms';
  readonly provider = 'bulkgate';
  private readonly client: BulkGateClient;

  constructor(private readonly cfg: BulkgateAdapterConfig) {
    super();
    this.client = new BulkGateClient({
      applicationId: cfg.applicationId,
      applicationToken: cfg.applicationToken,
      dlrBaseUrl: cfg.dlrBaseUrl ? `${cfg.dlrBaseUrl}/api/v1/sms/webhooks/bulkgate/dlr` : undefined,
    });
  }

  // ── send ──────────────────────────────────────────────────────────────────

  async send(message: UnifiedMessage, recipient: Recipient): Promise<DeliveryResult> {
    if (message.content.kind !== 'sms') {
      throw this.wrapError({
        code: 'WRONG_CONTENT',
        message: 'Expected sms content',
        retryable: false,
      });
    }

    const phone = normalizePhone(recipient.phone ?? '');
    const { body, senderId } = message.content;

    // Create a one-off client with sender override if needed
    let client = this.client;
    if (senderId) {
      client = new BulkGateClient({
        ...this.cfg,
        senderId: 'gText',
        senderIdValue: senderId.slice(0, 11),
        dlrBaseUrl: this.cfg.dlrBaseUrl
          ? `${this.cfg.dlrBaseUrl}/api/v1/sms/webhooks/bulkgate/dlr`
          : undefined,
      });
    }

    try {
      const result = await client.sendSingle(phone, body);

      return {
        messageId: result.smsId,
        status: 'sent',
        provider: this.provider,
        recipientId: recipient.contactId ?? '',
        cost: result.price ?? undefined,
      };
    } catch (err) {
      if (err instanceof BulkGateError) {
        throw this.wrapError({
          code: err.code,
          message: err.message,
          retryable: err.retryable,
          providerError: err.providerData,
        });
      }
      throw this.wrapError({
        code: 'NETWORK_ERROR',
        message: (err as Error).message,
        retryable: true,
      });
    }
  }

  // ── getStatus ─────────────────────────────────────────────────────────────

  async getStatus(messageId: string): Promise<DeliveryStatus> {
    return {
      messageId,
      status: 'sent',
      updatedAt: new Date(),
      metadata: { note: 'Bulkgate status available via DLR webhook only' },
    };
  }

  // ── estimateCost ──────────────────────────────────────────────────────────

  async estimateCost(message: UnifiedMessage, recipients: Recipient[]): Promise<CostEstimate> {
    if (message.content.kind !== 'sms') {
      return {
        totalCost: 0,
        currency: 'EUR',
        perRecipientCost: 0,
        recipientCount: recipients.length,
      };
    }

    const parts = countSegments(message.content.body);
    const perSms = 0.035 * parts;

    return {
      totalCost: perSms * recipients.length,
      currency: 'EUR',
      perRecipientCost: perSms,
      recipientCount: recipients.length,
      breakdown: { segments: parts },
    };
  }

  // ── handleInbound ─────────────────────────────────────────────────────────

  async handleInbound(payload: unknown): Promise<InboundMessage> {
    const dlr = payload as { sms_id: string; number: string; status: string; time?: string };

    return {
      channel: 'sms',
      from: dlr.number ?? '',
      content: dlr.status ?? '',
      receivedAt: dlr.time ? new Date(dlr.time) : new Date(),
      providerMessageId: dlr.sms_id,
      metadata: { type: 'dlr', status: dlr.status, raw: payload },
    };
  }

  // ── validateTemplate ──────────────────────────────────────────────────────

  async validateTemplate(template: ChannelTemplate): Promise<ValidationResult> {
    const errors: { field: string; message: string }[] = [];
    const warnings: { field: string; message: string }[] = [];

    const body = (template.content as Record<string, unknown>).body as string | undefined;

    if (!body || body.trim().length === 0) {
      errors.push({ field: 'body', message: 'SMS body is required' });
    } else {
      if (body.length > 1600) {
        errors.push({ field: 'body', message: 'SMS body exceeds 1600 characters (10 segments)' });
      }
      if (countSegments(body) > 3) {
        warnings.push({
          field: 'body',
          message: 'Message spans more than 3 SMS segments; cost will multiply',
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ── getChannelLimits ──────────────────────────────────────────────────────

  getChannelLimits(): RateLimits {
    return {
      maxPerSecond: 50,
      maxPerMinute: 1_000,
      maxPerHour: 30_000,
      maxPerDay: 500_000,
    };
  }
}
