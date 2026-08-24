/**
 * Video message recorder service (#325).
 *
 * Flow:
 *   1. rep calls requestUpload() → returns presigned PUT URL + share token
 *   2. browser uploads blob directly to MinIO/S3
 *   3. rep calls markUploaded() → enqueue transcode job
 *   4. worker transcodes to HLS → callback to markTranscodeResult()
 *   5. rep inserts `{{video:<token>}}` merge tag into outbound email
 *   6. recipient clicks → GET /v/:token serves a landing page with the HLS player
 *   7. player posts play events to POST /v/:token/events
 */

import { randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  videoMessages,
  videoPlayEvents,
  type VideoMessage,
} from '../../db/schema/video-messages.js';
import { AppError } from '../../lib/app-error.js';
import { presignUrl } from '../../lib/object-store.js';

// ─── Config helpers ───────────────────────────────────────────────────────────

const BUCKET = () => process.env.MINIO_VIDEO_BUCKET ?? 'forgemsg-videos';
const ENDPOINT = () => process.env.MINIO_ENDPOINT ?? 'localhost';
const PORT = () => process.env.MINIO_PORT ?? '9000';
const USE_SSL = () => process.env.MINIO_USE_SSL === 'true';

function publicBaseUrl(): string {
  const scheme = USE_SSL() ? 'https' : 'http';
  return `${scheme}://${ENDPOINT()}:${PORT()}/${BUCKET()}`;
}

function genToken(): string {
  return randomBytes(24).toString('base64url');
}

// ─── Request upload ───────────────────────────────────────────────────────────

export interface RequestUploadInput {
  userId: string;
  contactId?: string;
  title?: string;
  mimeType: string;
  sizeBytes: number;
}

export async function requestUpload(orgId: string, input: RequestUploadInput) {
  if (!['video/webm', 'video/mp4', 'video/quicktime'].includes(input.mimeType)) {
    throw AppError.badRequest('Unsupported video type');
  }
  if (input.sizeBytes > 500 * 1024 * 1024) {
    throw AppError.badRequest('Video exceeds 500 MB');
  }

  const shareToken = genToken();
  const ext =
    input.mimeType === 'video/mp4' ? 'mp4' : input.mimeType === 'video/quicktime' ? 'mov' : 'webm';
  const objectKey = `org/${orgId}/video/${shareToken}/original.${ext}`;

  const [row] = await db
    .insert(videoMessages)
    .values({
      orgId,
      userId: input.userId,
      contactId: input.contactId ?? null,
      title: input.title ?? null,
      shareToken,
      originalObjectKey: objectKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      status: 'pending_upload',
    })
    .returning();
  if (!row) throw AppError.internal('Failed to create video record');

  // Signed, and this is the one place a presigned URL is genuinely the right
  // shape: the bytes are in the browser and never pass through this process.
  //
  // It used to be `${publicBaseUrl()}/${objectKey}` — the object's plain
  // address, with `expiresInSeconds: 900` beside it promising an expiry that
  // nothing enforced. Against a real store the browser's PUT drew a 403 and no
  // video was ever uploaded; against a world-writable bucket it would have
  // worked, which is worse.
  //
  // 900 seconds because that is what the response has always advertised and
  // what the client's countdown is built on. It also fits the job: the window
  // covers one upload of at most 500 MB, checked above, which is a few minutes
  // on a poor connection and leaves room for a retry. Longer would leave a
  // write capability lying around for a key the recipient never needs to write
  // twice.
  const uploadUrl = await presignUrl('put', BUCKET(), objectKey, 900, input.mimeType);

  return {
    videoId: row.id,
    shareToken,
    uploadUrl,
    method: 'PUT' as const,
    headers: { 'Content-Type': input.mimeType },
    expiresInSeconds: 900,
  };
}

// ─── Mark uploaded & enqueue transcode ────────────────────────────────────────

export async function markUploaded(orgId: string, videoId: string): Promise<VideoMessage> {
  // Worker polls for status = 'uploaded' and transcodes, then calls back to markTranscodeResult.
  const [row] = await db
    .update(videoMessages)
    .set({ status: 'uploaded', updatedAt: new Date() })
    .where(and(eq(videoMessages.orgId, orgId), eq(videoMessages.id, videoId)))
    .returning();
  if (!row) throw AppError.notFound('Video not found');
  return row;
}

