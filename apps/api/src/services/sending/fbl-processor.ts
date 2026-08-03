/**
 * Feedback Loop (FBL) processor.
 *
 * ISPs (Gmail Postmaster, Microsoft SNDS, Yahoo CFL) send ARF
 * (Abuse Reporting Format, RFC 5965) complaint emails to the Return-Path or
 * a dedicated FBL mailbox. This service:
 *
 *   1. Parses incoming ARF messages to extract the original recipient
 *   2. Classifies the complaint type (abuse / fraud / virus / other)
 *   3. Auto-unsubscribes the complaining contact
 *   4. Increments the complaint_count on the contact record
 *   5. Fires an alert if the org's complaint rate exceeds 0.1%
 *
 * ARF message format (simplified):
 *   Content-Type: multipart/report; report-type=feedback-report
 *   Part 1: Human-readable explanation
 *   Part 2: message/feedback-report (ARF headers)
 *   Part 3: message/rfc822 or text/rfc822-headers (original email)
 */

import { db } from '../../db/client.js';
import { contacts, emailEvents, suppressions, organizations } from '../../db/schema/index.js';
import { and, eq, sql } from 'drizzle-orm';
import { redis } from '@forgemsg/shared/redis';

// ─── ARF parsing ──────────────────────────────────────────────────────────────

export type ComplaintType = 'abuse' | 'fraud' | 'virus' | 'other';

export interface ArfReport {
  /** Email address of the complaining user (the original recipient) */
  originalRecipient: string | null;
  /** Reported campaign / message ID */
  originalMessageId: string | null;
  /** Sending domain extracted from the original message */
  reportingMta: string | null;
  /** Complaint type from the Feedback-Type header */
  feedbackType: ComplaintType;
  /** ISO timestamp of when the complaint was generated */
  reportedAt: string;
  /** ISP that sent this FBL report */
  source: string | null;
}

/**
 * Parse a raw ARF email message (as a string) into a structured report.
 *
 * Supports both full ARF multipart format and simplified single-part reports
 * (some smaller ISPs send non-standard formats).
 */
export function parseArfReport(rawEmail: string): ArfReport {
  const lines = rawEmail.split(/\r?\n/);
  const headerMap: Record<string, string> = {};

  // Build a flat map of all headers (from all MIME parts — ARF fields appear in part 2)
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
      const key = line.slice(0, colon).trim().toLowerCase();
      const value = line.slice(colon + 1).trim();
      headerMap[key] = value;
    }
  }

  // Original-Rcpt-To or Original-Recipient (ARF part 2)
  const originalRecipient =
    extractEmail(headerMap['original-rcpt-to'] ?? '') ||
    extractEmail(headerMap['original-recipient'] ?? '') ||
    extractEmail(headerMap['to'] ?? '') ||
    null;

  // Original-Message-ID
  const originalMessageId = headerMap['original-message-id'] || headerMap['message-id'] || null;

  // Reporting-MTA
  const reportingMta = headerMap['reporting-mta']
    ? headerMap['reporting-mta'].replace(/^dns\s*;\s*/i, '')
    : null;

  // Feedback-Type
  const rawType = (headerMap['feedback-type'] ?? 'abuse').toLowerCase();
  const feedbackType: ComplaintType = ['abuse', 'fraud', 'virus'].includes(rawType)
    ? (rawType as ComplaintType)
    : 'other';

  // Source ISP from From / Received headers
  const source = headerMap['from'] ? (headerMap['from'].match(/@([\w.-]+)/)?.[1] ?? null) : null;

  return {
    originalRecipient,
    originalMessageId: originalMessageId?.replace(/[<>]/g, '') ?? null,
    reportingMta,
    feedbackType,
    reportedAt: new Date().toISOString(),
    source,
  };
}

