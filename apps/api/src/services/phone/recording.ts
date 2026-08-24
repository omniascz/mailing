/**
 * Call recording service (#252).
 *
 * Downloads a recording from the VoIP provider (Twilio / Telnyx),
 * uploads it to S3-compatible storage (MinIO / AWS S3), and returns
 * the permanent storage URL.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { calls } from '../../db/schema/calls.js';
import { AppError } from '../../lib/app-error.js';
import { transcribeCall } from './transcription.js';

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
  const bucket = process.env.MINIO_BUCKET ?? 'forgemsg-recordings';
  const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  const port = process.env.MINIO_PORT ?? '9000';
  const accessKey = process.env.MINIO_ACCESS_KEY ?? 'minioadmin';
  const secretKey = process.env.MINIO_SECRET_KEY ?? 'minioadmin';

  // In production this would use the AWS SDK or @aws-sdk/client-s3.
  // For now, stream via fetch + MinIO presigned PUT.
  const presignedUrl = await getPresignedPutUrl(endpoint, port, bucket, key, accessKey, secretKey);

  const sourceRes = await fetch(sourceUrl);
  if (!sourceRes.ok) throw new Error(`Failed to download recording: ${sourceRes.status}`);
  const buffer = await sourceRes.arrayBuffer();

  const uploadRes = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(buffer.byteLength) },
    body: buffer,
  });

  if (!uploadRes.ok) throw new Error(`S3 upload failed: ${uploadRes.status}`);

  const useSSL = process.env.MINIO_USE_SSL === 'true';
  const scheme = useSSL ? 'https' : 'http';
  return `${scheme}://${endpoint}:${port}/${bucket}/${key}`;
}

async function getPresignedPutUrl(
  endpoint: string,
  port: string,
  bucket: string,
  key: string,
  _accessKey: string,
  _secretKey: string,
): Promise<string> {
  // Simplified presigned URL generation — in production use @aws-sdk/s3-request-presigner
  const host = `${endpoint}:${port}`;
  return `http://${host}/${bucket}/${key}`;
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
