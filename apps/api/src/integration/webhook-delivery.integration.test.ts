/**
 * deliverWebhook against a real receiver: real Postgres, real sockets.
 *
 * One thing is stubbed and only one: safeFetch's address policy. A test server
 * can only bind to loopback, which the SSRF guard refuses — correctly, and
 * that refusal has its own tests in safe-fetch.test.ts and
 * webhook-ssrf.integration.test.ts. Relaxing the shipped guard so a test could
 * reach its own receiver would be the wrong trade, so the stub replaces
 * safeFetch with a plain http.request to the same URL. Everything else — the
 * signing, the status classification, the retry decision, the failure counter,
 * the auto-disable rule — is the real code against a real HTTP exchange.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type * as SafeFetchModule from '../lib/safe-fetch.js';

// Hoisted above the imports by vitest, so deliverWebhook picks it up.
vi.mock('../lib/safe-fetch.js', async () => {
  const actual = await vi.importActual<typeof SafeFetchModule>('../lib/safe-fetch.js');
  return {
    ...actual,
    safeFetch: async (
      url: string | URL,
      opts: { method?: string; headers?: Record<string, string>; body?: string } = {},
    ) =>
      new Promise((resolve, reject) => {
        const req = http.request(
          url,
          { method: opts.method ?? 'GET', headers: opts.headers },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
              const bytes = Buffer.concat(chunks);
              resolve({
                status: res.statusCode ?? 0,
                headers: res.headers,
                body: bytes.toString('utf8'),
                bytes,
                truncated: false,
                url: String(url),
              });
            });
          },
        );
        req.on('error', reject);
        if (opts.body !== undefined) req.write(opts.body);
        req.end();
      }),
  };
});

const { verifyTimestampedSignature, verifySignature } = await import('@shared/webhooks');
const { db } = await import('../db/client.js');
const { webhooks, webhookDeliveries } = await import('../db/schema/index.js');
const { eq } = await import('drizzle-orm');
const { deliverWebhook, markDeliveryFailed, RetryableDeliveryError, classifyOutcome } =
  await import('../services/webhooks/index.js');
const { organizations } = await import('../db/schema/index.js');

const SECRET = 'api-itest-webhook-secret-0123456789';

interface Received {
  headers: http.IncomingHttpHeaders;
  body: string;
}

function makeReceiver(status: () => number) {
  const received: Received[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(status(), { 'Content-Type': 'text/plain' });
      res.end('receiver said so');
    });
  });
  return { server, received };
}

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return (server.address() as AddressInfo).port;
}

let orgId: string;

async function seed(url: string, consecutiveFailures = 0) {
  const [wh] = await db
    .insert(webhooks)
    .values({
      orgId,
      url,
      secret: SECRET,
      events: ['contact.created'],
      active: true,
      consecutiveFailures,
    })
    .returning({ id: webhooks.id });

  const [d] = await db
    .insert(webhookDeliveries)
    .values({
      webhookId: wh!.id,
      orgId,
      event: 'contact.created',
      payload: { event: 'contact.created', orgId, data: { probe: true } },
      status: 'pending',
    })
    .returning({ id: webhookDeliveries.id });

  return { webhookId: wh!.id, deliveryId: d!.id };
}

const readWebhook = async (id: string) =>
  (await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1))[0]!;
const readDelivery = async (id: string) =>
  (await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id)).limit(1))[0]!;

describe('deliverWebhook against a real receiver', () => {
  beforeAll(async () => {
    const [org] = await db.select({ id: organizations.id }).from(organizations).limit(1);
    if (!org) throw new Error('[integration] no organisation in the database');
    orgId = org.id;
    await db.delete(webhooks).where(eq(webhooks.secret, SECRET));
  });

  afterAll(async () => {
    await db.delete(webhooks).where(eq(webhooks.secret, SECRET));
  });

  it('delivers, and the receiver can verify both signatures with its own key', async () => {
    const { server, received } = makeReceiver(() => 200);
    const port = await listen(server);
    try {
      const { webhookId, deliveryId } = await seed(`http://127.0.0.1:${port}/hook`);
      const result = await deliverWebhook(deliveryId);

      expect(result).toEqual({ outcome: 'success', statusCode: 200 });
      expect(received).toHaveLength(1);

      const req = received[0]!;
      const v2 = req.headers['x-forgemsg-signature-v2'] as string;
      const v1 = req.headers['x-forgemsg-signature'] as string;
      expect(v2).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
      // The check a customer would write, with the key they were given.
      expect(verifyTimestampedSignature(SECRET, req.body, v2)).toBe(true);
      expect(verifySignature(SECRET, req.body, v1)).toBe(true);
      // And it must not verify under a different key, or the line above is
      // asserting nothing.
      expect(verifyTimestampedSignature('wrong-key', req.body, v2)).toBe(false);
      expect(verifySignature('wrong-key', req.body, v1)).toBe(false);

      expect(req.headers['x-forgemsg-delivery']).toBe(deliveryId);
      expect(req.headers['x-forgemsg-event']).toBe('contact.created');
      expect(Number(req.headers['x-forgemsg-timestamp'])).toBeGreaterThan(0);

      const row = await readDelivery(deliveryId);
      expect(row.status).toBe('success');
      expect(row.attempts).toBe(1);
      expect(row.deliveredAt).toBeTruthy();

      const wh = await readWebhook(webhookId);
      expect(wh.totalDeliveries).toBe(1);
      expect(wh.consecutiveFailures).toBe(0);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('asks for a retry on 500 rather than settling the delivery', async () => {
    const { server, received } = makeReceiver(() => 500);
    const port = await listen(server);
    try {
      const { webhookId, deliveryId } = await seed(`http://127.0.0.1:${port}/hook`);
      await expect(deliverWebhook(deliveryId)).rejects.toBeInstanceOf(RetryableDeliveryError);

      expect(received).toHaveLength(1);
      const row = await readDelivery(deliveryId);
      // Left pending, not 'retrying': the schedule is BullMQ's, and the row is
      // audit. The old code wrote 'retrying' plus a nextRetryAt that nothing
      // ever read back.
      expect(row.status).toBe('pending');
      expect(row.statusCode).toBe(500);
      expect(row.attempts).toBe(1);
      expect(row.nextRetryAt).toBeNull();

      // A failure that will be retried must not count towards auto-disable.
      const wh = await readWebhook(webhookId);
      expect(wh.consecutiveFailures).toBe(0);
      expect(wh.failedDeliveries).toBe(0);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('gives up on 404 at once, and does not retry it', async () => {
    const { server, received } = makeReceiver(() => 404);
    const port = await listen(server);
    try {
      const { webhookId, deliveryId } = await seed(`http://127.0.0.1:${port}/hook`);
      const result = await deliverWebhook(deliveryId);

      expect(result.outcome).toBe('failed');
      expect(received, 'a 4xx says the same thing five times').toHaveLength(1);

      const row = await readDelivery(deliveryId);
      expect(row.status).toBe('failed');
      expect(row.statusCode).toBe(404);

      const wh = await readWebhook(webhookId);
      expect(wh.consecutiveFailures).toBe(1);
      expect(wh.active, '404 counts, it does not disable on its own').toBe(true);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('retries 408 and 429, which are the 4xx codes that mean "later"', async () => {
    for (const status of [408, 429]) {
      const { server } = makeReceiver(() => status);
      const port = await listen(server);
      try {
        const { deliveryId } = await seed(`http://127.0.0.1:${port}/hook`);
        await expect(deliverWebhook(deliveryId), `HTTP ${status}`).rejects.toBeInstanceOf(
          RetryableDeliveryError,
        );
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
      }
    }
  });

  it('disables the webhook immediately on 410 Gone', async () => {
    const { server } = makeReceiver(() => 410);
    const port = await listen(server);
    try {
      const { webhookId, deliveryId } = await seed(`http://127.0.0.1:${port}/hook`);
      const result = await deliverWebhook(deliveryId);

      expect(result.outcome).toBe('failed');
      const wh = await readWebhook(webhookId);
      expect(wh.active).toBe(false);
      expect(wh.disabledAt).toBeTruthy();
      expect(wh.disabledReason).toMatch(/410 Gone/);
      // One failure, not ten — the code itself is the evidence.
      expect(wh.consecutiveFailures).toBe(1);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('disables on the tenth consecutive failure, not the ninth', async () => {
    const { server } = makeReceiver(() => 404);
    const port = await listen(server);
    try {
      const ninth = await seed(`http://127.0.0.1:${port}/hook`, 8);
      await deliverWebhook(ninth.deliveryId);
      expect((await readWebhook(ninth.webhookId)).active, 'ninth failure').toBe(true);

      const tenth = await seed(`http://127.0.0.1:${port}/hook`, 9);
      await deliverWebhook(tenth.deliveryId);
      const wh = await readWebhook(tenth.webhookId);
      expect(wh.active, 'tenth failure').toBe(false);
      expect(wh.disabledReason).toMatch(/10 consecutive failed deliveries/);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('a success clears the failure streak', async () => {
    const { server } = makeReceiver(() => 200);
    const port = await listen(server);
    try {
      const { webhookId, deliveryId } = await seed(`http://127.0.0.1:${port}/hook`, 7);
      await deliverWebhook(deliveryId);
      expect((await readWebhook(webhookId)).consecutiveFailures).toBe(0);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('markDeliveryFailed is what the exhausted path lands on', async () => {
    const { server } = makeReceiver(() => 500);
    const port = await listen(server);
    try {
      const { webhookId, deliveryId } = await seed(`http://127.0.0.1:${port}/hook`);
      await expect(deliverWebhook(deliveryId)).rejects.toThrow();

      // What the worker's `failed` handler triggers once BullMQ gives up.
      const res = await markDeliveryFailed(deliveryId, {
        responseBody: 'exhausted after 5 attempts',
        attempts: 5,
      });
      expect(res.consecutiveFailures).toBe(1);

      const row = await readDelivery(deliveryId);
      expect(row.status).toBe('failed');
      expect(row.attempts).toBe(5);
      expect((await readWebhook(webhookId)).failedDeliveries).toBe(1);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});

describe('classifyOutcome', () => {
  const cases: Array<[status: number | undefined, outcome: string, disableNow: boolean]> = [
    [200, 'success', false],
    [204, 'success', false],
    [301, 'retry', false], // a redirect that safeFetch did not resolve is not a settled answer
    [400, 'failed', false],
    [401, 'failed', false],
    [403, 'failed', false],
    [404, 'failed', false],
    [408, 'retry', false],
    [410, 'failed', true],
    [429, 'retry', false],
    [500, 'retry', false],
    [502, 'retry', false],
    [503, 'retry', false],
    [undefined, 'retry', false],
  ];

  it.each(cases)('HTTP %s → %s (disableNow=%s)', (status, outcome, disableNow) => {
    expect(classifyOutcome(status)).toEqual({ outcome, disableNow });
  });
});
