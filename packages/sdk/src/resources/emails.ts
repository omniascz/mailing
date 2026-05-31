/**
 * Emails resource — Resend-compatible transactional surface.
 *
 * Mirrors the Resend SDK shape so existing Resend code drops in with
 * just a base URL change. Keys are snake_case to match the wire
 * protocol (and Resend's JS SDK conventions).
 */

import type { ForgemsgClient } from '../client.js';

export type EmailRecipient = string | string[];

export interface EmailTag {
  name: string;
  value: string;
}

export interface EmailAttachment {
  filename: string;
  /** Base64-encoded content. */
  content: string;
  content_type?: string;
  content_id?: string;
}

export interface SendEmailParams {
  from: string;
  to: EmailRecipient;
  subject: string;
  html?: string;
  text?: string;
  cc?: EmailRecipient;
  bcc?: EmailRecipient;
  reply_to?: EmailRecipient;
  headers?: Record<string, string>;
  tags?: EmailTag[];
  attachments?: EmailAttachment[];
  /** ISO 8601 timestamp. */
  scheduled_at?: string;
}

export interface SendEmailResult {
  id: string;
  from: string;
  to: string[];
  subject: string;
  created_at: string;
}

export interface BatchSendResult {
  data: SendEmailResult[];
}

export interface EmailDetail extends SendEmailResult {
  cc: string[];
  bcc: string[];
  reply_to: string[];
  tags: EmailTag[];
  last_event: string;
  last_event_at: string;
}

export interface SendOptions {
  /**
   * Optional Idempotency-Key header. Two requests with the same key
   * from the same API key return the same response for 24 hours, so
   * retries are safe.
   */
  idempotencyKey?: string;
}

export class EmailsResource {
  constructor(private readonly client: ForgemsgClient) {}

  /**
   * Send a single transactional email.
   *
   * @example
   * ```ts
   * const { id } = await mailforge.emails.send({
   *   from: 'orders@example.com',
   *   to: 'jane@example.com',
   *   subject: 'Your receipt',
   *   html: '<p>Thanks for your order.</p>',
   * });
   * ```
   */
  send(params: SendEmailParams, opts: SendOptions = {}): Promise<SendEmailResult> {
    return this.client.postWithHeaders<SendEmailResult>(
      '/api/v1/emails',
      params,
      idempotencyHeader(opts),
    );
  }

  /**
   * Send up to 100 emails in a single request. Each item has the same
   * shape as the single-send body.
   */
  batch(params: SendEmailParams[], opts: SendOptions = {}): Promise<BatchSendResult> {
    if (params.length === 0) {
      return Promise.resolve({ data: [] });
    }
    if (params.length > 100) {
      throw new Error('Batch send supports at most 100 messages per request');
    }
    return this.client.postWithHeaders<BatchSendResult>(
      '/api/v1/emails/batch',
      params,
      idempotencyHeader(opts),
    );
  }

  /** Retrieve a previously sent email by its id. */
  get(id: string): Promise<EmailDetail> {
    return this.client.get<EmailDetail>(`/api/v1/emails/${encodeURIComponent(id)}`);
  }

  /** List recent emails — paginated. */
  list(opts: { limit?: number } = {}): Promise<{ data: SendEmailResult[] }> {
    const qs = opts.limit ? `?limit=${opts.limit}` : '';
    return this.client.get<{ data: SendEmailResult[] }>(`/api/v1/emails${qs}`);
  }
}

function idempotencyHeader(opts: SendOptions): Record<string, string> {
  if (!opts.idempotencyKey) return {};
  return { 'Idempotency-Key': opts.idempotencyKey };
}
