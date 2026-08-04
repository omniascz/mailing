/**
 * WhatsApp Meta Cloud API adapter (task 7.6).
 *
 * Uses Meta Graph API v21.0:
 *   POST /{phone_number_id}/messages
 *
 * Auth: Bearer token (permanent system user token or page access token)
 *
 * Webhooks:
 *   - Delivery/read receipts: POST /api/v1/sms/webhooks/whatsapp/status
 *   - Inbound messages:       POST /api/v1/sms/webhooks/whatsapp/inbound
 *
 * Template messages require pre-approved WhatsApp Business templates.
 * The `templateId` in WhatsAppContent maps to the template name registered
 * in Meta Business Manager.
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
} from '../index.js';

const API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

// ─── Meta API types ───────────────────────────────────────────────────────────

interface MetaTextMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'text';
  text: { preview_url: boolean; body: string };
}

interface MetaTemplateMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components?: MetaTemplateComponent[];
  };
}

interface MetaTemplateComponent {
  type: 'body' | 'header' | 'button';
  parameters: Array<{ type: 'text'; text: string }>;
}

interface MetaSendResponse {
  messaging_product: 'whatsapp';
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
  error?: MetaError;
}

interface MetaError {
  message: string;
  type: string;
  code: number;
  fbtrace_id?: string;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
}

interface MetaStatusWebhook {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        statuses?: Array<{
          id: string; // message wamid
          status: string; // "sent" | "delivered" | "read" | "failed"
          timestamp: string;
          recipient_id: string;
          errors?: Array<{ code: number; title: string }>;
        }>;
        messages?: Array<{
          id: string;
          from: string; // wa_id (phone without +)
          timestamp: string;
          type: string; // "text" | "image" | "audio" | "interactive" | …
          text?: { body: string };
        }>;
      };
      field: string;
    }>;
  }>;
}

// Meta error code → our code
const META_ERROR_MAP: Record<number, { code: string; retryable: boolean }> = {
  130429: { code: 'RATE_LIMIT', retryable: true },
  131021: { code: 'INVALID_RECIPIENT', retryable: false },
  131030: { code: 'PHONE_NOT_WA_USER', retryable: false },
  131047: { code: 'TEMPLATE_NOT_APPROVED', retryable: false },
  131051: { code: 'TEMPLATE_PAUSED', retryable: false },
  131052: { code: 'TEMPLATE_DISABLED', retryable: false },
  132000: { code: 'TEMPLATE_PARAM_COUNT', retryable: false },
  132001: { code: 'TEMPLATE_PARAM_TYPE', retryable: false },
  133000: { code: 'ACCOUNT_NOT_VERIFIED', retryable: false },
  135000: { code: 'UNKNOWN', retryable: true },
};

// ─── Adapter ─────────────────────────────────────────────────────────────────

export interface MetaWhatsAppConfig {
  /** The WhatsApp Business Account phone number ID */
  phoneNumberId: string;
  /** Permanent system user access token */
  accessToken: string;
  /** Default language for templates */
  defaultLanguage?: string;
}

export class MetaWhatsAppAdapter extends BaseChannelAdapter {
  readonly channel: Channel = 'whatsapp';
  readonly provider = 'meta';

  constructor(private readonly cfg: MetaWhatsAppConfig) {
    super();
  }

  // ── send ──────────────────────────────────────────────────────────────────

