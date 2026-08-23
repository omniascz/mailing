/**
 * Reading and writing the bytes behind a media asset.
 *
 * Two directions, and they are not symmetrical.
 *
 * WRITING goes to the object store this deployment is configured with —
 * MinIO in dev, S3 in production — through the same ad-hoc client the
 * screenshot route already uses. No new configuration: MINIO_* is already
 * declared and validated in config/env.ts.
 *
 * READING is the interesting half. `media_assets.storage_url` is a plain URL
 * column and the route that writes it accepts any `z.string().url()`, so an
 * asset can point anywhere on the internet — which makes "fetch the source
 * image" a request the customer chooses the destination of. That is the SSRF
 * shape this repository already has a guard for, so the fetch goes through
 * safeFetch.
 *
 * With one deliberate exception. Our own object store is normally on a private
 * address (`http://localhost:9000/...` in dev, a cluster-internal name in
 * production), and safeFetch refuses private addresses — correctly, since that
 * is the whole point. So exactly one host is allowed to resolve privately: the
 * one this process was configured to store things in. It is not customer
 * input, and it is compared host and port, not by substring.
 */

import { safeFetch, isPublicAddress, BlockedUrlError } from '../../lib/safe-fetch.js';
import { AppError } from '../../lib/app-error.js';

/** Bytes we are willing to pull down for a transform. Mirrors MAX_INPUT_BYTES. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const SOURCE_TIMEOUT_MS = 15_000;

export interface StorageEndpoint {
  host: string;
  port: number;
  useSsl: boolean;
  bucket: string;
}

/** The object store this process writes to, from the already-validated env. */
export function storageEndpoint(): StorageEndpoint {
  return {
    host: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSsl: process.env.MINIO_USE_SSL === 'true',
    bucket: process.env.MINIO_BUCKET ?? 'forgemsg',
  };
}

/**
 * Is this URL our own object store?
 *
 * Host AND port, both exact. A substring test would let
 * `localhost.attacker.example` through, and ignoring the port would let any
 * other service on the same host be reached.
 */
export function isOwnStorageUrl(rawUrl: string, endpoint = storageEndpoint()): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  return url.hostname.toLowerCase() === endpoint.host.toLowerCase() && port === endpoint.port;
}

/**
 * The address policy for fetching one source image: the public-only default,
 * widened to any address when — and only when — the URL is our own store.
 */
export function sourceAddressPolicy(rawUrl: string, endpoint = storageEndpoint()) {
  if (isOwnStorageUrl(rawUrl, endpoint)) return () => true;
  return isPublicAddress;
}

/** Download the bytes an asset points at, guarded and capped. */
export async function readAssetBytes(storageUrl: string): Promise<Buffer> {
  let res;
  try {
    res = await safeFetch(storageUrl, {
      maxBytes: MAX_SOURCE_BYTES,
      timeoutMs: SOURCE_TIMEOUT_MS,
      addressPolicy: sourceAddressPolicy(storageUrl),
    });
  } catch (err) {
    if (err instanceof BlockedUrlError) {
      throw AppError.badRequest(`The image could not be fetched: ${err.message}`);
    }
    throw AppError.badRequest(
      `The image could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (res.status < 200 || res.status >= 300) {
    throw AppError.badRequest(`The image could not be fetched (HTTP ${res.status}).`);
  }
  if (res.truncated) {
    throw AppError.badRequest(
      `The image is larger than ${MAX_SOURCE_BYTES / 1024 / 1024} MB and was not read.`,
    );
  }
  if (res.bytes.length === 0) {
    throw AppError.badRequest('The image could not be fetched: the response was empty.');
  }
  return res.bytes;
}

const EXTENSION: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

/** Storage key for a derivative. Org-prefixed so a bucket listing stays sane. */
export function derivativeKey(
  orgId: string,
  assetId: string,
  format: string,
  stamp: number,
): string {
  return `media/${orgId}/${assetId}-${stamp}.${EXTENSION[format] ?? 'bin'}`;
}

/** Upload bytes and return the URL they are readable at. */
export async function putMediaObject(
  key: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const { host, port, useSsl, bucket } = storageEndpoint();
  const scheme = useSsl ? 'https' : 'http';
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    endpoint: `${scheme}://${host}:${port}`,
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    },
    forcePathStyle: true,
  });

  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }),
  );

  return `${scheme}://${host}:${port}/${bucket}/${key}`;
}
