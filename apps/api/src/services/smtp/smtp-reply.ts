/**
 * What the SMTP submission server answers when the API refuses a message.
 *
 * Every refusal used to reach the client as 451 "temporary failure, try again
 * later" — an unverified From and a used-up plan included — so a mail client
 * retried for days something that could not succeed. A permanent refusal is a
 * 5xx now, and only a state that can clear by itself stays 4xx:
 *
 *  - 429 (the send-rate limit)           → 451 4.7.0  temporary, retry shortly;
 *  - any other 4xx from the send path    → 550 5.7.1  permanent: unverified From,
 *    plan used up or organisation suspended, sandbox refusal, paused
 *    configuration set — decided, not flaky. A plan is renewed monthly; mail
 *    clients give up after hours or days, so a 4xx would only fill their queues;
 *  - anything else (database down, queue
 *    unavailable, an unexpected error)   → 451 4.3.0  temporary.
 */
import { AppError } from '../../lib/app-error.js';

export interface SmtpReply {
  code: number;
  enhanced: string;
  text: string;
}

/** One line, printable, short: SMTP reply text cannot carry a line break. */
function oneLine(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[^\x20-\x7e]/g, '?')
    .slice(0, 400);
}

export function smtpReplyFor(err: unknown): SmtpReply {
  if (err instanceof AppError) {
    if (err.statusCode === 429) {
      return { code: 451, enhanced: '4.7.0', text: oneLine(err.message) };
    }
    if (err.statusCode >= 400 && err.statusCode < 500) {
      return { code: 550, enhanced: '5.7.1', text: oneLine(err.message) };
    }
  }
  return { code: 451, enhanced: '4.3.0', text: 'Temporary failure, try again later' };
}

/** The refusal at RCPT TO of an address the account must not mail. */
export function suppressedRecipientReply(address: string, reason: string): SmtpReply {
  return {
    code: 550,
    enhanced: '5.7.1',
    text: oneLine(
      `Recipient <${address}> is on this account's suppression list (${reason}); not sent, not billed`,
    ),
  };
}

/**
 * The port the submission server listens on, from the same SUBMISSION_LISTEN
 * the engine reads (":587", "0.0.0.0:2587"). Empty when it is not set: the
 * server is not running, and no port is advertised.
 */
export function submissionPorts(listen: string | undefined): number[] {
  const m = /:(\d{1,5})$/.exec((listen ?? '').trim());
  if (!m) return [];
  const port = Number(m[1]);
  return port > 0 && port < 65536 ? [port] : [];
}
