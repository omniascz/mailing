import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../index.js';

/**
 * Endpoints we are not launching with.
 *
 * Each of these verifies an inbound signature with a check that opens when the
 * secret is unset — `if (!appSecret) return true`, `if (appSecret && …)`, or in
 * Telnyx's case a verifier that returns without looking at the signature at
 * all. None of that is repaired here: repairing verification for a surface we
 * do not serve is work spent where nobody can reach it. They are switched off.
 *
 * Off means the request is answered before the body is read — either the route
 * is not registered (404) or the handler returns 404 with an INTEGRATION_DISABLED
 * body as its first statement.
 * The tests below send NO signature header on purpose: the old code answered
 * such a request with 200, and a merely-broken switch would answer 401. A 404
 * is what shows we returned before verification, not after it.
 *
 * Twilio is included as the control. Its verifier is fail-closed and correct,
 * it shares a route with Telnyx, and it must stay on — otherwise the switches
 * are not per-integration, which was the point.
 */

let app: FastifyInstance;

beforeAll(async () => {
  // No ENABLE_* flag set: the default state a deploy gets.
  app = await buildApp();
});

afterAll(async () => {
  if (app) await app.close();
});

const forgedLead = { entry: [{ id: '123', changes: [{ value: { form_id: 'f1' } }] }] };

describe('webhook surfaces that are off by default', () => {
  const unregistered: Array<[string, string, unknown]> = [
    ['Facebook lead ads', '/api/v1/webhooks/ads/facebook/leads', forgedLead],
    ['LinkedIn lead ads', '/api/v1/webhooks/ads/linkedin/leads', { leads: [{ campaignId: 'c1' }] }],
    ['Instagram', '/api/v1/webhooks/instagram', { object: 'instagram', entry: [] }],
    ['Messenger', '/api/v1/webhooks/messenger', { object: 'page', entry: [] }],
  ];

  for (const [name, url, payload] of unregistered) {
    it(`${name} is not registered`, async () => {
      const res = await app.inject({ method: 'POST', url, payload: payload as object });
      expect(res.statusCode, `${url} answered ${res.statusCode}`).toBe(404);
    });
  }

  const gated: Array<[string, string, string, unknown]> = [
    ['Meta', '/webhook/meta', 'ENABLE_META_WEBHOOK', { object: 'page', entry: [] }],
    [
      'WhatsApp',
      '/api/v1/whatsapp/webhooks/meta',
      'ENABLE_WHATSAPP_WEBHOOK',
      { entry: [{ changes: [{ value: {}, field: 'messages' }] }] },
    ],
    [
      'Telnyx',
      '/api/v1/phone/webhook/telnyx',
      'ENABLE_TELNYX_WEBHOOK',
      { data: { event_type: 'call.answered' } },
    ],
  ];

  for (const [name, url, flag, payload] of gated) {
    it(`${name} answers 404 and names its switch`, async () => {
      const res = await app.inject({ method: 'POST', url, payload: payload as object });
      expect(res.statusCode, `${url} answered ${res.statusCode}`).toBe(404);
      const body = res.json() as { code?: string; message?: string };
      expect(body.code).toBe('INTEGRATION_DISABLED');
      expect(body.message).toContain(flag);
    });

    it(`${name} refuses before verification, not after it`, async () => {
      // No signature header. A gate that ran verification first would answer
      // 401/403 here; 404 is only reachable ahead of it.
      const res = await app.inject({ method: 'POST', url, payload: payload as object });
      expect([401, 403]).not.toContain(res.statusCode);
      expect(res.statusCode).toBe(404);
    });
  }

  it('Meta GET verification handshake is off too', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/webhook/meta?hub.mode=subscribe&hub.verify_token=x&hub.challenge=c',
    });
    expect(res.statusCode).toBe(404);
  });

  it('the authenticated /api/v1/meta/pages surface in the same file stays registered', async () => {
    // Switching off the two /webhook/meta routes must not take the admin
    // endpoints down with them — that is why they are gated in-handler rather
    // than by skipping the route file.
    const res = await app.inject({ method: 'GET', url: '/api/v1/meta/pages' });
    expect(res.statusCode, 'expected an auth refusal, not 404').toBe(401);
  });

  it('Twilio, which shares the route with Telnyx, is NOT switched off', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/phone/webhook/twilio',
      payload: { CallSid: 'CA1' },
    });
    expect(res.statusCode, 'the switches are per integration, not global').not.toBe(404);
    expect(res.statusCode, 'Twilio verification is fail-closed and must still run').toBe(401);
  });
});
