/**
 * Voice call management (task 8.17).
 *
 * Handles:
 * - Outbound call initiation via Twilio
 * - Concurrent call limiting (max 5)
 * - Call logging and tracking
 * - Recording and transcription storage
 * - Voicemail detection (AMD)
 * - DTMF handling
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { calls } from '../../db/schema/index.js';
import { redis } from '../../lib/redis.js';
import type { NewCall, Call } from '../../db/schema/calls.js';

// ─── Concurrent call management ────────────────────────────────────────────

const ACTIVE_CALLS_KEY = 'voice:active_calls';
const MAX_CONCURRENT_CALLS = 5;

async function getActiveCallCount(): Promise<number> {
  try {
    const count = await redis.llen(ACTIVE_CALLS_KEY);
    return count || 0;
  } catch {
    return 0;
  }
}

async function canAcceptCall(): Promise<boolean> {
  const count = await getActiveCallCount();
  return count < MAX_CONCURRENT_CALLS;
}

async function addActiveCall(callId: string): Promise<void> {
  try {
    await redis.rpush(ACTIVE_CALLS_KEY, callId);
    // Set expiry on entire list
    await redis.expire(ACTIVE_CALLS_KEY, 3600);
  } catch {
    // Non-critical
  }
}

async function removeActiveCall(callId: string): Promise<void> {
  try {
    await redis.lrem(ACTIVE_CALLS_KEY, 1, callId);
  } catch {
    // Non-critical
  }
}

// ─── Call creation and logging ─────────────────────────────────────────────

export interface CreateCallParams {
  orgId: string;
  contactId: string;
  campaignId?: string;
  scenarioId?: string;
  status: 'completed' | 'no_answer' | 'busy' | 'voicemail' | 'failed';
  durationSeconds?: number;
  recordingUrl?: string;
  transcript?: string;
  aiSummary?: string;
  outcome?: Record<string, unknown>;
  cost?: number;
  twilioCallSid?: string;
  twilioRecordingSid?: string;
}

export async function createCall(params: CreateCallParams): Promise<Call> {
  const newCall: NewCall = {
    orgId: params.orgId,
    contactId: params.contactId,
    campaignId: params.campaignId,
    scenarioId: params.scenarioId,
    status: params.status,
    durationSeconds: params.durationSeconds || 0,
    recordingUrl: params.recordingUrl,
    transcript: params.transcript,
    aiSummary: params.aiSummary,
    outcome: params.outcome,
    cost: String(params.cost || 0),
    twilioCallSid: params.twilioCallSid,
    twilioRecordingSid: params.twilioRecordingSid,
  };

  const result = await db.insert(calls).values(newCall).returning();
  return result[0]!;
}

// ─── Call lookup and update ────────────────────────────────────────────────

export async function getCall(callId: string, orgId: string): Promise<Call | null> {
  const result = await db
    .select()
    .from(calls)
    .where(and(eq(calls.id, callId), eq(calls.orgId, orgId)))
    .limit(1);

  return result[0] || null;
}

export async function getCallsByContact(
  contactId: string,
  orgId: string,
  limit = 50,
): Promise<Call[]> {
  return db
    .select()
    .from(calls)
    .where(and(eq(calls.contactId, contactId), eq(calls.orgId, orgId)))
    .orderBy((t) => t.createdAt)
    .limit(limit);
}

export async function getCallsByCampaign(
  campaignId: string,
  orgId: string,
  limit = 100,
): Promise<Call[]> {
  return db
    .select()
    .from(calls)
    .where(and(eq(calls.campaignId, campaignId), eq(calls.orgId, orgId)))
    .orderBy((t) => t.createdAt)
    .limit(limit);
}

export async function updateCall(
  callId: string,
  orgId: string,
  updates: Partial<Omit<NewCall, 'orgId' | 'contactId'>>,
): Promise<Call | null> {
  const result = await db
    .update(calls)
    .set(updates)
    .where(and(eq(calls.id, callId), eq(calls.orgId, orgId)))
    .returning();

  return result[0] || null;
}

// ─── Call status and stats ─────────────────────────────────────────────────

export interface CallStats {
  totalCalls: number;
  completedCalls: number;
  answeredCalls: number;
  noAnswerCalls: number;
  voicemailCalls: number;
  failedCalls: number;
  busyCalls: number;
  avgDurationSeconds: number;
  totalCost: string;
  answerRate: number; // percentage (0-100)
}

export async function getCallStats(campaignId: string, orgId: string): Promise<CallStats> {
  const campaignCalls = await getCallsByCampaign(campaignId, orgId, 10000);

  if (campaignCalls.length === 0) {
    return {
      totalCalls: 0,
      completedCalls: 0,
      answeredCalls: 0,
      noAnswerCalls: 0,
      voicemailCalls: 0,
      failedCalls: 0,
      busyCalls: 0,
      avgDurationSeconds: 0,
      totalCost: '0.00',
      answerRate: 0,
    };
  }

  const stats = campaignCalls.reduce(
    (acc, call) => {
      acc.totalCalls += 1;
      if (call.status === 'completed') acc.completedCalls += 1;
      if (call.status === 'completed' || call.status === 'voicemail') acc.answeredCalls += 1;
      if (call.status === 'no_answer') acc.noAnswerCalls += 1;
      if (call.status === 'voicemail') acc.voicemailCalls += 1;
      if (call.status === 'failed') acc.failedCalls += 1;
      if (call.status === 'busy') acc.busyCalls += 1;
      acc.totalDuration += call.durationSeconds || 0;
      acc.totalCost += parseFloat(String(call.cost || 0));
      return acc;
    },
    {
      totalCalls: 0,
      completedCalls: 0,
      answeredCalls: 0,
      noAnswerCalls: 0,
      voicemailCalls: 0,
      failedCalls: 0,
      busyCalls: 0,
      totalDuration: 0,
      totalCost: 0,
    },
  );

  return {
    totalCalls: stats.totalCalls,
    completedCalls: stats.completedCalls,
    answeredCalls: stats.answeredCalls,
    noAnswerCalls: stats.noAnswerCalls,
    voicemailCalls: stats.voicemailCalls,
    failedCalls: stats.failedCalls,
    busyCalls: stats.busyCalls,
    avgDurationSeconds: Math.round(stats.totalDuration / stats.totalCalls) || 0,
    totalCost: stats.totalCost.toFixed(2),
    answerRate:
      stats.totalCalls > 0 ? Math.round((stats.answeredCalls / stats.totalCalls) * 100) : 0,
  };
}

// ─── Outbound call queueing ────────────────────────────────────────────────

export interface OutboundCallRequest {
  contactId: string;
  phone: string;
  campaignId?: string;
  scenarioId?: string;
  orgId: string;
  context?: Record<string, unknown>; // scenario context (name, date, etc.)
}

/**
 * Queue an outbound call.
 * Returns immediately if queue is full (graceful backoff).
 * Caller must retry if false is returned.
 */
