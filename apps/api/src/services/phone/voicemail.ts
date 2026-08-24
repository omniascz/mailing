/**
 * Voicemail service (#254).
 *
 * Handles inbound voicemail:
 *  1. Detect voicemail from Twilio webhook (AnsweredBy = 'machine_start')
 *  2. Store voicemail recording in S3/MinIO
 *  3. Transcribe via Deepgram
 *  4. Notify assigned agent via internal event
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { calls } from '../../db/schema/calls.js';
import { AppError } from '../../lib/app-error.js';

export interface VoicemailResult {
  callId: string;
  voicemailUrl: string;
  transcript: string;
}

// ─── Handle voicemail recording from Twilio webhook ──────────────────────────

export async function handleVoicemail(
  orgId: string,
  callId: string,
  recordingUrl: string,
  recordingSid: string,
): Promise<VoicemailResult> {
  const [call] = await db
    .select()
    .from(calls)
    .where(and(eq(calls.id, callId), eq(calls.orgId, orgId)))
    .limit(1);
  if (!call) throw AppError.notFound('Call');

  // 1. Upload voicemail to S3/MinIO
  const voicemailUrl = await storeVoicemail(orgId, callId, recordingSid, recordingUrl);

  // 2. Transcribe
  const transcript = await transcribeVoicemail(voicemailUrl);

  // 3. Persist
  await db
    .update(calls)
    .set({ voicemailUrl, voicemailTranscript: transcript, updatedAt: new Date() })
    .where(eq(calls.id, callId));

  // 4. Notify agent
  await notifyAgent(orgId, callId, call.agentId, transcript);

  return { callId, voicemailUrl, transcript };
}

async function storeVoicemail(
  orgId: string,
  callId: string,
  recordingSid: string,
  sourceUrl: string,
): Promise<string> {
  const bucket = process.env.MINIO_BUCKET ?? 'forgemsg-recordings';
  const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  const port = process.env.MINIO_PORT ?? '9000';
  const useSSL = process.env.MINIO_USE_SSL === 'true';
  const scheme = useSSL ? 'https' : 'http';

  const key = `voicemails/${orgId}/${callId}/${recordingSid}.mp3`;

  // Fetch from Twilio (requires auth)
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const headers: Record<string, string> = {};
  if (accountSid && authToken) {
    headers['Authorization'] =
      `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
  }

  const sourceRes = await fetch(sourceUrl, { headers });
  if (!sourceRes.ok) throw new Error(`Failed to fetch voicemail: ${sourceRes.status}`);
  const buffer = await sourceRes.arrayBuffer();

  const putUrl = `${scheme}://${endpoint}:${port}/${bucket}/${key}`;
  const uploadRes = await fetch(putUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(buffer.byteLength) },
    body: buffer,
  });
  if (!uploadRes.ok) throw new Error(`Voicemail upload failed: ${uploadRes.status}`);

  return putUrl;
}

async function transcribeVoicemail(audioUrl: string): Promise<string> {
  const dgKey = process.env.DEEPGRAM_API_KEY;
  if (dgKey) {
    try {
      const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
        method: 'POST',
        headers: {
          Authorization: `Token ${dgKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: audioUrl }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
        };
        const t = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
        if (t) return t;
      }
    } catch {
      /* fall through */
    }
  }
  return '[Voicemail transcription unavailable]';
}

async function notifyAgent(
  orgId: string,
  callId: string,
  agentId: string | null,
  transcript: string,
): Promise<void> {
  if (!agentId) return;

  // There is no agent-notification sink in this product.
  //
  // This POSTed to /api/v1/internal/notifications with a comment saying
  // "workers will route to email/push". No such route has ever been
  // registered, no such worker exists, and there is no table behind it —
  // in_app_messages is org-to-visitor marketing, not system-to-user. Because
  // fetch does not reject on 404 the .catch() never ran, so every voicemail
  // reported a delivered notification and delivered nothing.
  //
  // Writing the endpoint would mean inventing the subsystem, which is a
  // feature and not this change. What is fixed here is the pretence: the gap
  // is now visible in the log instead of hidden behind a call that could not
  // fail.
  console.warn(
    `[voicemail] agent notification is not wired — dropping notice for user ${agentId} ` +
      `(org ${orgId}, call ${callId}, ${transcript.length} chars of transcript)`,
  );
}

// ─── TwiML: Voicemail greeting (called when machine/voicemail detected) ───────

export function buildVoicemailTwiml(orgName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">You have reached ${escapeXml(orgName)}. Please leave a message after the tone.</Say>
  <Record maxLength="120" action="/api/v1/phone/voicemail/recorded" transcribe="false" />
</Response>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
