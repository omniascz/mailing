/**
 * The voice callback proves who it is before it writes anything.
 *
 * `POST /api/v1/voice/callback` took both the call id and the org id from the
 * query string and checked nothing: no session, no signature. Measured against
 * this database before the fix, an anonymous POST answered 200 and rewrote a
 * call that belonged to somebody else:
 *
 *   before  {"status":"ringing","durationSeconds":0,"recordingUrl":null,"twilioRecordingSid":null}
 *   after   {"status":"failed","durationSeconds":999,
 *            "recordingUrl":"https://evil.test/recording.mp3","twilioRecordingSid":"REevil…"}
 *
 * So the ids were the only secret, and a leaked pair let anyone mark a finished
 * call as failed and point its recording at a file of their own.
 *
 * ─── What is asserted ────────────────────────────────────────────────────────
 *
 * The refusal cases compare the row FIELD BY FIELD against what it was, because
 * "still 200" and "still ringing" are two different claims and only the second
 * one is the interesting one.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * A route that had been deleted would refuse the unsigned and the forged
 * request too, so the last case sends a CORRECTLY signed callback that MUST be
 * accepted and MUST change the row. Without it this file would pass against
 * `return reply.code(401)`.
 *
 * WHAT THIS TEST CANNOT SEE
 * - It does not cover the dev escape hatch: `unsignedWebhooksAllowed()` reads
 *   NODE_ENV and the flag, and config/env.ts parses once per module registry,
 *   so that branch is unit-tested where the module can be reloaded —
 *   routes/v1/sms.test.ts, which reaches the same helper through its re-export.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';

/**
 * Set BEFORE the imports run. config/env.ts parses process.env once, at import
 * time, so a value assigned in beforeAll would arrive too late — the route
 * would see an unset Auth Token and refuse everything, including the case that
 * must pass. Same reason as sms-webhook-signature.integration.test.ts.
 */
const { AUTH_TOKEN, PUBLIC_BASE } = vi.hoisted(() => {
  const token = 'itest-twilio-auth-token';
  const base = 'https://api.itest.invalid';
  process.env.TWILIO_AUTH_TOKEN = token;
  process.env.API_PUBLIC_URL = base;
  return { AUTH_TOKEN: token, PUBLIC_BASE: base };
});

const { createTestApp, login } = await import('./setup/harness.js');
const { db } = await import('../db/client.js');
const { contacts } = await import('../db/schema/index.js');
const { calls } = await import('../db/schema/calls.js');

type Session = Awaited<ReturnType<typeof login>>;

const TAG = `z69-${randomUUID().slice(0, 8)}`;

let app: FastifyInstance;
let session: Session;
let contactId: string;
let callId: string;

/** Exactly the fields the callback is able to rewrite. */
const readCall = async (id: string) =>
  (
    await db
      .select({
        status: calls.status,
        durationSeconds: calls.durationSeconds,
        recordingUrl: calls.recordingUrl,
        twilioRecordingSid: calls.twilioRecordingSid,
      })
      .from(calls)
      .where(eq(calls.id, id))
  )[0]!;

const makeCall = async () => {
  const [row] = await db
    .insert(calls)
    .values({
      orgId: session.orgId,
      contactId,
      status: 'ringing',
      durationSeconds: 0,
      recordingUrl: null,
    })
    .returning({ id: calls.id });
  return row!.id;
};

const PARAMS = {
  CallStatus: 'failed',
  RecordingUrl: 'https://evil.test/recording.mp3',
  RecordingSid: 'REevil0000000000000000000000000000',
  CallDuration: '999',
};

/**
 * `sign` picks the key: the real Auth Token, a wrong one, or no header at all.
 * Twilio signs the URL INCLUDING the query string, which is where this route
 * takes both of its ids from — so the query is part of what is signed.
 */
const postCallback = async (id: string, sign?: string) => {
  const path = `/api/v1/voice/callback?call_id=${id}&org_id=${session.orgId}`;
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
  };
  if (sign !== undefined) {
    const canonical = Object.keys(PARAMS)
      .sort()
      .reduce(
        (acc, key) => acc + key + PARAMS[key as keyof typeof PARAMS],
        `${PUBLIC_BASE}${path}`,
      );
    headers['x-twilio-signature'] = createHmac('sha1', sign).update(canonical).digest('base64');
  }
  return app.inject({
    method: 'POST',
    url: path,
    headers,
    payload: new URLSearchParams(PARAMS).toString(),
  });
};

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  const [c] = await db
    .insert(contacts)
    .values({ orgId: session.orgId, email: `${TAG}@example.invalid`, status: 'active' })
    .returning({ id: contacts.id });
  contactId = c!.id;
  callId = await makeCall();
}, 120_000);

afterAll(async () => {
  await db.delete(calls).where(eq(calls.orgId, session.orgId));
  if (contactId) await db.delete(contacts).where(eq(contacts.id, contactId));
  await app?.close();
}, 120_000);

describe('POST /api/v1/voice/callback', () => {
  it('refuses an unsigned callback, and the call is untouched', async () => {
    const before = await readCall(callId);

    const res = await postCallback(callId);

    expect(res.statusCode, res.body).toBe(401);
    expect(res.statusCode, 'the write went through').not.toBe(200);

    const after = await readCall(callId);
    expect(after.status).toBe(before.status);
    expect(after.durationSeconds).toBe(before.durationSeconds);
    expect(after.recordingUrl).toBe(before.recordingUrl);
    expect(after.twilioRecordingSid).toBe(before.twilioRecordingSid);
    // Named separately: this is the value the unsigned request tried to plant.
    expect(after.recordingUrl).not.toBe(PARAMS.RecordingUrl);
  });

  it('refuses a callback signed with the wrong key', async () => {
    const before = await readCall(callId);

    const res = await postCallback(callId, 'not-the-auth-token');

    expect(res.statusCode, res.body).toBe(401);
    const after = await readCall(callId);
    expect(after.status).toBe(before.status);
    expect(after.recordingUrl).toBe(before.recordingUrl);
    expect(after.twilioRecordingSid).toBe(before.twilioRecordingSid);
  });

  it('accepts a correctly signed callback and records the result', async () => {
    const fresh = await makeCall();
    const before = await readCall(fresh);
    expect(before.status, 'the fixture is not in the state being asserted').toBe('ringing');

    const res = await postCallback(fresh, AUTH_TOKEN);

    expect(res.statusCode, res.body).toBe(200);
    const after = await readCall(fresh);
    expect(after.status).toBe('failed');
    expect(after.durationSeconds).toBe(999);
    expect(after.recordingUrl).toBe(PARAMS.RecordingUrl);
    expect(after.twilioRecordingSid).toBe(PARAMS.RecordingSid);
  });
});