export async function queueOutboundCall(request: OutboundCallRequest): Promise<string | null> {
  // Check if we can accept new calls
  const canAccept = await canAcceptCall();
  if (!canAccept) {
    return null; // Queue is full
  }

  // Create call record in pending state
  const call = await createCall({
    orgId: request.orgId,
    contactId: request.contactId,
    campaignId: request.campaignId,
    scenarioId: request.scenarioId,
    status: 'completed', // Will be overwritten after initiation
  });

  // Track active call
  await addActiveCall(call.id);

  // In production: initiate via Twilio REST API
  // For now: stub implementation (see initiateOutboundCall below)
  try {
    await initiateOutboundCall(call.id, request);
  } catch (err) {
    await removeActiveCall(call.id);
    await updateCall(call.id, request.orgId, { status: 'failed' });
    throw err;
  }

  return call.id;
}

/**
 * Initiate an actual outbound call via Twilio.
 * Stub implementation — in production, integrate with Twilio REST API.
 */
async function initiateOutboundCall(callId: string, request: OutboundCallRequest): Promise<void> {
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    throw new Error('Twilio credentials not configured');
  }

  // Prepare TwiML for the call
  // In production, this would be a webhook URL to your voice pipeline
  const twimlUrl = `${process.env.API_URL}/api/v1/voice/callback?call_id=${callId}&org_id=${request.orgId}`;

  // Call Twilio REST API
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: request.phone,
        From: TWILIO_FROM_NUMBER,
        Url: twimlUrl,
        // AMD (Answering Machine Detection)
        MachineDetection: 'Enable',
        // Recording
        Record: 'true',
        RecordingTrack: 'both',
      }).toString(),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twilio API error: ${response.status} ${error}`);
  }

  const data = (await response.json()) as { sid?: string; error_code?: string };
  if (data.sid) {
    // Store Twilio call SID
    await updateCall(callId, request.orgId, { twilioCallSid: data.sid });
  } else if (data.error_code) {
    throw new Error(`Twilio error: ${data.error_code}`);
  }
}

// ─── Call cleanup ─────────────────────────────────────────────────────────

export async function completeCall(
  callId: string,
  orgId: string,
  updates: Partial<CreateCallParams>,
): Promise<Call | null> {
  await removeActiveCall(callId);
  return updateCall(callId, orgId, {
    status: updates.status,
    durationSeconds: updates.durationSeconds,
    recordingUrl: updates.recordingUrl,
    transcript: updates.transcript,
    aiSummary: updates.aiSummary,
    outcome: updates.outcome,
    cost: String(updates.cost || 0),
    twilioRecordingSid: updates.twilioRecordingSid,
  });
}
