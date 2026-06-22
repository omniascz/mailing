/**
 * Minimal AWS Signature V4 + S3 PutObject — no aws-sdk dependency.
 * Used to land JSONL exports in S3 (which also serves as the staging area that
 * Snowflake / Redshift COPY from).
 *
 * getSignatureKey() is unit-tested against AWS's published derivation vector.
 */
import crypto from 'node:crypto';

export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional key prefix, e.g. "forgemsg/exports". */
  prefix?: string;
  /** Optional custom endpoint (MinIO / R2). Default AWS. */
  endpoint?: string;
}

function hmac(key: crypto.BinaryLike | crypto.KeyObject, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** AWS SigV4 signing-key derivation (kDate→kRegion→kService→kSigning). */
export function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

/** Upload a UTF-8 body to S3 with SigV4. Returns the object URL. */
export async function putObjectS3(
  cfg: S3Config,
  key: string,
  body: string,
  contentType = 'application/x-ndjson',
): Promise<string> {
  const service = 's3';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const fullKey = cfg.prefix ? `${cfg.prefix.replace(/\/$/, '')}/${key}` : key;
  const host = cfg.endpoint
    ? cfg.endpoint.replace(/^https?:\/\//, '')
    : `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
  const canonicalUri = `/${fullKey.split('/').map(encodeURIComponent).join('/')}`;
  const payloadHash = sha256hex(body);

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${cfg.region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSignatureKey(cfg.secretAccessKey, dateStamp, cfg.region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}${canonicalUri}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authorization,
    },
    body,
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`S3 PutObject ${res.status}: ${text.slice(0, 300)}`);
  }
  return url;
}