// ─── Transcode callback (worker → API) ────────────────────────────────────────

export async function markTranscodeResult(
  orgId: string,
  videoId: string,
  result: {
    success: boolean;
    hlsManifestKey?: string;
    thumbnailKey?: string;
    durationSeconds?: number;
    error?: string;
  },
) {
  const update: Partial<VideoMessage> = result.success
    ? {
        status: 'ready',
        hlsManifestKey: result.hlsManifestKey ?? null,
        thumbnailKey: result.thumbnailKey ?? null,
        durationSeconds: result.durationSeconds ?? null,
        updatedAt: new Date(),
      }
    : {
        status: 'failed',
        transcodeError: result.error ?? 'Unknown transcode error',
        updatedAt: new Date(),
      };

  await db
    .update(videoMessages)
    .set(update)
    .where(and(eq(videoMessages.orgId, orgId), eq(videoMessages.id, videoId)));
}

// ─── Public fetch by token ────────────────────────────────────────────────────

export async function getVideoByToken(token: string) {
  const [row] = await db
    .select()
    .from(videoMessages)
    .where(eq(videoMessages.shareToken, token))
    .limit(1);
  if (!row || row.deletedAt) throw AppError.notFound('Video not found');
  if (row.status !== 'ready') throw AppError.badRequest('Video is still processing');

  return {
    id: row.id,
    title: row.title,
    durationSeconds: row.durationSeconds,
    hlsUrl: row.hlsManifestKey ? `${publicBaseUrl()}/${row.hlsManifestKey}` : null,
    thumbnailUrl: row.thumbnailKey ? `${publicBaseUrl()}/${row.thumbnailKey}` : null,
  };
}

// ─── Play event logging ───────────────────────────────────────────────────────

export async function recordPlayEvent(
  token: string,
  event: {
    eventType: 'play' | 'pause' | 'progress' | 'completed';
    positionSeconds: number;
    ipAddress?: string;
    userAgent?: string;
    referer?: string;
  },
) {
  const [row] = await db
    .select()
    .from(videoMessages)
    .where(eq(videoMessages.shareToken, token))
    .limit(1);
  if (!row) throw AppError.notFound('Video not found');

  await db.insert(videoPlayEvents).values({
    orgId: row.orgId,
    videoId: row.id,
    eventType: event.eventType,
    positionSeconds: event.positionSeconds,
    ipAddress: event.ipAddress ?? null,
    userAgent: event.userAgent ?? null,
    referer: event.referer ?? null,
  });

  const update: Record<string, unknown> = { lastPlayedAt: new Date(), updatedAt: new Date() };
  if (event.eventType === 'play') update.playCount = sql`${videoMessages.playCount} + 1`;
  if (event.eventType === 'completed')
    update.completionCount = sql`${videoMessages.completionCount} + 1`;

  await db.update(videoMessages).set(update).where(eq(videoMessages.id, row.id));

  // Fire workflow trigger so reps can build "video watched" follow-ups
  if (event.eventType === 'completed' && row.contactId) {
    try {
      const { onApiEvent } = await import('../workflows/triggers.js');
      await onApiEvent(row.orgId, row.contactId, 'video_watched', {
        videoId: row.id,
        shareToken: token,
        durationSeconds: row.durationSeconds,
      });
    } catch {
      /* non-fatal */
    }
  }
}

// ─── List videos (rep inbox) ──────────────────────────────────────────────────

export async function listVideos(
  orgId: string,
  userId: string,
  limit = 50,
): Promise<VideoMessage[]> {
  return db
    .select()
    .from(videoMessages)
    .where(
      and(
        eq(videoMessages.orgId, orgId),
        eq(videoMessages.userId, userId),
        sql`${videoMessages.deletedAt} IS NULL`,
      ),
    )
    .limit(limit);
}

export async function softDeleteVideo(orgId: string, videoId: string) {
  await db
    .update(videoMessages)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(videoMessages.orgId, orgId), eq(videoMessages.id, videoId)));
}
