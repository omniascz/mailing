/**
 * Native mobile push transport — APNs (HTTP/2 + ES256 JWT) and FCM HTTP v1
 * (service-account OAuth). Turns the pure payloads from mobile-pure.ts into
 * real deliveries. Credentials come from env (like the WhatsApp/Twilio
 * adapters); when unset, callers treat sends as skipped_unconfigured.
 *
 * The JWT signing is exported + pure so it's unit-testable without live push
 * credentials; the HTTP/2 + fetch transport is exercised only against real
 * Apple/Google endpoints.
 */

import crypto from 'node:crypto';
import http2 from 'node:http2';

// ── base64url ──────────────────────────────────────────────────────────────────

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// ── APNs auth token (ES256 JWT) ─────────────────────────────────────────────────

export interface ApnsConfig {
  keyP8: string; // PKCS8 EC private key PEM (.p8 contents)
  keyId: string;
  teamId: string;
  bundleId: string;
  production: boolean;
}

/**
 * Sign an APNs provider JWT (ES256). Header {alg:ES256, kid}, payload
 * {iss:teamId, iat}. `nowSec` is injectable for deterministic tests.
 */
export function signApnsToken(cfg: Pick<ApnsConfig, 'keyP8' | 'keyId' | 'teamId'>, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }));
  const payload = b64url(JSON.stringify({ iss: cfg.teamId, iat: nowSec }));
  const signingInput = `${header}.${payload}`;
  // dsaEncoding 'ieee-p1363' yields the raw R||S JOSE signature ES256 requires
  // (Node's default is DER, which APNs rejects).
  const sig = crypto.sign('sha256', Buffer.from(signingInput), {
    key: cfg.keyP8,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${b64url(sig)}`;
}

/** Read APNs config from env, or null when not fully configured. */
export function getApnsConfig(): ApnsConfig | null {
  const keyP8 = process.env.APNS_KEY_P8;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;
  if (!keyP8 || !keyId || !teamId || !bundleId) return null;
  return {
    keyP8: keyP8.replace(/\\n/g, '\n'),
    keyId,
    teamId,
    bundleId,
    production: process.env.APNS_PRODUCTION === 'true',
  };
}

// Cache the APNs JWT — valid ~1h; Apple wants it refreshed no more than once
// per 20 min. Regenerate every 45 min.
let apnsTokenCache: { token: string; exp: number } | null = null;

function apnsToken(cfg: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000);
  if (apnsTokenCache && apnsTokenCache.exp > now) return apnsTokenCache.token;
  const token = signApnsToken(cfg, now);
  apnsTokenCache = { token, exp: now + 45 * 60 };
  return token;
}

export interface PushDeliveryResult {
  status: 'sent' | 'failed';
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  /** True when the token is permanently invalid and should be deactivated. */
  tokenInvalid?: boolean;
}

/** POST a notification to APNs over HTTP/2. */
export async function sendApns(
  cfg: ApnsConfig,
  token: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<PushDeliveryResult> {
  const host = cfg.production ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
  const body = JSON.stringify(payload);

  return new Promise<PushDeliveryResult>((resolve) => {
    const client = http2.connect(`https://${host}`);
    client.on('error', (err) =>
      resolve({ status: 'failed', errorCode: 'CONNECT', errorMessage: (err as Error).message }),
    );
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${apnsToken(cfg)}`,
      'apns-topic': headers['apns-topic'] ?? cfg.bundleId,
      'apns-push-type': headers['apns-push-type'] ?? 'alert',
      'apns-priority': headers['apns-priority'] ?? '10',
      'content-type': 'application/json',
    });
    let status = 0;
    let data = '';
    let apnsId: string | undefined;
    req.on('response', (h) => {
      status = Number(h[':status'] ?? 0);
      apnsId = h['apns-id'] as string | undefined;
    });
    req.setEncoding('utf8');
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      client.close();
      if (status === 200) {
        resolve({ status: 'sent', providerMessageId: apnsId });
        return;
      }
      let reason = 'UNKNOWN';
      try {
        reason = (JSON.parse(data) as { reason?: string }).reason ?? 'UNKNOWN';
      } catch {
        /* non-JSON error body */
      }
      resolve({
        status: 'failed',
        errorCode: reason,
        errorMessage: `APNs ${status}: ${reason}`,
        tokenInvalid: reason === 'BadDeviceToken' || reason === 'Unregistered',
      });
    });
    req.on('error', (err) =>
      resolve({ status: 'failed', errorCode: 'REQUEST', errorMessage: (err as Error).message }),
    );
    req.write(body);
    req.end();
  });
}

// ── FCM HTTP v1 (service-account OAuth) ──────────────────────────────────────────

export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/** Read FCM service-account config from env (FCM_SERVICE_ACCOUNT JSON), or null. */
export function getFcmConfig(): FcmConfig | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (!sa.project_id || !sa.client_email || !sa.private_key) return null;
    return {
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key.replace(/\\n/g, '\n'),
    };
  } catch {
    return null;
  }
}

/** Sign a Google service-account assertion JWT (RS256) for the token exchange. */
export function signServiceAccountJwt(cfg: FcmConfig, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: cfg.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(signingInput), cfg.privateKey);
  return `${signingInput}.${b64url(sig)}`;
}

let fcmTokenCache: { token: string; exp: number } | null = null;

async function fcmAccessToken(cfg: FcmConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (fcmTokenCache && fcmTokenCache.exp > now) return fcmTokenCache.token;
  const assertion = signServiceAccountJwt(cfg, now);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  if (!res.ok) throw new Error(`FCM token exchange failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  fcmTokenCache = { token: json.access_token, exp: now + (json.expires_in ?? 3600) - 60 };
  return json.access_token;
}

/** POST an FCM v1 message. */
export async function sendFcm(
  cfg: FcmConfig,
  message: Record<string, unknown>,
): Promise<PushDeliveryResult> {
  let accessToken: string;
  try {
    accessToken = await fcmAccessToken(cfg);
  } catch (err) {
    return { status: 'failed', errorCode: 'AUTH', errorMessage: (err as Error).message };
  }
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    },
  );
  if (res.ok) {
    const json = (await res.json().catch(() => ({}))) as { name?: string };
    return { status: 'sent', providerMessageId: json.name };
  }
  const text = await res.text().catch(() => '');
  let code = 'UNKNOWN';
  try {
    code = (JSON.parse(text) as { error?: { status?: string } }).error?.status ?? 'UNKNOWN';
  } catch {
    /* non-JSON */
  }
  return {
    status: 'failed',
    errorCode: code,
    errorMessage: `FCM ${res.status}: ${code}`,
    tokenInvalid: code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT' || code === 'NOT_FOUND',
  };
}

/** Reset cached tokens (test hook). */
export function _resetTokenCaches(): void {
  apnsTokenCache = null;
  fcmTokenCache = null;
}
