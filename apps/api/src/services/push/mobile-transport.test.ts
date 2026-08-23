import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  signApnsToken,
  signServiceAccountJwt,
  getApnsConfig,
  getFcmConfig,
} from './mobile-transport.js';

function decodeSeg(seg: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
}

describe('signApnsToken (ES256)', () => {
  // Generate a P-256 key (same curve as an Apple .p8 auth key).
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const keyP8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  it('produces a verifiable ES256 JWT with the right header + claims', () => {
    const token = signApnsToken({ keyP8, keyId: 'ABC123', teamId: 'TEAM99' }, 1_700_000_000);
    const [h, p, s] = token.split('.');
    expect(decodeSeg(h!)).toEqual({ alg: 'ES256', kid: 'ABC123' });
    expect(decodeSeg(p!)).toEqual({ iss: 'TEAM99', iat: 1_700_000_000 });

    // Signature must verify against the public key using the JOSE (ieee-p1363) encoding.
    const sig = Buffer.from(s!.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const ok = crypto.verify(
      'sha256',
      Buffer.from(`${h}.${p}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      sig,
    );
    expect(ok).toBe(true);
  });
});

describe('signServiceAccountJwt (RS256)', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  it('produces a verifiable RS256 assertion with FCM scope + aud', () => {
    const jwt = signServiceAccountJwt(
      { projectId: 'proj', clientEmail: 'svc@proj.iam.gserviceaccount.com', privateKey: pem },
      1_700_000_000,
    );
    const [h, p, s] = jwt.split('.');
    expect(decodeSeg(h!)).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = decodeSeg(p!);
    expect(claims.iss).toBe('svc@proj.iam.gserviceaccount.com');
    expect(claims.aud).toBe('https://oauth2.googleapis.com/token');
    expect(claims.scope).toContain('firebase.messaging');
    expect(claims.exp).toBe(1_700_003_600);

    const sig = Buffer.from(s!.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    expect(crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, sig)).toBe(true);
  });
});

describe('config parsing', () => {
  it('getApnsConfig returns null when env is incomplete', () => {
    // One key, put back by hand — reassigning process.env would swap the object
    // itself for a plain one, for every file this forked worker runs next.
    const saved = process.env.APNS_KEY_P8;
    delete process.env.APNS_KEY_P8;
    expect(getApnsConfig()).toBeNull();
    if (saved === undefined) delete process.env.APNS_KEY_P8;
    else process.env.APNS_KEY_P8 = saved;
  });

  it('getFcmConfig parses a service-account JSON and null on bad JSON', () => {
    const saved = process.env.FCM_SERVICE_ACCOUNT;
    process.env.FCM_SERVICE_ACCOUNT = JSON.stringify({
      project_id: 'p',
      client_email: 'e',
      private_key: 'k',
    });
    expect(getFcmConfig()).toEqual({ projectId: 'p', clientEmail: 'e', privateKey: 'k' });
    process.env.FCM_SERVICE_ACCOUNT = 'not json';
    expect(getFcmConfig()).toBeNull();
    if (saved === undefined) delete process.env.FCM_SERVICE_ACCOUNT;
    else process.env.FCM_SERVICE_ACCOUNT = saved;
  });
});
