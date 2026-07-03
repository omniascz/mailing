// Channel adapter interface — unified omnichannel messaging
//
// Every messaging channel (email, SMS, WhatsApp, push, voice, in-app)
// implements IChannelAdapter so the rest of the system can dispatch
// messages without knowing provider details. New channels are added by
// implementing this interface; nothing else needs to change.

export type Channel =
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'push'
  | 'voice'
  | 'in_app'
  | 'viber'
  | 'instagram'
  | 'messenger';

export type DeliveryStatusType = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'bounced';

// ============================================================================
// Per-channel content shapes
// ============================================================================

export interface EmailContent {
  kind: 'email';
  subject: string;
  preheader?: string;
  html: string;
  text?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  content: string; // base64-encoded
  contentId?: string; // for inline images
}

export interface SmsContent {
  kind: 'sms';
  body: string;
  senderId?: string;
}

export interface WhatsAppContent {
  kind: 'whatsapp';
  templateId: string;
  parameters: Record<string, string>;
  language?: string;
}

export interface PushContent {
  kind: 'push';
  title: string;
  body: string;
  icon?: string;
  image?: string;
  url?: string;
  actions?: { title: string; url: string }[];
  badge?: number;
}

export interface VoiceContent {
  kind: 'voice';
  scenarioId: string;
  variables: Record<string, string>;
  voiceId?: string;
  language?: string;
}

export interface InAppContent {
  kind: 'in_app';
  widgetType: 'banner' | 'modal' | 'slideout';
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export interface ViberContent {
  kind: 'viber';
  /** Registered Viber message type: 'text', 'picture', 'video', 'file', 'action' */
  type: 'text' | 'picture' | 'video' | 'file' | 'action';
  body: string;
  /** Sender display name (max 28 chars, registered in Viber Business) */
  sender?: string;
  /** For type=picture / video / file */
  mediaUrl?: string;
  /** Thumbnail for video */
  thumbnailUrl?: string;
  /** For type=action — CTA button */
  actionUrl?: string;
  actionText?: string;
  /** Pre-approved template name (required for business initiated messages) */
  templateName?: string;
  /** TTL in seconds — how long to try delivery before expiry (default 86400) */
  ttl?: number;
}

export type MessageContent =
  | EmailContent
  | SmsContent
  | WhatsAppContent
  | PushContent
  | VoiceContent
  | InAppContent
  | ViberContent;

// ============================================================================
// Unified message envelope
// ============================================================================

export interface UnifiedMessage {
  channel: Channel;
  content: MessageContent;
  campaignId?: string;
  workflowId?: string;
  orgId: string;
  metadata?: Record<string, unknown>;
}

export interface Recipient {
  /** Known contact id. Optional: raw transactional sends (e.g. the unified
   *  messaging endpoint) may target a bare phone/email with no contact row. */
  contactId?: string;
  email?: string;
  phone?: string;
  pushToken?: string;
  firstName?: string;
  lastName?: string;
  customFields?: Record<string, unknown>;
  /** Platform-specific external user identifier (e.g., Instagram IGSID, Messenger PSID). */
  externalId?: string;
}

// ============================================================================
// Delivery results
// ============================================================================

export interface DeliveryResult {
  messageId: string;
  status: DeliveryStatusType;
  cost?: number;
  provider: string;
  recipientId: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface DeliveryStatus {
  messageId: string;
  status: DeliveryStatusType;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface BulkDeliveryResult {
  successful: DeliveryResult[];
  failed: DeliveryResult[];
  totalCost: number;
}

// ============================================================================
// Cost & limits
// ============================================================================

export interface CostEstimate {
  totalCost: number;
  currency: string;
  perRecipientCost: number;
  recipientCount: number;
  breakdown?: Record<string, number>;
}

export interface RateLimits {
  maxPerSecond: number;
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
}

// ============================================================================
// Inbound (replies, webhooks)
// ============================================================================

export interface InboundMessage {
  channel: Channel;
  from: string;
  to?: string;
  content: string;
  receivedAt: Date;
  providerMessageId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Template validation
// ============================================================================

export interface ChannelTemplate {
  id: string;
  channel: Channel;
  content: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: { field: string; message: string }[];
  warnings?: { field: string; message: string }[];
}

// ============================================================================
// Adapter errors
// ============================================================================

export class ChannelAdapterError extends Error {
  readonly channel: Channel;
  readonly provider: string;
  readonly code: string;
  readonly retryable: boolean;
  readonly providerError?: unknown;

  constructor(opts: {
    channel: Channel;
    provider: string;
    code: string;
    message: string;
    retryable: boolean;
    providerError?: unknown;
  }) {
    super(opts.message);
    this.name = 'ChannelAdapterError';
    this.channel = opts.channel;
    this.provider = opts.provider;
    this.code = opts.code;
    this.retryable = opts.retryable;
    this.providerError = opts.providerError;
  }
}

// ============================================================================
// The interface every channel adapter implements
// ============================================================================

export interface IChannelAdapter {
  /** Channel this adapter handles. */
  readonly channel: Channel;

  /** Provider identifier (e.g., "twilio", "bulkgate", "internal-mta"). */
  readonly provider: string;

  /**
   * Send a single message to a single recipient.
   * Throws ChannelAdapterError on failure.
   */
  send(message: UnifiedMessage, recipient: Recipient): Promise<DeliveryResult>;

  /**
   * Send the same message to many recipients in one call.
   * Default implementation in BaseChannelAdapter falls back to sequential send().
   */
  sendBulk(message: UnifiedMessage, recipients: Recipient[]): Promise<BulkDeliveryResult>;

  /** Look up the current delivery status of a previously-sent message. */
  getStatus(messageId: string): Promise<DeliveryStatus>;

  /** Estimate cost for a hypothetical send (used in pre-send UI). */
  estimateCost(message: UnifiedMessage, recipients: Recipient[]): Promise<CostEstimate>;

  /** Handle a webhook payload from the provider (delivery receipts, inbound messages). */
  handleInbound(payload: unknown): Promise<InboundMessage>;

  /** Validate a template before storing or sending. */
  validateTemplate(template: ChannelTemplate): Promise<ValidationResult>;

  /** Per-provider rate limits, used by the queue to throttle sends. */
  getChannelLimits(): RateLimits;
}

// ============================================================================
// Type guards
// ============================================================================

export function isEmailContent(c: MessageContent): c is EmailContent {
  return c.kind === 'email';
}

export function isSmsContent(c: MessageContent): c is SmsContent {
  return c.kind === 'sms';
}

export function isWhatsAppContent(c: MessageContent): c is WhatsAppContent {
  return c.kind === 'whatsapp';
}

export function isPushContent(c: MessageContent): c is PushContent {
  return c.kind === 'push';
}

export function isVoiceContent(c: MessageContent): c is VoiceContent {
  return c.kind === 'voice';
}

export function isInAppContent(c: MessageContent): c is InAppContent {
  return c.kind === 'in_app';
}
