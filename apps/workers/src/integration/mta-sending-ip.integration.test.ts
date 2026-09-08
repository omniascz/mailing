/**
 * Every event a message produces says which address it left from — or says
 * nothing at all, and never guesses.
 *
 * Nothing recorded the sending address anywhere. `email_events.ip_address` is
 * the RECIPIENT's, filled from the tracking pixel's `X-Forwarded-For`, and
 * `isp` is the RECEIVING provider, so a bounce could not be attributed to the
 * address that caused it. That is why `dedicated_ips.bounce_rate`,
 * `complaint_rate` and `reputation_score` have stood at zero since they were
 * added: their only writer takes numbers nobody could compute.
 *
 * Asserted through a real queue and a real worker, with a real HTTP server
 * standing in for the API and recording exactly what arrives — the same shape
 * mta-event-recording uses, and for the same reason: this is a decision the
 * worker makes per attempt.
 *
 * The absence case is the one that matters most. A message the engine routed
 * for itself, or one that went out on the shared pool, must carry NO key rather
 * than an empty one: the aggregate filters on `metadata ? 'sendingIp'`, and an
 * event that cannot say where it came from must not be attributable to an
 * address. Folding those into "an address with no bounces" would dilute a real
 * rate towards zero, which is the direction that hides a problem.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';

let ORIGINAL_API_URL: string | undefined;

const reply = {
  success: true,
  smtpCode: 250,
  smtpMessage: 'OK',
  error: '',
};

vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async () => ({
    success: reply.success,
    messageId: 'm',
    smtpCode: reply.smtpCode,
    smtpMessage: reply.smtpMessage,
    error: reply.error,
    durationMs: '5',
  }),
}));

interface Captured {
  type: string;
  messageId?: string;
  metadata: Record<string, unknown>;
}
const captured: Captured[] = [];
let server: http.Server;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.url?.startsWith('/api/v1/internal/events')) {
        const parsed = JSON.parse(body || '{}') as Captured;
        captured.push({
          type: parsed.type,
          messageId: parsed.messageId,
          metadata: parsed.metadata ?? {},
        });
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  ORIGINAL_API_URL = process.env.API_URL;
  process.env.API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30_000);

afterAll(async () => {
  if (ORIGINAL_API_URL === undefined) delete process.env.API_URL;
  else process.env.API_URL = ORIGINAL_API_URL;
  const { shutdownMtaSender } = await import('../jobs/mta-sender.js');
  shutdownMtaSender();
  await new Promise<void>((r) => server.close(() => r()));
}, 30_000);

let workersStarted = false;
async function startWorkersOnce(): Promise<void> {
  if (workersStarted) return;
  const { startMtaSenderWorkers } = await import('../jobs/mta-sender.js');
  startMtaSenderWorkers();
  workersStarted = true;
}

/** Send one message and return the events the API received for it. */
async function run(
  jobExtras: Record<string, unknown>,
  scenario: Partial<typeof reply> = {},
): Promise<Captured[]> {
  Object.assign(reply, { success: true, smtpCode: 250, smtpMessage: 'OK', error: '' }, scenario);
  captured.length = 0;

  const { mtaQueues } = await import('../queues/index.js');
  await mtaQueues.seznam.obliterate({ force: true }).catch(() => {});
  await startWorkersOnce();

  const messageId = `sip-${randomUUID()}`;
  const job = await mtaQueues.seznam.add(
    'probe',
    {
      messageId,
      orgId: randomUUID(),
      campaignId: randomUUID(),
      contactId: randomUUID(),
      fromEmail: 'a@example.invalid',
      fromName: '',
      toEmail: 'b@seznam.cz',
      toName: '',
      subject: 's',
      htmlBody: '<p>x</p>',
      priority: 2,
      throttleAttempts: 20,
      ...jobExtras,
    } as never,
    { attempts: 1, backoff: { type: 'fixed', delay: 50 }, removeOnFail: false },
  );

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const state = await job.getState();
    if (state === 'completed' || state === 'failed') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, 400));
  return captured.filter((e) => e.messageId === messageId);
}

describe('a message routed to a dedicated address', () => {
  it('stamps that address on every event it produces', async () => {
    const events = await run({ sendingIp: '198.51.100.77' });

    expect(events.length, 'no events were recorded at all').toBeGreaterThan(0);
    for (const e of events) {
      expect(e.metadata.sendingIp, `${e.type} did not carry the sending address`).toBe(
        '198.51.100.77',
      );
    }
    // Both halves of a success are recorded, and both must carry it: the
    // aggregate divides bounces by sends, so a send that cannot be attributed
    // would leave a denominator smaller than the numerator's world.
    expect(events.map((e) => e.type)).toContain('send');
    expect(events.map((e) => e.type)).toContain('deliver');
  }, 60_000);

  it('stamps it on a hard bounce too — the event the rate is actually built from', async () => {
    const events = await run(
      { sendingIp: '198.51.100.78' },
      { success: false, smtpCode: 550, smtpMessage: 'user unknown' },
    );

    const bounce = events.find((e) => e.type === 'bounce');
    expect(bounce, 'no bounce was recorded').toBeDefined();
    expect(bounce!.metadata.bounceType).toBe('hard');
    expect(
      bounce!.metadata.sendingIp,
      'a bounce could not be attributed to the address that caused it',
    ).toBe('198.51.100.78');
  }, 60_000);
});

describe('a message the engine or the kernel routed', () => {
  it('carries NO sendingIp key rather than an empty one', async () => {
    // No sendingIp on the job: the engine picks from SENDING_IPS, or the
    // kernel picks off the shared pool. Neither is knowable from this process.
    const events = await run({});

    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(
        Object.prototype.hasOwnProperty.call(e.metadata, 'sendingIp'),
        `${e.type} carried a sendingIp key it could not know`,
      ).toBe(false);
    }
  }, 60_000);

  it('an empty string on the job is treated as absent, not as an address', async () => {
    // batch-sender writes '' when pickIpForSend finds nothing. `??` would let
    // that through as a value; the key must simply not appear.
    const events = await run({ sendingIp: '' });

    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(
        Object.prototype.hasOwnProperty.call(e.metadata, 'sendingIp'),
        `${e.type} turned an empty string into an attributable address`,
      ).toBe(false);
    }
  }, 60_000);
});
