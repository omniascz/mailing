/**
 * Call recording service (#252).
 *
 * Downloads a recording from the VoIP provider (Twilio / Telnyx),
 * uploads it to S3-compatible storage (MinIO / AWS S3), and returns
 * the permanent storage URL.
 */

import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { calls } from '../../db/schema/calls.js';
import { AppError } from '../../lib/app-error.js';
import { transcribeCall } from './transcription.js';
import { putObject, presignUrl } from '../../lib/object-store.js';

export interface RecordingInfo {
  callId: string;
  storageUrl: string;
  durationSeconds: number;
  provider: string;
  providerRecordingSid: string;
}

// ─── Download & store recording ──────────────────────────────────────────────

export async function storeRecording(
  orgId: string,
  callId: string,
  providerRecordingSid: string,
  provider: 'twilio' | 'telnyx' = 'twilio',
): Promise<RecordingInfo> {
  const recordingUrl = await downloadAndUpload(provider, providerRecordingSid, orgId, callId);

  await db.update(calls).set({ recordingUrl, updatedAt: new Date() }).where(eq(calls.id, callId));

  return {
    callId,
    storageUrl: recordingUrl,
    durationSeconds: 0, // updated later from provider webhook
    provider,
    providerRecordingSid,
  };
}

async function downloadAndUpload(
  provider: 'twilio' | 'telnyx',
  recordingSid: string,
  orgId: string,
  callId: string,
): Promise<string> {
  // 1. Get recording download URL from provider
  const downloadUrl = await getProviderRecordingUrl(provider, recordingSid);

  // 2. Stream to S3/MinIO
  const s3Key = `recordings/${orgId}/${callId}/${recordingSid}.mp3`;
  const storageUrl = await uploadToS3(downloadUrl, s3Key);
  return storageUrl;
}

async function getProviderRecordingUrl(
  provider: 'twilio' | 'telnyx',
  sid: string,
): Promise<string> {
  if (provider === 'twilio') {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) throw AppError.badRequest('Twilio credentials not configured');
    return `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${sid}.mp3`;
  }
  if (provider === 'telnyx') {
    return `https://api.telnyx.com/v2/recordings/${sid}/download`;
  }
  throw AppError.badRequest(`Unknown provider: ${provider}`);
}

async function uploadToS3(sourceUrl: string, key: string): Promise<string> {
  const bucket = env.MINIO_BUCKET;

  const sourceRes = await fetch(sourceUrl);
  if (!sourceRes.ok) throw new Error(`Failed to download recording: ${sourceRes.status}`);
  const buffer = Buffer.from(await sourceRes.arrayBuffer());

  // Straight through the shared client.
  //
  // This used to call a local getPresignedPutUrl(endpoint, port, bucket, key,
  // accessKey, secretKey) which ignored the last two arguments and returned a
  // plain URL — a function named "presign" that did not sign. Against a real
  // store the PUT drew a 403, and the status check turned that into a loud
  // failure, so no recording was ever stored.
  //
  // It is not implemented properly, it is removed. A presigned PUT exists to
  // hand an upload to somebody else; here the bytes are already in this
  // process, downloaded from the provider two lines up. There was nobody to
  // hand it to.
  await putObject(bucket, key, buffer, 'audio/mpeg');

  // Presigned GET: the only reader is transcribeCall, which passes it to a
  // transcription provider that fetches it over the internet. Fifteen minutes
  // covers that fetch and nothing beyond it.
  return presignUrl('get', bucket, key, 15 * 60);
}

// ─── Recording status webhook ─────────────────────────────────────────────────

export async function handleRecordingCompleted(
  orgId: string,
  callId: string,
  providerRecordingSid: string,
  _durationSeconds: number,
  provider: 'twilio' | 'telnyx' = 'twilio',
): Promise<void> {
  const info = await storeRecording(orgId, callId, providerRecordingSid, provider);

  // Transcription runs in this process. It used to POST to
  // /api/v1/internal/phone/transcribe, a path that was never registered — and
  // because fetch does not reject on 404, the .catch() never ran and no call
  // was ever transcribed, silently. The function it wanted is right here.
  await transcribeCall(orgId, callId, info.storageUrl);
}
