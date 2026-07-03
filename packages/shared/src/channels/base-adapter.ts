import type {
  Channel,
  IChannelAdapter,
  UnifiedMessage,
  Recipient,
  DeliveryResult,
  DeliveryStatus,
  BulkDeliveryResult,
  CostEstimate,
  InboundMessage,
  ChannelTemplate,
  ValidationResult,
  RateLimits,
} from '../types/channels.js';
import { ChannelAdapterError } from '../types/channels.js';

/**
 * Abstract base class that provides default implementations of cross-cutting
 * concerns (bulk send, error wrapping). Adapters extend this and implement
 * the protocol-specific bits.
 */
export abstract class BaseChannelAdapter implements IChannelAdapter {
  abstract readonly channel: Channel;
  abstract readonly provider: string;

  abstract send(message: UnifiedMessage, recipient: Recipient): Promise<DeliveryResult>;
  abstract getStatus(messageId: string): Promise<DeliveryStatus>;
  abstract estimateCost(message: UnifiedMessage, recipients: Recipient[]): Promise<CostEstimate>;
  abstract handleInbound(payload: unknown): Promise<InboundMessage>;
  abstract validateTemplate(template: ChannelTemplate): Promise<ValidationResult>;
  abstract getChannelLimits(): RateLimits;

  /**
   * Default bulk implementation: sequential send. Adapters that have a true
   * bulk API (e.g., Twilio Messaging Service) should override this.
   */
  async sendBulk(message: UnifiedMessage, recipients: Recipient[]): Promise<BulkDeliveryResult> {
    const successful: DeliveryResult[] = [];
    const failed: DeliveryResult[] = [];
    let totalCost = 0;

    for (const recipient of recipients) {
      try {
        const result = await this.send(message, recipient);
        successful.push(result);
        totalCost += result.cost ?? 0;
      } catch (err) {
        const adapterErr = err instanceof ChannelAdapterError ? err : null;
        failed.push({
          messageId: '',
          status: 'failed',
          provider: this.provider,
          recipientId: recipient.contactId ?? '',
          errorCode: adapterErr?.code ?? 'UNKNOWN',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { successful, failed, totalCost };
  }

  /** Helper for adapters to wrap provider errors uniformly. */
  protected wrapError(opts: {
    code: string;
    message: string;
    retryable: boolean;
    providerError?: unknown;
  }): ChannelAdapterError {
    return new ChannelAdapterError({
      channel: this.channel,
      provider: this.provider,
      code: opts.code,
      message: opts.message,
      retryable: opts.retryable,
      providerError: opts.providerError,
    });
  }
}
