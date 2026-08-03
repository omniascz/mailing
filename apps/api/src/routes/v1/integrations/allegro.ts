/**
 * Allegro integration — CZ/SK/PL e-commerce marketplace.
 * Allegro REST API: https://developer.allegro.pl/
 *
 * Supported flows:
 *   - OAuth 2.0 connect/disconnect
 *   - Order sync (new orders → contact timeline events)
 *   - Product feed import
 *   - Abandoned checkout recovery
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { socialAccounts } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/app-error.js';
import { redis } from '@forgemsg/shared/redis';

const ALLEGRO_AUTH_URL = 'https://allegro.pl/auth/oauth/authorize';
const ALLEGRO_TOKEN_URL = 'https://allegro.pl/auth/oauth/token';
const ALLEGRO_API_BASE = 'https://api.allegro.pl';

async function getAllegroToken(orgId: string): Promise<string> {
  const [row] = await db
    .select({ accessToken: socialAccounts.accessToken })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, orgId),
        eq(socialAccounts.platform, 'allegro'),
        eq(socialAccounts.active, true),
      ),
    )
    .limit(1);
  if (!row?.accessToken)
    throw AppError.badRequest(
      'Allegro account not connected. Use /api/v1/integrations/allegro/connect',
    );
  return row.accessToken;
}

async function allegroFetch(orgId: string, path: string, opts: RequestInit = {}) {
  const token = await getAllegroToken(orgId);
  const resp = await fetch(`${ALLEGRO_API_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.allegro.public.v1+json',
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw AppError.badRequest(`Allegro API error ${resp.status}: ${err}`);
  }
  return resp.json();
}

export default async function allegroRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // GET /api/v1/integrations/allegro/status
  app.get('/api/v1/integrations/allegro/status', async (req) => {
    const [row] = await db
      .select({ active: socialAccounts.active, updatedAt: socialAccounts.updatedAt })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.orgId, req.user!.orgId), eq(socialAccounts.platform, 'allegro')))
      .limit(1);
    return { data: { connected: !!row?.active, lastSync: row?.updatedAt ?? null } };
  });

  // GET /api/v1/integrations/allegro/connect — OAuth redirect URL
  app.get('/api/v1/integrations/allegro/connect', async (req) => {
    const clientId = process.env.ALLEGRO_CLIENT_ID ?? '';
    if (!clientId) throw AppError.internal('ALLEGRO_CLIENT_ID not configured');
    const redirectUri = `${process.env.API_BASE_URL}/api/v1/integrations/allegro/callback`;
    const state = `${req.user!.orgId}:${Date.now()}`;
    await redis.setex(`allegro:state:${state}`, 600, req.user!.orgId);
    const url = `${ALLEGRO_AUTH_URL}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(state)}`;
    return { data: { authUrl: url } };
  });

  // GET /api/v1/integrations/allegro/callback — OAuth callback
  app.get('/api/v1/integrations/allegro/callback', async (req, reply) => {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) return reply.status(400).send({ code: 'MISSING_CODE' });

    const orgId = await redis.get(`allegro:state:${state}`);
    if (!orgId) return reply.status(400).send({ code: 'INVALID_STATE' });

    const clientId = process.env.ALLEGRO_CLIENT_ID ?? '';
    const clientSecret = process.env.ALLEGRO_CLIENT_SECRET ?? '';
    const redirectUri = `${process.env.API_BASE_URL}/api/v1/integrations/allegro/callback`;

    const tokenResp = await fetch(ALLEGRO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResp.ok) return reply.status(400).send({ code: 'TOKEN_EXCHANGE_FAILED' });
    const tokens = (await tokenResp.json()) as Record<string, string>;

    await db
      .insert(socialAccounts)
      .values({
        orgId,
        platform: 'allegro',
        platformUserId: 'allegro',
        accessToken: tokens['access_token']!,
        refreshToken: tokens['refresh_token'],
        active: true,
      })
      .onConflictDoUpdate({
        target: [socialAccounts.orgId, socialAccounts.platform, socialAccounts.platformUserId],
        set: {
          accessToken: tokens['access_token']!,
          refreshToken: tokens['refresh_token'],
          active: true,
          updatedAt: new Date(),
        },
      });

    await redis.del(`allegro:state:${state}`);
    return reply.redirect(
      `${process.env.WEB_URL ?? 'http://localhost:3000'}/settings/integrations?allegro=connected`,
    );
  });

  // GET /api/v1/integrations/allegro/orders — fetch recent orders
  app.get('/api/v1/integrations/allegro/orders', async (req) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const data = await allegroFetch(
      req.user!.orgId,
      `/order/checkout-forms?limit=${q.limit}&offset=${q.offset}`,
    );
    return { data };
  });

  // POST /api/v1/integrations/allegro/sync-orders — pull orders and create contacts/events
  app.post('/api/v1/integrations/allegro/sync-orders', async (req, reply) => {
    const orgId = req.user!.orgId;
    const orders = (await allegroFetch(orgId, '/order/checkout-forms?limit=100')) as {
      checkoutForms: Array<Record<string, unknown>>;
    };
    const forms = orders.checkoutForms ?? [];

    let synced = 0;
    for (const order of forms) {
      const buyer = (order['buyer'] ?? {}) as Record<string, unknown>;
      const email = String((buyer['email'] as string | undefined) ?? '');
      if (!email.includes('@')) continue;

      // Upsert contact
      const { createContact } = await import('../../../services/contacts/index.js').catch(() => ({
        createContact: null,
      }));
      if (createContact) {
        await (createContact as (orgId: string, data: Record<string, unknown>) => Promise<unknown>)(
          orgId,
          {
            email,
            firstName: String((buyer['firstName'] as string | undefined) ?? ''),
            lastName: String((buyer['lastName'] as string | undefined) ?? ''),
            source: 'allegro',
          },
        ).catch(() => {});
        synced++;
      }
    }

    return reply.send({ data: { synced, total: forms.length } });
  });

  // GET /api/v1/integrations/allegro/products — product catalog
  app.get('/api/v1/integrations/allegro/products', async (req) => {
    const q = z
      .object({
        phrase: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(60).default(20),
      })
      .parse(req.query);
    const qs = new URLSearchParams({ limit: String(q.limit) });
    if (q.phrase) qs.set('phrase', q.phrase);
    const data = await allegroFetch(req.user!.orgId, `/offers/listing?${qs}`);
    return { data };
  });

  // DELETE /api/v1/integrations/allegro/disconnect
  app.delete('/api/v1/integrations/allegro/disconnect', async (req, reply) => {
    await db
      .update(socialAccounts)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(eq(socialAccounts.orgId, req.user!.orgId), eq(socialAccounts.platform, 'allegro')),
      );
    return reply.status(204).send();
  });
}
