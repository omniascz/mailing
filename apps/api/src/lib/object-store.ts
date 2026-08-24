/**
 * One signed client for the object store.
 *
 * There were four ways to write to it in this repo and three of them were
 * wrong. `@aws-sdk/client-s3` is already a dependency and already used
 * correctly by services/media/storage.ts and routes/v1/analytics.ts; the other
 * writers hand-build a `fetch` PUT with no signature at all, which a real
 * MinIO answers 403 to. One of those — services/phone/recording.ts — even has
 * a function called `getPresignedPutUrl` that takes an access key and a secret
 * and ignores both, returning a plain URL.
 *
 * So this is not a fifth way. It is the SDK, with the endpoint and credentials
 * read in one place, so the next writer has something to reach for other than
 * another hand-rolled request.
 *
 * Note for deployment: docker-compose.prod.yml passes MINIO_ACCESS_KEY and
 * MINIO_SECRET_KEY but not MINIO_ENDPOINT, so the defaults below resolve to
 * `localhost` inside the API container — which is the API, not the store.
 */
import type { S3Client } from '@aws-sdk/client-s3';

export interface ObjectStoreConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function objectStoreConfig(): ObjectStoreConfig {
  const host = process.env.MINIO_ENDPOINT ?? 'localhost';
  const port = process.env.MINIO_PORT ?? '9000';
  const scheme = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
  return {
    endpoint: `${scheme}://${host}:${port}`,
    region: process.env.AWS_REGION ?? 'us-east-1',
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
  };
}

let cached: S3Client | null = null;
let cachedFor = '';

/**
 * The client, built once per distinct configuration.
 *
 * Imported lazily to match the two call sites that already do — the SDK is
 * heavy and most requests never touch object storage. Cached on the resolved
 * config rather than unconditionally, so a test that changes the endpoint gets
 * a client pointing at it.
 */
export async function getObjectStore(): Promise<S3Client> {
  const cfg = objectStoreConfig();
  const fingerprint = `${cfg.endpoint}|${cfg.region}|${cfg.accessKeyId}`;
  if (cached && cachedFor === fingerprint) return cached;

  const { S3Client: Client } = await import('@aws-sdk/client-s3');
  cached = new Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    // MinIO serves bucket-in-path, not bucket-as-subdomain.
    forcePathStyle: true,
  });
  cachedFor = fingerprint;
  return cached;
}

/** Drop the cached client. For tests that repoint the endpoint mid-run. */
export function resetObjectStore(): void {
  cached = null;
  cachedFor = '';
}