function extractEmail(str: string): string | null {
  const match = str.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

// ─── Complaint processing ─────────────────────────────────────────────────────

export interface FblProcessResult {
  email: string | null;
  action: 'suppressed' | 'already_suppressed' | 'contact_not_found' | 'no_email';
  complaintCount: number;
  alertFired: boolean;
}

/**
 * Process a parsed ARF report:
 *   - Find the contact by email
 *   - Increment their complaint_count
 *   - Auto-suppress (unsubscribe) them
 *   - Log an email_event of type 'complaint'
 *   - Check if org complaint rate exceeds 0.1%
 *
 * @param report     Parsed ARF report
 * @param orgId      Organisation that sent the original email
 * @param campaignId Campaign that triggered the complaint (if known)
 */
export async function processFblComplaint(
  report: ArfReport,
  orgId: string,
  campaignId?: string,
): Promise<FblProcessResult> {
  const email = report.originalRecipient;

  if (!email) {
    return { email: null, action: 'no_email', complaintCount: 0, alertFired: false };
  }

  // Look up the contact
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.email, email)))
    .limit(1);

  if (!contact) {
    // Log to suppression list anyway (email is known-bad for this org)
    await addToSuppression(orgId, email, 'complaint');
    return { email, action: 'contact_not_found', complaintCount: 0, alertFired: false };
  }

  // Check if already suppressed
  const [existingSuppression] = await db
    .select()
    .from(suppressions)
    .where(and(eq(suppressions.orgId, orgId), eq(suppressions.email, email)))
    .limit(1);

  if (!existingSuppression) {
    // First complaint: update status + add to suppression
    await db
      .update(contacts)
      .set({ status: 'complained', updatedAt: new Date() })
      .where(eq(contacts.id, contact.id));
    await addToSuppression(orgId, email, 'complaint');
  }

  // Always increment complaint_count and log the event — even repeat complaints
  // from the same ISP are audit-relevant (signals whether our unsubscribe flow works).
  await db
    .update(contacts)
    .set({
      complaintCount: sql`complaint_count + 1`,
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, contact.id));

  await db.insert(emailEvents).values({
    orgId,
    campaignId: campaignId ?? null,
    contactId: contact.id,
    eventType: 'complaint',
    metadata: {
      feedbackType: report.feedbackType,
      source: report.source,
      messageId: report.originalMessageId,
      alreadySuppressed: Boolean(existingSuppression),
    },
  });

  // Fire the complaint webhook + trigger real-time reputation auto-pause.
  const { emitEmailEvent } = await import('../webhooks/email-events.js');
  emitEmailEvent(orgId, 'complained', {
    contactId: contact.id,
    campaignId: campaignId ?? null,
    email,
    feedbackType: report.feedbackType,
  });
  const { onBounceComplaintSignal } = await import('../abuse-detection/auto-pause.js');
  onBounceComplaintSignal(orgId, 'complaint').catch(() => {});

  const alertFired = await checkComplaintRateAlert(orgId);
  const action = existingSuppression ? 'already_suppressed' : 'suppressed';

  return { email, action, complaintCount: 1, alertFired };
}

async function addToSuppression(
  orgId: string,
  email: string,
  reason: 'complaint' | 'hard_bounce',
): Promise<void> {
  await db.insert(suppressions).values({ orgId, email, reason }).onConflictDoNothing();
}

// ─── Complaint rate alerting ──────────────────────────────────────────────────

const COMPLAINT_RATE_THRESHOLD = 0.001; // 0.1% — industry warning level
const COMPLAINT_RATE_QUARANTINE = 0.003; // 0.3% — Gmail hard cap → auto-pause
const ALERT_COOLDOWN_SECONDS = 3600; // 1 h between alerts

/**
 * Check if the org's complaint rate exceeds 0.1% (industry danger threshold).
 * Uses a sliding 24-hour window stored in Redis.
 *
 * @returns true if an alert was fired
 */
async function checkComplaintRateAlert(orgId: string): Promise<boolean> {
  const cooldownKey = `fbl:alert:cooldown:${orgId}`;
  const onCooldown = await redis.get(cooldownKey);
  if (onCooldown) return false;

  // Count events in last 24h (rough via Redis INCR + TTL pattern)
  const sentKey = `fbl:sent24h:${orgId}`;
  const complaintKey = `fbl:complaints24h:${orgId}`;

  const [sentRaw, complaintsRaw] = await Promise.all([
    redis.get(sentKey),
    redis.incr(complaintKey).then((n) => n),
  ]);

  await redis.expire(complaintKey, 86_400);

  const sent = parseInt(sentRaw ?? '0', 10);
  if (sent < 100) return false; // not enough volume to be meaningful

  const rate = complaintsRaw / sent;
  if (rate > COMPLAINT_RATE_THRESHOLD) {
    await redis.set(cooldownKey, '1', 'EX', ALERT_COOLDOWN_SECONDS);

    console.warn(
      `[FBL ALERT] org=${orgId} complaint_rate=${(rate * 100).toFixed(3)}% (${complaintsRaw}/${sent})`,
    );

    // Auto-quarantine: if rate exceeds Gmail's published 0.3% hard cap,
    // pause all sends by writing a flag into org settings. Platform admin
    // must manually clear it after reviewing and fixing the issue.
    if (rate >= COMPLAINT_RATE_QUARANTINE) {
      await db
        .update(organizations)
        .set({
          settings: sql`settings || jsonb_build_object('suspended', true, 'suspendedReason', 'complaint_rate_exceeded', 'suspendedAt', now()::text)`,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, orgId));
      console.error(
        `[FBL QUARANTINE] org=${orgId} auto-suspended — complaint rate ${(rate * 100).toFixed(3)}% ≥ 0.3%`,
      );
    }

    return true;
  }

  return false;
}

/**
 * Record an email send event for complaint rate tracking.
 * Call this every time an email is successfully handed off to the MTA.
 */
export async function recordSendForFblTracking(orgId: string, count = 1): Promise<void> {
  const key = `fbl:sent24h:${orgId}`;
  await redis.incrby(key, count);
  await redis.expire(key, 86_400);
}
