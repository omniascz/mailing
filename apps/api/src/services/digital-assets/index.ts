/**
 * Digital asset delivery service (#648).
 *
 * - generateDeliveryUrl(): creates a time-limited signed URL for a contact
 * - trackDownload(): increments download counter, blocks if maxDownloads exceeded
 * - generateLicenseKey(): creates a unique product license key (#649)
 */

import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import { digitalAssets, digitalAssetDeliveries, licenseKeys } from '../../db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { presignUrl } from '../../lib/object-store.js';

// ─── Signed URL generation ────────────────────────────────────────────────────

const SIGNING_SECRET = env.ASSET_SIGNING_SECRET;

interface DeliveryToken {
  assetId: string;
  contactId: string | null;
  deliveryId: string;
  exp: number;
}

function signToken(payload: DeliveryToken): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SIGNING_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token: string): DeliveryToken | null {
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', SIGNING_SECRET).update(data).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as DeliveryToken;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface DeliveryUrlResult {
  token: string;
  downloadUrl: string;
  expiresAt: Date;
  licenseKey?: string;
}

/**
 * Generate a signed delivery URL for a contact to download a digital asset.
 * Creates a delivery record and optionally generates a license key.
 */
export async function generateDeliveryUrl(
  orgId: string,
  assetId: string,
  contactId: string | null,
): Promise<DeliveryUrlResult> {
  const [asset] = await db
    .select()
    .from(digitalAssets)
    .where(and(eq(digitalAssets.orgId, orgId), eq(digitalAssets.id, assetId)))
    .limit(1);

  if (!asset) throw Object.assign(new Error('Asset not found'), { statusCode: 404 });
  if (!asset.active) throw Object.assign(new Error('Asset is not active'), { statusCode: 400 });

  const expirySeconds = asset.urlExpirySeconds ?? 3600;
  const expiresAt = new Date(Date.now() + expirySeconds * 1000);
  const exp = Math.floor(expiresAt.getTime() / 1000);

  // Generate license key if required
  let licenseKeyId: string | undefined;
  let licenseKeyValue: string | undefined;
  if (asset.requiresLicenseKey) {
    const lk = await generateLicenseKey(orgId, assetId, contactId);
    licenseKeyId = lk.id;
    licenseKeyValue = lk.key;
  }

  // Create delivery record
  const tokenPayload: Omit<DeliveryToken, 'deliveryId'> = {
    assetId,
    contactId,
    exp,
  };

  // Temp token to hash for storage
  const tempId = crypto.randomBytes(16).toString('hex');
  const finalToken = signToken({ ...tokenPayload, deliveryId: tempId });
  const tokenHash = crypto.createHash('sha256').update(finalToken).digest('hex');

  const [delivery] = await db
    .insert(digitalAssetDeliveries)
    .values({
      orgId,
      assetId,
      contactId,
      tokenHash,
      licenseKeyId: licenseKeyId ?? null,
      expiresAt,
    })
    .returning({ id: digitalAssetDeliveries.id });

  // Re-sign with real deliveryId
  const token = signToken({ assetId, contactId, deliveryId: delivery!.id, exp });

  const baseUrl = process.env.APP_BASE_URL ?? 'https://app.forgemsg.com';
  const downloadUrl = `${baseUrl}/api/v1/assets/download?token=${token}`;

  return { token, downloadUrl, expiresAt, licenseKey: licenseKeyValue };
}

/**
 * Process a download request: validate token, check limits, return asset URL.
 * Returns the final S3/MinIO presigned URL or external URL.
 */
export async function processDownload(
  token: string,
  _ipAddress?: string,
): Promise<{ assetUrl: string; contentType: string | null; filename: string }> {
  const payload = verifyToken(token);
  if (!payload)
    throw Object.assign(new Error('Invalid or expired download token'), { statusCode: 410 });

  const [delivery] = await db
    .select()
    .from(digitalAssetDeliveries)
    .where(eq(digitalAssetDeliveries.id, payload.deliveryId))
    .limit(1);

  if (!delivery) throw Object.assign(new Error('Delivery record not found'), { statusCode: 404 });
  if (delivery.expiresAt < new Date())
    throw Object.assign(new Error('Download link expired'), { statusCode: 410 });

  const [asset] = await db
    .select()
    .from(digitalAssets)
    .where(eq(digitalAssets.id, payload.assetId))
    .limit(1);

  if (!asset) throw Object.assign(new Error('Asset not found'), { statusCode: 404 });

  // Check download limit
  if (asset.maxDownloads && delivery.downloadCount >= asset.maxDownloads) {
    throw Object.assign(new Error('Download limit exceeded'), { statusCode: 403 });
  }

  // Update download counters
  await db
    .update(digitalAssetDeliveries)
    .set({
      downloadCount: delivery.downloadCount + 1,
      lastDownloadAt: new Date(),
      firstDownloadAt: delivery.firstDownloadAt ?? new Date(),
    })
    .where(eq(digitalAssetDeliveries.id, delivery.id));

  // Resolve asset URL
  let assetUrl: string;
  if (asset.externalUrl) {
    assetUrl = asset.externalUrl;
  } else if (asset.storageKey) {
    // Generate presigned MinIO/S3 URL
    assetUrl = await generatePresignedUrl(asset.storageKey, asset.urlExpirySeconds ?? 3600);
  } else {
    throw Object.assign(new Error('Asset has no storage location'), { statusCode: 500 });
  }

  const filename = asset.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return { assetUrl, contentType: asset.contentType, filename };
}

// ─── License key generation (#649) ───────────────────────────────────────────

const KEY_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable chars

/**
 * Generate a unique license key in format: XXXX-XXXX-XXXX-XXXX
 */
export async function generateLicenseKey(
  orgId: string,
  assetId: string,
  contactId: string | null,
  options?: { maxActivations?: number; expiresAt?: Date },
): Promise<typeof licenseKeys.$inferSelect> {
  // Generate key with collision retry
  for (let attempt = 0; attempt < 10; attempt++) {
    const segments = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => KEY_CHARSET[crypto.randomInt(KEY_CHARSET.length)]!).join(''),
    );
    const key = segments.join('-');

    try {
      const [record] = await db
        .insert(licenseKeys)
        .values({
          orgId,
          assetId,
          contactId,
          key,
          maxActivations: options?.maxActivations ?? null,
          expiresAt: options?.expiresAt ?? null,
        })
        .returning();
      return record!;
    } catch (err) {
      // Unique constraint violation → retry
      if (attempt === 9) throw err;
    }
  }
  throw new Error('Failed to generate unique license key after 10 attempts');
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function generatePresignedUrl(storageKey: string, expirySeconds: number): Promise<string> {
  // Was a hand-written SigV4 query-string signer, with a comment explaining it
  // avoided a dependency on @aws-sdk/s3-request-presigner. That dependency is
  // here now, the SDK is what the rest of the codebase signs with, and the
  // repo had three separate attempts at this — one of which, in
  // services/phone/recording.ts, took a secret and did not use it.
  //
  // The datetime it built was also wrong: `.slice(0, 15) + 'Z'` on an ISO
  // string yields `20260824T131500` plus a Z, dropping the seconds digit, so
  // the X-Amz-Date never matched the scope the signature was computed over.
  const bucket = process.env.ASSET_STORAGE_BUCKET ?? 'forgemsg-assets';
  return presignUrl('get', bucket, storageKey, expirySeconds);
}
