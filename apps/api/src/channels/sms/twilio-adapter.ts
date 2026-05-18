/**
 * Twilio SMS adapter (task 7.2).
 *
 * Uses the Twilio Messages REST API:
 *   POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json
 *
 * Auth: Basic(AccountSid, AuthToken)
 *
 * Inbound SMS: Twilio sends POST to our /api/v1/sms/webhooks/twilio/inbound
 * Status callback: Twilio POSTs to /api/v1/sms/webhooks/twilio/status
 */

import {
  BaseChannelAdapter,
  type Channel,
  type UnifiedMessage,
  type Recipient,
  type DeliveryResult,
  type DeliveryStatus,
  type DeliveryStatusType,
  type CostEstimate,
  type InboundMessage,
  type ChannelTemplate,
  type ValidationResult,
  type RateLimits,
} from '@forgemsg/shared';

// ─── Twilio API types ─────────────────────────────────────────────────────────

interface TwilioMessageResponse {
  sid: string;
  status: string;    // "queued" | "sent" | "delivered" | "failed" | "undelivered"
  to: string;
  from: string;
  body: string;
  price?: string;   // negative number like "-0.0075"
  price_unit?: string;
  error_code?: number | null;
  error_message?: string | null;
}

interface TwilioStatusCallbackPayload {
  MessageSid: string;
  MessageStatus: string;  // "queued" | "sent" | "delivered" | "failed" | "undelivered" | "read"
  To: string;
  From: string;
  ErrorCode?: string;
  ErrorMessage?: string;
}

interface TwilioInboundPayload {
  MessageSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia?: string;
}

// Twilio error code → our code mapping
const ERROR_CODE_MAP: Record<number, { code: string; retryable: boolean }> = {
  21211: { code: 'INVALID_NUMBER', retryable: false },
  21212: { code: 'INVALID_NUMBER', retryable: false },
  21408: { code: 'PERMISSION_DENIED', retryable: false },
  21610: { code: 'BLACKLISTED', retryable: false },       // Message blocked
  21614: { code: 'NOT_SMS_CAPABLE', retryable: false },   // Not an SMS number
  30003: { code: 'UNREACHABLE', retryable: true },
  30005: { code: 'UNKNOWN_DEST', retryable: false },
  30006: { code: 'LANDLINE', retryable: false },
  30007: { code: 'CARRIER_VIOLATION', retryable: false },
  30008: { code: 'UNKNOWN', retryable: true },
};

const STATUS_MAP: Record<string, DeliveryStatusType> = {
  queued: 'queued',
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
  undelivered: 'failed',
  canceled: 'failed',
};

// ─── Adapter ─────────────────────────────────────────────────────────────────

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;             // E.164 default from number
  statusCallbackBaseUrl?: string; // our API base URL
  messagingServiceSid?: string;   // optional — for Copilot / pool
}

export class TwilioSmsAdapter extends BaseChannelAdapter {
  readonly channel: Channel = 'sms';
  readonly provider = 'twilio';

  private readonly baseUrl: string;
  private readonly basicAuth: string;

