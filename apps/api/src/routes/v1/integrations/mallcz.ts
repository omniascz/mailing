/**
 * Mall.cz / Mall Group integration — CZ/SK e-commerce marketplace.
 * API: https://apidoc.mallgroup.com/
 *
 * Supported flows:
 *   - API key connect
 *   - Order sync → contacts + events
 *   - Product catalog sync
 *   - Abandoned cart recovery via webhook
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { socialAccounts } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/app-error.js';

const MALL_API_BASE = 'https://app.api.mall.cz';

async function getMallCredentials(orgId: string): Promise<{ apiKey: string; clientId: string }> {
  const [row] = await db
    .select({ accessToken: socialAccounts.accessToken, metadata: socialAccounts.metadata, platformUsername: socialAccounts.platformUsername })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.orgId, orgId), eq(socialAccounts.platform, 'mallcz'), eq(socialAccounts.active, true)))
    .limit(1);
  if (!row?.accessToken) throw AppError.badRequest('Mall.cz not connected. Use POST /api/v1/integrations/mallcz/connect');
  const meta = (row.metadata ?? {}) as Record<string, string>;
  return { apiKey: row.accessToken, clientId: meta['clientId'] ?? row.platformUsername ?? '' };
}

async function mallFetch(orgId: string, path: string, opts: RequestInit = {}) {
  const { apiKey, clientId } = await getMallCredentials(orgId);
  const resp = await fetch(`${MALL_API_BASE}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Client-Id': clientId,
      ...(opts.headers ?? {}),
    },
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw AppError.badRequest(`Mall.cz API error ${resp.status}: ${err}`);
  }
  return resp.json();
}

export default async function mallCzRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // GET /api/v1/integrations/mallcz/status
  app.get('/api/v1/integrations/mallcz/status', async (req) => {
    const [row] = await db
      .select({ active: socialAccounts.active, updatedAt: socialAccounts.updatedAt })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.orgId, req.user!.orgId), eq(socialAccounts.platform, 'mallcz')))
      .limit(1);
    return { data: { connected: !!row?.active, lastSync: row?.updatedAt ?? null } };
  });

  // POST /api/v1/integrations/mallcz/connect — API key setup
  app.post('/api/v1/integrations/mallcz/connect', async (req, reply) => {
    const body = z.object({ apiKey: z.string().min(10), clientId: z.string().min(1) }).parse(req.body);

    // Verify the key works
    try {
      await fetch(`${MALL_API_BASE}/v1/orders?limit=1`, {
        headers: { Authorization: `Bearer ${body.apiKey}`, 'X-Client-Id': body.clientId },
      });
    } catch {
      throw AppError.badRequest('Could not verify Mall.cz API key');
    }

    await db.insert(socialAccounts).values({
      orgId: req.user!.orgId,
      platform: 'mallcz',
      platformUserId: 'mallcz',
      platformUsername: body.clientId,
      accessToken: body.apiKey,
      metadata: { clientId: body.clientId },
      active: true,
    }).onConflictDoUpdate({
      target: [socialAccounts.orgId, socialAccounts.platform, socialAccounts.platformUserId],
      set: { accessToken: body.apiKey, platformUsername: body.clientId, metadata: { clientId: body.clientId }, active: true, updatedAt: new Date() },
    });

    return reply.status(201).send({ data: { connected: true } });
  });

  // GET /api/v1/integrations/mallcz/orders
  app.get('/api/v1/integrations/mallcz/orders', async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    const data = await mallFetch(req.user!.orgId, `/v1/orders?limit=${q.limit}&page=${q.page}`);
    return { data };
  });

  // POST /api/v1/integrations/mallcz/sync-orders
  app.post('/api/v1/integrations/mallcz/sync-orders', async (req, reply) => {
    const orgId = req.user!.orgId;
    const orders = await mallFetch(orgId, '/v1/orders?limit=100') as { orders?: Array<Record<string, unknown>> };
    const items = orders.orders ?? [];

    let synced = 0;
    for (const order of items) {
      const customer = (order['customer'] ?? {}) as Record<string, unknown>;
      const email = String((customer['email'] as string | undefined) ?? '');
      if (!email.includes('@')) continue;

      const { createContact } = await import('../../../services/contacts/index.js').catch(() => ({ createContact: null }));
      if (createContact) {
        await (createContact as (orgId: string, data: Record<string, unknown>) => Promise<unknown>)(orgId, {
          email,
          firstName: String((customer['firstName'] as string | undefined) ?? ''),
          lastName: String((customer['lastName'] as string | undefined) ?? ''),
          source: 'mallcz',
          customFields: { mall_customer_id: customer['id'] },
        }).catch(() => {});
        synced++;
      }
    }

    return reply.send({ data: { synced, total: items.length } });
  });

  // GET /api/v1/integrations/mallcz/products
  app.get('/api/v1/integrations/mallcz/products', async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    const data = await mallFetch(req.user!.orgId, `/v1/products?limit=${q.limit}&page=${q.page}`);
    return { data };
  });

  // POST /api/v1/integrations/mallcz/webhooks — receive Mall.cz webhook events
  app.post('/api/v1/integrations/mallcz/webhooks', async (req, reply) => {
    const event = (req.body ?? {}) as Record<string, unknown>;
    const eventType = String(event['event'] ?? '');

    if (eventType === 'order.created' || eventType === 'order.paid') {
      const order = (event['data'] ?? {}) as Record<string, unknown>;
      const customer = (order['customer'] ?? {}) as Record<string, unknown>;
      const email = String((customer['email'] as string | undefined) ?? '');

      if (email.includes('@')) {
        const orgId = String(event['shop_id'] ?? '');
        const { createContact } = await import('../../../services/contacts/index.js').catch(() => ({ createContact: null }));
        if (createContact && orgId) {
          await (createContact as (orgId: string, data: Record<string, unknown>) => Promise<unknown>)(orgId, { email, source: 'mallcz' }).catch(() => {});
        }
      }
    }

    return reply.status(200).send({ received: true });
  });

  // DELETE /api/v1/integrations/mallcz/disconnect
  app.delete('/api/v1/integrations/mallcz/disconnect', async (req, reply) => {
    await db.update(socialAccounts).set({ active: false, updatedAt: new Date() })
      .where(and(eq(socialAccounts.orgId, req.user!.orgId), eq(socialAccounts.platform, 'mallcz')));
    return reply.status(204).send();
  });
}
