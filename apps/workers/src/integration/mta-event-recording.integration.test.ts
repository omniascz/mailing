/**
 * What the send path writes down when a message does not get through.
 *
 * Two holes this pins shut. A 4xx wrote `bounce`/soft on every attempt, so a
 * greylisted message that arrived on the fourth try left three bounces and a
 * delivery — and every deliverability consumer counts `event_type = 'bounce'`,
 * including the auto-pause evaluator and the channel-fallback trigger. And the
 * transport-error branch wrote nothing at all: six attempts, thirty-one
 * minutes, a job marked failed and not one row anywhere.
 *
 * Both are decisions the worker makes per attempt, so they are asserted
 * through a real queue and a real worker, with a real HTTP server standing in
 * for the API and recording exactly what arrives. The only stub is the gRPC
 * client, which is where the SMTP reply would come from.
 *
 * The jobs carry their own short backoff. The production ladder — 6 attempts
 * from 60 s — is a property of mtaOpts in queues/index.ts, not of this
 * decision; asserting it here would cost 31 minutes per case and prove
 * something the queue config already states.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';

let ORIGINAL_API_URL: string | undefined;

/** Controls what the "engine" replies with for the next send. */
const reply = {
  success: false,
  smtpCode: 451,
  smtpMessage: 'greylisted, try again later',
  error: '',
  deliverOnAttempt: 0 as number, // >0: succeed once this many attempts have run
};
let sendCalls = 0;

vi.mock('../lib/mta-grpc-client.js', () => ({
  // shutdownMtaSender() closes the client in afterAll.
  close: () => {},
  send: async () => {
    sendCalls += 1;
    if (reply.deliverOnAttempt > 0 && sendCalls >= reply.deliverOnAttempt) {
      return {
        success: true,
        messageId: 'm',
        smtpCode: 250,
        smtpMessage: 'OK',
        error: '',
        durationMs: '5',
      };
    }
    return {
      success: reply.success,
      messageId: 'm',
      smtpCode: reply.smtpCode,
      smtpMessage: reply.smtpMessage,
      error: reply.error,
      durationMs: '5',
    };
  },
}));

interface Captured {
  type: string;
  messageId?: string;
  metadata: Record<string, unknown>;
}
const captured: Captured[] = [];
let server: http.Server;

// The worker reads API_URL at module load, so the stand-in must exist first.
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
  // This lane runs files sequentially in one process, so a URL left pointing
  // at a closed mock server would break whatever runs next.
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

/** Workers bind to the fixed ISP queues, so one set for the whole file. */
let workersStarted = false;
async function startWorkersOnce(): Promise<void> {
  if (workersStarted) return;
  const { startMtaSenderWorkers } = await import('../jobs/mta-sender.js');
  startMtaSenderWorkers();
  workersStarted = true;
}

