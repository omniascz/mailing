/**
 * The Meta webhook's signature check, on its own.
 *
 * This is where the fix is provable. Through the route the old
 * `if (!appSecret) return true` was unreachable — metaWebhookEnabled() needs
 * the secret as well as the flag, so the endpoint 404s at exactly the
 * configuration where verification would have been skipped. That makes the
 * switch the thing keeping forged payloads out, and a switch is configuration:
 * whoever widens it later inherits an open door unless the function underneath
 * is the thing that refuses. So the function is tested directly.
 *
 * `verifySignature` is exported for this. It is not used anywhere else.
 */
import { describe, it, expect, afterEach } from 'vitest';
import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { verifySignature } from './meta.js';

const SECRET = 'meta_app_secret_123';
const raw = Buffer.from(JSON.stringify({ object: 'page', entry: [{ id: 'page1' }] }));
const goodSig = `sha256=${crypto.createHmac('sha256', SECRET).update(raw).digest('hex')}`;

/** Only the two fields verifySignature reads. */
const req = (body?: Buffer) => ({ rawBody: body }) as unknown as FastifyRequest;

const before = {
  secret: process.env.META_APP_SECRET,
  unsigned: process.env.ALLOW_UNSIGNED_WEBHOOKS,
  nodeEnv: process.env.NODE_ENV,
};

afterEach(() => {
  for (const [k, v] of Object.entries({
    META_APP_SECRET: before.secret,
    ALLOW_UNSIGNED_WEBHOOKS: before.unsigned,
    NODE_ENV: before.nodeEnv,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('verifySignature', () => {
  it('accepts a correctly signed body', () => {
    process.env.META_APP_SECRET = SECRET;
    expect(verifySignature(req(raw), goodSig)).toBe(true);
  });

  it('rejects a forged signature', () => {
    process.env.META_APP_SECRET = SECRET;
    expect(verifySignature(req(raw), 'sha256=deadbeef')).toBe(false);
  });

  it('rejects a tampered body', () => {
    process.env.META_APP_SECRET = SECRET;
    const tampered = Buffer.from(JSON.stringify({ object: 'page', entry: [{ id: 'evil' }] }));
    expect(verifySignature(req(tampered), goodSig)).toBe(false);
  });

  it('rejects when there is no raw body to verify', () => {
    // Stricter than the shared helper, which falls back to re-serialising
    // req.body. Kept deliberately: this route sets `config: { rawBody: true }`,
    // so an absent rawBody means something is wrong, not that a different
    // encoding should be tried.
    process.env.META_APP_SECRET = SECRET;
    expect(verifySignature(req(undefined), goodSig)).toBe(false);
  });

  it('does not verify anything when no app secret is configured', () => {
    // Was `if (!appSecret) return true; // Skip verification in dev`. An unset
    // secret is the absence of a check, and the absence of a check is not a
    // pass — the same correction #180 made in lib/meta-signature.ts.
    delete process.env.META_APP_SECRET;
    expect(verifySignature(req(raw), goodSig)).toBe(false);
    expect(verifySignature(req(raw), '')).toBe(false);
  });

  it('opens without a secret only when the operator asks for it', () => {
    delete process.env.META_APP_SECRET;
    process.env.ALLOW_UNSIGNED_WEBHOOKS = 'true';
    expect(verifySignature(req(raw), '')).toBe(true);
  });

  it('the escape hatch cannot be reached in production', () => {
    delete process.env.META_APP_SECRET;
    process.env.ALLOW_UNSIGNED_WEBHOOKS = 'true';
    process.env.NODE_ENV = 'production';
    expect(verifySignature(req(raw), '')).toBe(false);
  });
});
