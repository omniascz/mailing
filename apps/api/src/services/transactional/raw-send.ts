/**
 * Raw-message send — shared by the public /transactional/email/raw route and
 * the SMTP submission relay (both hand us a raw RFC5322 message + an orgId).
 */

import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/index.js';
import { sendTransactionalEmail } from '../../lib/queues.js';
import { checkSendCapacity } from '../billing/plan-enforcement.js';
import { AppError } from '../../lib/app-error.js';
import { parseRawMime } from './mime-parse.js';

export interface SendRawOptions {
  from?: string;
  to?: string[];
  testMode?: boolean;
  metadata?: Record<string, unknown>;
  /** Envelope MAIL FROM / RCPT TO from the SMTP relay (override header parse). */
  envelopeFrom?: string;
  envelopeTo?: string[];
}

export interface SendRawResult {
  status: 'queued';
  messages: Array<{ to: string; messageId: string }>;
}

/**
 * Parse a raw MIME message and send it to each recipient through the MTA
 * pipeline. Recipients come from (in order) opts.to, the SMTP envelope RCPT TO,
 * or the parsed To+Cc headers.
 */
export async function sendRawMessage(
  orgId: string,
  rawStr: string,
  opts: SendRawOptions = {},
): Promise<SendRawResult> {
  const parsed = parseRawMime(rawStr);

  const from = opts.from ?? opts.envelopeFrom ?? parsed.from;
  const recipients = opts.to ?? opts.envelopeTo ?? [...parsed.to, ...parsed.cc];

  if (!from) throw AppError.badRequest('No From address in message');
  if (recipients.length === 0) throw AppError.badRequest('No recipients in message');
  if (!parsed.html && !parsed.text) throw AppError.badRequest('Message has no text/html body');

  if (!opts.testMode) await checkSendCapacity(orgId, recipients.length);

  const messages: Array<{ to: string; messageId: string }> = [];
  for (const to of recipients) {
    const messageId = await sendTransactionalEmail({
      to,
      from,
      fromName: parsed.fromName ?? undefined,
      subject: parsed.subject ?? '(no subject)',
      html: parsed.html ?? `<pre>${(parsed.text ?? '').replace(/[<>&]/g, '')}</pre>`,
      text: parsed.text ?? undefined,
      replyTo: parsed.replyTo ?? undefined,
      orgId,
      customHeaders: parsed.headers,
      testMode: opts.testMode,
    });
    await db.insert(emailEvents).values({
      orgId,
      eventType: 'send',
      messageId,
      metadata: { to, transactional: true, raw: true, ...opts.metadata },
    });
    messages.push({ to, messageId });
  }

  // Per-email usage metering (PAYG).
  if (!opts.testMode && messages.length > 0) {
    const { recordUsage } = await import('../billing/meters.js');
    recordUsage(orgId, 'email', messages.length).catch(() => {});
  }

  return { status: 'queued', messages };
}