/** Run one message to completion and return the events the API received. */
async function run(
  scenario: Partial<typeof reply>,
  opts: { attempts: number },
): Promise<{ events: Captured[]; state: string }> {
  Object.assign(reply, {
    success: false,
    smtpCode: 451,
    smtpMessage: '',
    error: '',
    deliverOnAttempt: 0,
  });
  Object.assign(reply, scenario);
  sendCalls = 0;
  captured.length = 0;

  const { mtaQueues, QUEUE_NAMES } = await import('../queues/index.js');
  // Start from an empty queue. Jobs are enqueued with removeOnFail:false so a
  // failure is inspectable, which means a previous run can leave stragglers —
  // and a straggler picked up mid-test lands in `captured` and is counted.
  await mtaQueues.seznam.obliterate({ force: true }).catch(() => {});
  await startWorkersOnce();

  const messageId = `evt-${randomUUID()}`;
  const job = await mtaQueues.seznam.add(
    'probe',
    {
      messageId,
      orgId: randomUUID(),
      campaignId: randomUUID(),
      contactId: randomUUID(),
      fromEmail: 'a@forgemsg.test',
      fromName: '',
      toEmail: 'b@seznam.cz',
      toName: '',
      subject: 's',
      htmlBody: '<p>x</p>',
      priority: 2,
      // Skip the adaptive ISP throttle. It defers by re-enqueuing a *new* job,
      // which would multiply the attempts under test by up to 20 — a different
      // mechanism, out of scope here, and pinned by its own tests.
      throttleAttempts: 20,
    } as never,
    { attempts: opts.attempts, backoff: { type: 'fixed', delay: 50 }, removeOnFail: false },
  );

  const deadline = Date.now() + 30_000;
  let state = 'unknown';
  while (Date.now() < deadline) {
    state = await job.getState();
    if (state === 'completed' || state === 'failed') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  // Events are posted fire-and-forget; let the last one land.
  await new Promise((r) => setTimeout(r, 400));
  expect(QUEUE_NAMES.MTA_SEZNAM).toBe('mta-seznam');
  // Only this message's events. The queue is shared and obliterate() cannot
  // promise nothing else is mid-flight — a straggler from another run landing
  // in the capture would be counted as one of ours.
  return { events: captured.filter((e) => e.messageId === messageId), state };
}

describe('what a failed send writes to email_events', () => {
  it('a transport error records deferred per attempt and failed at the end', async () => {
    // smtpCode 0 is the shape sendViaMta returns for a gRPC/dial failure: no
    // SMTP reply at all. This branch used to write nothing.
    const { events, state } = await run(
      { smtpCode: 0, error: 'dial tcp 10.0.0.1:25: i/o timeout' },
      { attempts: 3 },
    );

    expect(events.map((e) => e.type)).toEqual(['deferred', 'deferred', 'failed']);
    expect(events.every((e) => e.metadata.reason === 'transport_error')).toBe(true);
    expect(events.at(-1)!.metadata.error).toContain('i/o timeout');
    // Not a bounce in any of them — that is the whole point.
    expect(events.some((e) => e.type === 'bounce')).toBe(false);
    expect(events.some((e) => e.metadata.bounceType !== undefined)).toBe(false);
    expect(state).toBe('failed');
  }, 60_000);

  it('a 4xx that never clears records deferred per attempt and one soft bounce', async () => {
    const { events, state } = await run(
      { smtpCode: 451, smtpMessage: 'greylisted' },
      { attempts: 3 },
    );

    expect(events.map((e) => e.type)).toEqual(['deferred', 'deferred', 'bounce']);
    expect(events.filter((e) => e.type === 'bounce')).toHaveLength(1);
    expect(events.at(-1)!.metadata.bounceType).toBe('soft');
    expect(events.slice(0, -1).every((e) => e.metadata.reason === 'soft_bounce')).toBe(true);
    expect(state).toBe('failed');
  }, 60_000);

  it('a greylisted message delivered on the 3rd attempt records no bounce at all', async () => {
    // The case the bounce rate was wrong about. Two deferrals, then a delivery.
    const { events, state } = await run(
      { smtpCode: 451, smtpMessage: 'greylisted', deliverOnAttempt: 3 },
      { attempts: 6 },
    );

    const bounces = events.filter((e) => e.type === 'bounce');
    expect(bounces, `bounce rate must count rejections, not retries`).toHaveLength(0);
    expect(events.filter((e) => e.type === 'deferred')).toHaveLength(2);
    expect(events.filter((e) => e.type === 'deliver')).toHaveLength(1);
    expect(state).toBe('completed');
  }, 60_000);

  it('a hard bounce still bounces once and is not retried', async () => {
    // Regression guard: the permanent path must be untouched by all of this.
    const { events, state } = await run(
      { smtpCode: 550, smtpMessage: 'User unknown' },
      { attempts: 6 },
    );

    expect(events.map((e) => e.type)).toEqual(['bounce']);
    expect(events[0]!.metadata.bounceType).toBe('hard');
    expect(state).toBe('completed'); // returns, does not throw ⇒ no retry
  }, 60_000);
});
