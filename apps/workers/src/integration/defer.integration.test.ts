/**
 * Deferring is not failing, and the two keep separate books.
 *
 * There used to be three ways to put a message off. Retry threw and let BullMQ
 * decide. The ISP throttle enqueued a *new* job with a delay, which reset
 * attemptsMade — so it copied the original's retry policy by hand and carried
 * its own counter in the payload. The warmup daily cap had nothing: it
 * returned an error, fell into the retry path, and burned six attempts in
 * thirty-one minutes against a limit that does not move until midnight.
 *
 * All three now go through defer(), which moves the same job. What has to be
 * true after that is asserted here against a real queue and a real worker:
 * the job keeps its identity and its attempts, a planned wait does not spend
 * one, and each reason lands the right event.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import { connection } from '../queues/index.js';
import { defer, deferralCount, nextUtcMidnight } from '../lib/defer.js';

let ORIGINAL_API_URL: string | undefined;

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
        const p = JSON.parse(body || '{}') as Captured;
        captured.push({ type: p.type, messageId: p.messageId, metadata: p.metadata ?? {} });
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
  await new Promise<void>((r) => server.close(() => r()));
}, 30_000);

describe('defer() keeps the job and spends no attempt', () => {
  it('a deferred job is the same job, with its attempts intact', async () => {
    const name = `defer-itest-${randomUUID().slice(0, 8)}`;
    const q = new Queue(name, { connection });
    const seen: Array<{ attemptsMade: number; id?: string; deferrals: number }> = [];
    let deferred = 0;

    const worker = new Worker(
      name,
      async (job: Job, token) => {
        seen.push({
          attemptsMade: job.attemptsMade,
          id: job.id,
          deferrals: deferralCount(job.data as { deferrals?: { throttle?: number } }, 'throttle'),
        });
        if (deferred < 3) {
          deferred += 1;
          await defer(job as never, token, 'throttle', Date.now() + 150);
        }
        throw new Error('real failure');
      },
      { connection, concurrency: 1 },
    );
    await worker.waitUntilReady();

    const job = await q.add(
      'probe',
      { marker: 'x' },
      { attempts: 2, backoff: { type: 'fixed', delay: 100 }, removeOnFail: false },
    );

    const deadline = Date.now() + 25_000;
    let state = 'unknown';
    while (Date.now() < deadline) {
      state = await job.getState();
      if (state === 'failed' || state === 'completed') break;
      await new Promise((r) => setTimeout(r, 60));
    }

    // Three deferrals then two real attempts: five passes through the handler.
    expect(seen).toHaveLength(5);
    // Same job throughout — a re-enqueue would have produced new ids.
    expect(new Set(seen.map((s) => s.id)).size).toBe(1);
    // The deferrals spent no attempt: attemptsMade is still 0 on pass 4.
    expect(seen.slice(0, 4).map((s) => s.attemptsMade)).toEqual([0, 0, 0, 0]);
    // Only the real failures count, and the full allowance was still there.
    expect(seen[4]!.attemptsMade).toBe(1);
    // The per-reason counter rode along on the job's own data.
    expect(seen.map((s) => s.deferrals)).toEqual([0, 1, 2, 3, 3]);
    expect(state).toBe('failed');

    await worker.close();
    await q.obliterate({ force: true });
    await q.close();
  }, 60_000);

  it('nextUtcMidnight is the next 00:00 UTC, not a fixed offset', () => {
    const from = new Date('2026-08-23T21:40:00.000Z');
    expect(new Date(nextUtcMidnight(from)).toISOString()).toBe('2026-08-24T00:00:00.000Z');
    // Just after midnight it is nearly a whole day away, not sixty seconds.
    const justAfter = new Date('2026-08-23T00:00:30.000Z');
    expect(nextUtcMidnight(justAfter) - justAfter.getTime()).toBeGreaterThan(23 * 3600_000);
  });
});

describe('the send path defers for the right reason', () => {
  const reply = { smtpCode: 0, error: '', success: false };
  let sendCalls = 0;

  beforeAll(() => {
    vi.doMock('../lib/mta-grpc-client.js', () => ({
      close: () => {},
      send: async () => {
        sendCalls += 1;
        return {
          success: reply.success,
          messageId: 'm',
          smtpCode: reply.smtpCode,
          smtpMessage: '',
          error: reply.error,
          durationMs: '1',
        };
      },
    }));
  });

  it('a warmup quota rejection defers to midnight UTC and records the reason', async () => {
    vi.resetModules();
    captured.length = 0;
    sendCalls = 0;
    reply.error = 'warmup: all sending IPs have reached their daily limit';

    const { mtaQueues, QUEUE_NAMES } = await import('../queues/index.js');
    const { startMtaSenderWorkers, shutdownMtaSender } = await import('../jobs/mta-sender.js');
    await mtaQueues.seznam.obliterate({ force: true }).catch(() => {});
    startMtaSenderWorkers();

    const messageId = `warm-${randomUUID()}`;
    const job = await mtaQueues.seznam.add(
      'probe',
      {
        messageId,
        orgId: randomUUID(),
        campaignId: randomUUID(),
        contactId: randomUUID(),
        fromEmail: 'a@forgemsg.test',
        toEmail: 'b@seznam.cz',
        subject: 's',
        htmlBody: '<p>x</p>',
        priority: 2,
        stream: 'broadcast',
        deferrals: { throttle: 99 }, // skip the throttle gate; warmup is under test
      } as never,
      { attempts: 6, removeOnFail: false },
    );

    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      if ((await job.getState()) === 'delayed') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 400));

    const fresh = await mtaQueues.seznam.getJob(job.id!);
    expect(await fresh!.getState()).toBe('delayed');
    // Delayed until midnight, not nudged by a minute.
    const until = Date.now() + (fresh!.delay ?? 0);
    expect(Math.abs(until - nextUtcMidnight())).toBeLessThan(5 * 60_000);
    expect(fresh!.delay).toBeGreaterThan(60_000);
    // A planned wait, not a failed attempt.
    expect(fresh!.attemptsMade).toBe(0);
    expect(sendCalls).toBe(1);

    const mine = captured.filter((e) => e.messageId === messageId);
    expect(mine.map((e) => e.type)).toEqual(['deferred']);
    expect(mine[0]!.metadata.reason).toBe('warmup_quota');

    expect(QUEUE_NAMES.MTA_SEZNAM).toBe('mta-seznam');
    shutdownMtaSender();
    await mtaQueues.seznam.obliterate({ force: true }).catch(() => {});
  }, 60_000);
});