  async send(message: UnifiedMessage, recipient: Recipient): Promise<DeliveryResult> {
    if (message.content.kind !== 'whatsapp') {
      throw this.wrapError({
        code: 'WRONG_CONTENT',
        message: 'Expected whatsapp content',
        retryable: false,
      });
    }

    const { templateId, parameters, language } = message.content;
    const to = this.normalizePhone(recipient.phone ?? '');

    // Build template message (WhatsApp requires pre-approved templates for business)
    const components = this.buildComponents(parameters);

    const body: MetaTemplateMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateId,
        language: { code: language ?? this.cfg.defaultLanguage ?? 'en_US' },
        ...(components.length > 0 && { components }),
      },
    };

    return this.postMessage(body, recipient.contactId ?? '');
  }

  /**
   * Send a free-form text message (only allowed within 24-hour customer service window).
   * Use for replies to inbound messages.
   */
  async sendText(to: string, text: string, contactId: string): Promise<DeliveryResult> {
    const body: MetaTextMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.normalizePhone(to),
      type: 'text',
      text: { preview_url: false, body: text },
    };
    return this.postMessage(body, contactId);
  }

  // ── getStatus ─────────────────────────────────────────────────────────────
  // Meta WA does not expose a status poll endpoint; status comes via webhooks only.

  async getStatus(messageId: string): Promise<DeliveryStatus> {
    return {
      messageId,
      status: 'sent',
      updatedAt: new Date(),
      metadata: { note: 'WhatsApp status available via webhook only' },
    };
  }

  // ── estimateCost ──────────────────────────────────────────────────────────

  async estimateCost(_message: UnifiedMessage, recipients: Recipient[]): Promise<CostEstimate> {
    // Meta charges per conversation window (24h), not per message
    // ~$0.005 per marketing template conversation (US)
    const perConversation = 0.005;

    return {
      totalCost: perConversation * recipients.length,
      currency: 'USD',
      perRecipientCost: perConversation,
      recipientCount: recipients.length,
      breakdown: { marketing_conversation: perConversation * recipients.length },
    };
  }

  // ── handleInbound ─────────────────────────────────────────────────────────
  // Parses both status webhooks and inbound message webhooks

  async handleInbound(payload: unknown): Promise<InboundMessage> {
    const wh = payload as MetaStatusWebhook;

    try {
      const change = wh.entry?.[0]?.changes?.[0]?.value;

      // Status update
      const s = change?.statuses?.[0];
      if (s) {
        return {
          channel: 'whatsapp',
          from: s.recipient_id,
          content: s.status,
          receivedAt: new Date(parseInt(s.timestamp, 10) * 1000),
          providerMessageId: s.id,
          metadata: { type: 'status', status: s.status, errors: s.errors, raw: payload },
        };
      }

      // Inbound message
      const m = change?.messages?.[0];
      if (m) {
        return {
          channel: 'whatsapp',
          from: `+${m.from}`,
          content: m.text?.body ?? m.type,
          receivedAt: new Date(parseInt(m.timestamp, 10) * 1000),
          providerMessageId: m.id,
          metadata: { type: 'inbound', msgType: m.type, raw: payload },
        };
      }
    } catch {
      // fall through to generic
    }

    return {
      channel: 'whatsapp',
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

    if (!content.templateId || typeof content.templateId !== 'string') {
      errors.push({
        field: 'templateId',
        message: 'WhatsApp templateId (template name) is required',
      });
    }

    if (!content.parameters || typeof content.parameters !== 'object') {
      errors.push({ field: 'parameters', message: 'parameters object is required' });
    }

    return { valid: errors.length === 0, errors };
  }

  // ── getChannelLimits ──────────────────────────────────────────────────────

  getChannelLimits(): RateLimits {
    return {
      maxPerSecond: 80, // Meta Cloud API tier 2
      maxPerMinute: 1_000,
      maxPerHour: 50_000,
      maxPerDay: 1_000_000,
    };
  }

  // ── private helpers ───────────────────────────────────────────────────────

  private async postMessage(
    body: MetaTemplateMessage | MetaTextMessage,
    contactId: string,
  ): Promise<DeliveryResult> {
    let resp: MetaSendResponse;

    try {
      const httpResp = await fetch(`${BASE_URL}/${this.cfg.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.cfg.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

      resp = (await httpResp.json()) as MetaSendResponse;

      if (!httpResp.ok || resp.error) {
        const err = resp.error;
        const mapped =
          err?.code !== undefined
            ? (META_ERROR_MAP[err.code] ?? { code: 'PROVIDER_ERROR', retryable: false })
            : { code: 'HTTP_ERROR', retryable: httpResp.status >= 500 };

        throw this.wrapError({
          code: mapped.code,
          message: err?.error_user_msg ?? err?.message ?? `Meta API HTTP ${httpResp.status}`,
          retryable: mapped.retryable,
          providerError: err,
        });
      }
    } catch (err) {
      if ((err as Error).name === 'ChannelAdapterError') throw err;
      throw this.wrapError({
        code: 'NETWORK_ERROR',
        message: (err as Error).message,
        retryable: true,
      });
    }

    const messageId = resp.messages?.[0]?.id ?? '';

    return {
      messageId,
      status: 'sent',
      provider: this.provider,
      recipientId: contactId,
    };
  }

  /**
   * Converts parameters Record<string,string> to body components array.
   * Assumes positional body parameters ({{1}}, {{2}}, …) sorted by key.
   */
  private buildComponents(parameters: Record<string, string>): MetaTemplateComponent[] {
    const entries = Object.entries(parameters);
    if (entries.length === 0) return [];

    return [
      {
        type: 'body',
        parameters: entries.map(([, value]) => ({ type: 'text' as const, text: value })),
      },
    ];
  }

  /** Strip leading +; Meta expects digits only */
  private normalizePhone(phone: string): string {
    return phone.replace(/^\+/, '').replace(/\D/g, '');
  }
}

/**
 * Env-configured adapter for background workers (which have no request body to
 * carry per-call credentials). Mirrors createViberAdapter(): reads the platform
 * WhatsApp Business credentials from env. Returns null when unconfigured so the
 * worker can skip cleanly instead of failing.
 */
export function createWhatsAppAdapter(): MetaWhatsAppAdapter | null {
  const phoneNumberId = process.env['WHATSAPP_PHONE_NUMBER_ID'];
  const accessToken = process.env['WHATSAPP_ACCESS_TOKEN'];
  if (!phoneNumberId || !accessToken) return null;
  return new MetaWhatsAppAdapter({
    phoneNumberId,
    accessToken,
    defaultLanguage: process.env['WHATSAPP_DEFAULT_LANGUAGE'] ?? 'en_US',
  });
}
