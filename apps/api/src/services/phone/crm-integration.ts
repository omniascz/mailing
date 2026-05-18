/**
 * CRM integration for calls (#253).
 *
 * - logCallActivity: auto-log a CRM note on contact/deal when a call completes
 * - clickToDial: initiate outbound call and link it to CRM records
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { calls } from '../../db/schema/calls.js';
import { contacts } from '../../db/schema/contacts.js';
import { crmNotes } from '../../db/schema/crm-notes.js';
import { AppError } from '../../lib/app-error.js';

export interface CallActivityResult {
  callId: string;
  contactNoteId?: string;
  dealNoteId?: string;
}

// ─── Log call activity on contact/deal ───────────────────────────────────────

export async function logCallActivity(
  orgId: string,
  callId: string,
): Promise<CallActivityResult> {
  const [call] = await db.select().from(calls)
    .where(and(eq(calls.id, callId), eq(calls.orgId, orgId))).limit(1);
  if (!call) throw AppError.notFound('Call');

  const result: CallActivityResult = { callId };
  const body = buildCallNote(call);

  // Log on contact
  const [contactNote] = await db.insert(crmNotes).values({
    orgId,
    contactId: call.contactId,
    dealId: call.dealId ?? null,
    authorUserId: call.agentId ?? null,
    body,
  }).returning();
  result.contactNoteId = contactNote!.id;

  // If deal is linked and distinct from the contact note, add a deal-specific note
  if (call.dealId) {
    result.dealNoteId = contactNote!.id; // already associated via dealId column
  }

  return result;
}

function buildCallNote(call: {
  direction: string;
  durationSeconds: number;
  status: string;
  aiSummary: string | null;
  fromNumber: string | null;
  toNumber: string | null;
}): string {
  const dir = call.direction === 'inbound' ? 'Incoming call' : 'Outgoing call';
  const duration = formatDuration(call.durationSeconds);
  const lines = [`[${dir}] ${duration} — ${call.status}`];
  if (call.fromNumber || call.toNumber) {
    lines.push(`${call.fromNumber ?? '?'} -> ${call.toNumber ?? '?'}`);
  }
  if (call.aiSummary) {
    lines.push('', 'Summary:', call.aiSummary);
  }
  return lines.join('\n');
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

// ─── Click-to-dial ────────────────────────────────────────────────────────────

export interface ClickToDialResult {
  callId: string;
  twilioCallSid: string | null;
  toNumber: string;
}

export async function clickToDial(
  orgId: string,
  agentId: string,
  contactId: string,
  fromNumber: string,
  dealId?: string,
): Promise<ClickToDialResult> {
  const [contact] = await db.select().from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId))).limit(1);
  if (!contact) throw AppError.notFound('Contact');

  const toNumber = contact.phone;
  if (!toNumber) throw AppError.badRequest('Contact has no phone number');

  const [call] = await db.insert(calls).values({
    orgId,
    contactId,
    agentId,
    dealId: dealId ?? null,
    direction: 'outbound',
    fromNumber,
    toNumber,
    status: 'initiated',
  }).returning();

  const callId = call!.id;
  const twilioCallSid = await initiateTwilioCall(fromNumber, toNumber, callId, orgId);

  if (twilioCallSid) {
    await db.update(calls)
      .set({ twilioCallSid, updatedAt: new Date() })
      .where(eq(calls.id, callId));
  }

  return { callId, twilioCallSid, toNumber };
}

async function initiateTwilioCall(
  from: string,
  to: string,
  callId: string,
  orgId: string,
): Promise<string | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const base = process.env.API_URL ?? 'http://localhost:3001';

  if (!accountSid || !authToken) return null;

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: from,
        To: to,
        Url: `${base}/api/v1/phone/twiml/outbound?callId=${callId}&orgId=${orgId}`,
        StatusCallback: `${base}/api/v1/webhooks/twilio/call-status`,
        Record: 'true',
        RecordingStatusCallback: `${base}/api/v1/webhooks/twilio/recording`,
      }),
    },
  ).catch(() => null);

  if (!res?.ok) return null;
  const data = (await res.json()) as { sid?: string };
  return data.sid ?? null;
}
