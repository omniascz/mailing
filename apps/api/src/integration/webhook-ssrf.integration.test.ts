/**
 * SSRF guard, through the real HTTP layer into real Postgres.
 *
 * The unit tests prove the guard refuses an address. What they cannot prove is
 * that the guard is actually reached from the routes a customer uses — the
 * reported hole was not a missing range check, it was a fetch() that never
 * consulted one. These register and call webhooks exactly the way the probe
 * did, and expect the opposite outcome.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import { createTestApp, login } from './setup/harness.js';
import { db } from '../db/client.js';
import { webhooks } from '../db/schema/index.js';

interface ErrorBody {
  code?: string;
  message?: string;
  statusCode?: number;
}

describe('webhook SSRF guard (authenticated, real DB)', () => {
  let app: FastifyInstance;
  let cookie: string;
  let orgId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
    const session = await login(app);
    cookie = session.cookie;
    orgId = session.orgId;
    // These tests create webhooks, and the org caps at MAX_WEBHOOKS_PER_ORG.
    // Without this, a few runs exhaust the quota and every later create fails
    // with a 400 that looks exactly like the guard refusing the URL — which is
    // how this suite first went red for the wrong reason.
    await db.delete(webhooks).where(eq(webhooks.orgId, orgId));
  });

  afterAll(async () => {
    await db.delete(webhooks).where(eq(webhooks.orgId, orgId));
  });

  const register = (url: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/webhooks',
      headers: { cookie },
      payload: { url, events: ['contact.created'] },
    });

  describe('registration', () => {
    // Every URL the probe registered successfully.
    const refused = [
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost:3001/api/v1/internal/contacts/batch',
      'http://127.0.0.1:3001/api/v1/internal/consent/check-batch',
      'file:///c:/windows/win.ini',
      'http://[::1]:3001/api/v1/internal/ping',
      'http://0.0.0.0:3001/',
      'gopher://127.0.0.1:6379/_INFO',
      'http://10.0.0.1/',
      'http://192.168.1.1/admin',
      'http://100.64.0.1/',
    ];

    it.each(refused)('refuses %s', async (url) => {
      const res = await register(url);
      expect(res.statusCode).toBe(400);
      const body = res.json() as ErrorBody;
      // Usable, and without describing our network. The hostname the customer
      // typed is echoed back — they already know it — but the message must not
      // name the range, the resolved address, or anything about our topology.
      expect(body.message).toBeTruthy();
      const withoutEcho = body.message!.split(new URL(url).hostname).join('<host>');
      expect(withoutEcho).not.toMatch(/loopback|private|link-local|metadata|internal|reserved/i);
    });

    it('accepts a public domain', async () => {
      const res = await register('https://example.com/hooks/forgemsg');
      expect(res.statusCode).toBe(201);
      expect((res.json() as { data: { id: string } }).data.id).toBeTruthy();
    });

    it('refuses a blocked URL on update as well as create', async () => {
      const created = await register('https://example.com/hooks/update-probe');
      expect(created.statusCode).toBe(201);
      const id = (created.json() as { data: { id: string } }).data.id;

      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/webhooks/${id}`,
        headers: { cookie },
        payload: { url: 'http://169.254.169.254/' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('refuses an event name that is not in the supported list, on PUT too', async () => {
      const created = await register('https://example.com/hooks/events-probe');
      const id = (created.json() as { data: { id: string } }).data.id;

      for (const events of [['*'], ['contact.exploded']]) {
        const res = await app.inject({
          method: 'PUT',
          url: `/api/v1/webhooks/${id}`,
          headers: { cookie },
          payload: { events },
        });
        expect(res.statusCode, `events=${JSON.stringify(events)}`).toBe(400);
      }
    });
  });

  describe('test delivery', () => {
    it('refuses a row that got past registration, and never opens the socket', async () => {
      // The registration check would reject this URL, so the row is written
      // straight to the table — which is exactly the case that matters: a
      // webhook stored before the guard existed, or a hostname that resolved
      // publicly at registration and privately by delivery time. The guard has
      // to hold at connect time, not only at save time.
      let hits = 0;
      const server = http.createServer((_req, res) => {
        hits++;
        res.writeHead(200).end('INTERNAL');
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      const port = (server.address() as AddressInfo).port;

      try {
        const [row] = await db
          .insert(webhooks)
          .values({
            orgId,
            url: `http://127.0.0.1:${port}/internal`,
            secret: 'probe-secret',
            events: ['contact.created'],
          })
          .returning({ id: webhooks.id });

        const res = await app.inject({
          method: 'POST',
          url: `/api/v1/webhooks/${row!.id}/test`,
          headers: { cookie },
        });

        expect(res.statusCode).toBe(200);
        const body = (res.json() as { data: { success: boolean; blocked?: string } }).data;
        expect(body.success).toBe(false);
        expect(body.blocked, 'the refusal must be reported as a block').toBeTruthy();
        expect(body).not.toHaveProperty('statusCode');
        expect(hits, 'the internal listener must never have been connected to').toBe(0);

        await db.delete(webhooks).where(eq(webhooks.id, row!.id));
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
      }
    });

    it('accepts a host that does not resolve yet', async () => {
      // A staging endpoint may be registered before it is deployed, and "does
      // not resolve" is not something the delivery guard blocks either.
      const created = await register('https://example.invalid/hooks/nx');
      expect(created.statusCode).toBe(201);
    });
  });

  describe('delivery log', () => {
    it('never returns response_body over the API', async () => {
      const created = await register('https://example.com/hooks/log-probe');
      const id = (created.json() as { data: { id: string } }).data.id;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/webhooks/${id}/deliveries`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const rows = (res.json() as { data: Array<Record<string, unknown>> }).data;
      for (const row of rows) {
        expect(Object.keys(row)).not.toContain('responseBody');
        expect(Object.keys(row)).not.toContain('response_body');
      }
      // The status code stays, because that is what a customer debugging their
      // own receiver actually needs.
      expect(rows.every((r) => 'statusCode' in r || rows.length === 0)).toBe(true);
    });
  });
});
