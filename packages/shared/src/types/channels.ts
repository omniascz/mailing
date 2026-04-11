// Channel adapter interface — unified omnichannel messaging

export type Channel = 'email' | 'sms' | 'whatsapp' | 'push' | 'voice' | 'in_app';

export type DeliveryStatusType =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'bounced';

export interface EmailContent {
  subject: string;
  preheader?: string;
  html: string;
  text?: string;
}

export interface SmsContent {
  body: string;
  senderId?: string;
}

export interface WhatsAppContent {
  templateId: string;
  parameters: Record<string, string>;
}

export interface PushContent {
  title: string;
  body: string;
  icon?: string;
  image?: string;
  url?: string;
  actions?: { title: string; url: string }[];
}

export interface VoiceContent {
  scenarioId: string;
  variables: Record<string, string>;
}

export type MessageContent =
  | EmailContent
  | SmsContent
  | WhatsAppContent
  | PushContent
  | VoiceContent;

export interface UnifiedMessage {
  channel: Channel;
  content: MessageContent;
  metadata?: Record<string, unknown>;
}

export interface Recipient {
  contactId: string;
  email?: string;
  phone?: string;
  pushToken?: string;
}

export interface DeliveryResult {
  messageId: string;
  status: DeliveryStatusType;
  cost?: number;
  provider: string;
}

export interface DeliveryStatus {
  messageId: string;
  status: DeliveryStatusType;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface CostEstimate {
  totalCost: number;
  currency: string;
  perRecipientCost: number;
  recipientCount: number;
}

export interface InboundMessage {
  channel: Channel;
  from: string;
  content: string;
  receivedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface RateLimits {
  maxPerSecond: number;
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
}

export interface ChannelTemplate {
  id: string;
  channel: Channel;
  content: Record<string, unknown>;
}

export interface IChannelAdapter {
  readonly channel: Channel;
  send(message: UnifiedMessage, recipient: Recipient): Promise<DeliveryResult>;
  getStatus(messageId: string): Promise<DeliveryStatus>;
  estimateCost(message: UnifiedMessage, recipients: Recipient[]): Promise<CostEstimate>;
  handleInbound(payload: unknown): Promise<InboundMessage>;
  validateTemplate(template: ChannelTemplate): Promise<ValidationResult>;
  getChannelLimits(): RateLimits;
}
