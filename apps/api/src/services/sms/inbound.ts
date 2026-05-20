/**
 * Two-way SMS inbound handling (task 7.4).
 *
 * Processes inbound SMS messages from provider webhooks:
 *   1. Persist to sms_inbound table
 *   2. Match to a contact by phone number
 *   3. Detect keyword and take action:
 *      - STOP / UNSUBSCRIBE / QUIT / CANCEL / END / OPTOUT → opt-out
 *      - START / YES / UNSTOP                               → opt-in
 *      - HELP / INFO                                        → auto-reply
 *      - Custom keyword                                     → trigger workflow
 *      - Everything else                                    → trigger workflow event
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { smsInbound } from '../../db/schema/sms.js';
import { contacts } from '../../db/schema/contacts.js';
import { revokeConsent, recordConsent } from './compliance.js';
import { onApiEvent } from '../workflows/triggers.js';
import type { InboundMessage } from '@forgemsg/shared';

// ─── Keyword groups ───────────────────────────────────────────────────────────

const STOP_KEYWORDS = new Set([
  'STOP',
  'UNSUBSCRIBE',
  'QUIT',
  'CANCEL',
  'END',
  'OPTOUT',
  'OPT-OUT',
  'OPT OUT',
]);
const START_KEYWORDS = new Set(['START', 'YES', 'UNSTOP', 'OPTIN', 'OPT-IN', 'OPT IN']);
const HELP_KEYWORDS = new Set(['HELP', 'INFO']);

const HELP_REPLY = 'For help visit our website or reply STOP to unsubscribe.';

// ─── Process inbound message ──────────────────────────────────────────────────

export interface InboundProcessResult {
  action: 'stop' | 'start' | 'help' | 'workflow' | 'unknown';
  contactId?: string;
  autoReply?: string;
}

export async function processInboundSms(
  orgId: string,
  provider: string,
  inbound: InboundMessage,
): Promise<InboundProcessResult> {
  const fromPhone = inbound.from;
  const body = (inbound.content ?? '').trim();
  const keyword = body.toUpperCase().trim();

  // Resolve contact by phone number
  const contact = await resolveContactByPhone(orgId, fromPhone);
  const contactId = contact?.id;

  // Detect keyword action
  let action: InboundProcessResult['action'] = 'unknown';
  let autoReply: string | undefined;

  if (STOP_KEYWORDS.has(keyword)) {
    action = 'stop';
    await revokeConsent(orgId, fromPhone, keyword);
    autoReply = 'You have been unsubscribed. Reply START to re-subscribe.';
  } else if (START_KEYWORDS.has(keyword)) {
    action = 'start';
    await recordConsent(orgId, fromPhone, {
      contactId,
      consentSource: 'sms_keyword',
      consentContext: `keyword=${keyword}`,
    });
    autoReply = 'You have been subscribed.';
  } else if (HELP_KEYWORDS.has(keyword)) {
    action = 'help';
    autoReply = HELP_REPLY;
  } else {
    // Non-keyword: trigger workflow event
    action = 'workflow';
    if (contactId) {
      await onApiEvent(orgId, contactId, 'sms_reply', {
        phone: fromPhone,
        body,
        provider,
        providerMessageId: inbound.providerMessageId,
      });
    }
  }

  // Persist to sms_inbound
  await db.insert(smsInbound).values({
    orgId,
    provider,
    providerMessageId: inbound.providerMessageId,
    fromPhone,
    toPhone: inbound.to ?? '',
    body,
    contactId,
    keywordAction: action,
    workflowTriggered: action === 'workflow',
    receivedAt: inbound.receivedAt,
  });

  return { action, contactId, autoReply };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function resolveContactByPhone(orgId: string, phone: string) {
  // Try exact E.164 match first, then strip/re-add +
  const normalized = phone.startsWith('+') ? phone : `+${phone}`;

  const [contact] = await db
    .select({ id: contacts.id, phone: contacts.phone })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.phone, normalized)))
    .limit(1);

  return contact ?? null;
}

// ─── List inbound messages ────────────────────────────────────────────────────

export async function listInboundSms(orgId: string, limit = 50, _cursor?: string) {
  const rows = await db
    .select()
    .from(smsInbound)
    .where(eq(smsInbound.orgId, orgId))
    .orderBy(smsInbound.receivedAt)
    .limit(limit);

  return rows;
}