  constructor(private readonly cfg: TwilioConfig) {
    super();
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}`;
    this.basicAuth = `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64')}`;
  }

  // ── send ──────────────────────────────────────────────────────────────────

  async send(message: UnifiedMessage, recipient: Recipient): Promise<DeliveryResult> {
    if (message.content.kind !== 'sms') {
      throw this.wrapError({ code: 'WRONG_CONTENT', message: 'Expected sms content', retryable: false });
    }

    const { body, senderId } = message.content;
    const from = senderId ?? this.cfg.fromNumber;

    const params = new URLSearchParams({
      To: recipient.phone ?? '',
      From: from,
      Body: body,
    } as Record<string, string>);

    if (this.cfg.statusCallbackBaseUrl) {
      params.set('StatusCallback', `${this.cfg.statusCallbackBaseUrl}/api/v1/sms/webhooks/twilio/status`);
    }
    if (this.cfg.messagingServiceSid) {
      params.set('MessagingServiceSid', this.cfg.messagingServiceSid);
    }

    let resp: TwilioMessageResponse;

    try {
      const httpResp = await fetch(`${this.baseUrl}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: this.basicAuth,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: AbortSignal.timeout(30_000),
      });

      const json = (await httpResp.json()) as TwilioMessageResponse & { code?: number; message?: string };

      if (!httpResp.ok) {
        const errorCode = json.code ?? json.error_code;
        const mapped = typeof errorCode === 'number'
          ? (ERROR_CODE_MAP[errorCode] ?? { code: 'PROVIDER_ERROR', retryable: false })
          : { code: 'HTTP_ERROR', retryable: httpResp.status >= 500 };

        throw this.wrapError({
          code: mapped.code,
          message: json.message ?? json.error_message ?? `Twilio HTTP ${httpResp.status}`,
          retryable: mapped.retryable,
          providerError: json,
        });
      }

      resp = json;
    } catch (err) {
      if ((err as Error).name === 'ChannelAdapterError') throw err;
      throw this.wrapError({ code: 'NETWORK_ERROR', message: (err as Error).message, retryable: true });
    }

    const cost = resp.price ? Math.abs(parseFloat(resp.price)) : undefined;
    const status = STATUS_MAP[resp.status] ?? 'sent';

    return {
      messageId: resp.sid,
      status,
      provider: this.provider,
      recipientId: recipient.contactId,
      cost,
    };
  }

  // ── getStatus ─────────────────────────────────────────────────────────────

  async getStatus(messageId: string): Promise<DeliveryStatus> {
    try {
      const httpResp = await fetch(`${this.baseUrl}/Messages/${messageId}.json`, {
        headers: { Authorization: this.basicAuth },
        signal: AbortSignal.timeout(15_000),
      });

      if (!httpResp.ok) {
        throw this.wrapError({
          code: 'STATUS_FETCH_FAILED',
          message: `Twilio HTTP ${httpResp.status}`,
          retryable: httpResp.status >= 500,
        });
      }

      const data = (await httpResp.json()) as TwilioMessageResponse;

      return {
        messageId,
        status: STATUS_MAP[data.status] ?? 'sent',
        updatedAt: new Date(),
        metadata: { errorCode: data.error_code, errorMessage: data.error_message },
      };
    } catch (err) {
      if ((err as Error).name === 'ChannelAdapterError') throw err;
      throw this.wrapError({ code: 'NETWORK_ERROR', message: (err as Error).message, retryable: true });
    }
  }

  // ── estimateCost ──────────────────────────────────────────────────────────

  async estimateCost(message: UnifiedMessage, recipients: Recipient[]): Promise<CostEstimate> {
    if (message.content.kind !== 'sms') {
      return { totalCost: 0, currency: 'USD', perRecipientCost: 0, recipientCount: recipients.length };
    }

    const parts = this.segmentCount(message.content.body);
    const perSms = 0.0075 * parts; // ~$0.0075 per segment (US avg)

    return {
      totalCost: perSms * recipients.length,
      currency: 'USD',
      perRecipientCost: perSms,
      recipientCount: recipients.length,
      breakdown: { segments: parts },
    };
  }

  // ── handleInbound ─────────────────────────────────────────────────────────
  // Handles both inbound messages and status callbacks

  async handleInbound(payload: unknown): Promise<InboundMessage> {
    const p = payload as TwilioInboundPayload & TwilioStatusCallbackPayload;

    // Status callback
    if (p.MessageStatus) {
      return {
        channel: 'sms',
        from: p.From ?? '',
        to: p.To,
        content: p.MessageStatus,
        receivedAt: new Date(),
        providerMessageId: p.MessageSid,
        metadata: { type: 'status_callback', status: p.MessageStatus, errorCode: p.ErrorCode, raw: payload },
      };
    }

    // Inbound message
    return {
      channel: 'sms',
      from: p.From ?? '',
      to: p.To,
      content: p.Body ?? '',
      receivedAt: new Date(),
      providerMessageId: p.MessageSid,
      metadata: { type: 'inbound', numMedia: p.NumMedia, raw: payload },
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
      if (this.segmentCount(body) > 3) {
        warnings.push({ field: 'body', message: 'Message spans more than 3 SMS segments; cost will multiply' });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ── getChannelLimits ──────────────────────────────────────────────────────

  getChannelLimits(): RateLimits {
    return {
      maxPerSecond: 100,       // Twilio A2P 10DLC
      maxPerMinute: 3_000,
      maxPerHour: 100_000,
      maxPerDay: 2_000_000,
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private needsUnicode(text: string): boolean {
    // eslint-disable-next-line no-control-regex
    return /[^\x00-\x7F£¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1BÆæßÉ !\"#$%&'()*+,\-./:;<=>?¡ÄÖÑÜà§¿äöñüà]/.test(text);
  }

  private segmentCount(text: string): number {
    const isUnicode = this.needsUnicode(text);
    const singleLimit = isUnicode ? 70 : 160;
    const multiLimit = isUnicode ? 67 : 153;
    if (text.length <= singleLimit) return 1;
    return Math.ceil(text.length / multiLimit);
  }
}
