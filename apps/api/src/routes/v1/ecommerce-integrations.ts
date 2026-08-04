/**
 * E-commerce integration routes — #79 (Shopify), #80 (WooCommerce), #81 (BigCommerce / Magento / PrestaShop)
 *
 *  GET    /api/v1/ecommerce/connections               — list connections
 *  POST   /api/v1/ecommerce/connections               — create connection (WooCommerce / BigCommerce / Magento / PrestaShop)
 *  GET    /api/v1/ecommerce/connections/:id           — get connection
 *  DELETE /api/v1/ecommerce/connections/:id           — remove connection
 *  POST   /api/v1/ecommerce/connections/:id/test      — test connection health
 *
 *  GET    /api/v1/ecommerce/shopify/install           — start Shopify OAuth (redirect)
 *  GET    /api/v1/ecommerce/shopify/callback          — Shopify OAuth callback
 *  GET    /api/v1/ecommerce/shoptet/install           — start Shoptet OAuth (redirect) [#386]
 *  GET    /api/v1/ecommerce/shoptet/callback          — Shoptet OAuth callback
 *
 *  POST   /api/v1/ecommerce/webhooks/:platform        — receive platform webhooks (unauthenticated)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import { ecommerceConnections } from '../../db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { redis } from '@forgemsg/shared/redis';
import {
  listConnections,
  getConnection,
  createConnection,
  deleteConnection,
  testConnection,
  buildShopifyInstallUrl,
  exchangeShopifyCode,
  registerShopifyWebhooks,
  verifyShopifyWebhook,
  verifyWooCommerceWebhook,
  verifyBigCommerceWebhook,
  verifyShoptetWebhook,
  ingestOrder,
  normalizeShopifyOrder,
  normalizeWooCommerceOrder,
  normalizeBigCommerceOrder,
  normalizeMagentoOrder,
  normalizePrestaShopOrder,
  normalizeShoptetOrder,
  buildShoptetAuthorizeUrl,
  exchangeShoptetCode,
} from '../../services/ecommerce/index.js';
import type {
  ShopifyCredentials,
  WooCommerceCredentials,
  BigCommerceCredentials,
  MagentoCredentials,
  PrestaShopCredentials,
  ShoptetCredentials,
  UpgatesCredentials,
  FastCentrikCredentials,
} from '../../db/schema/index.js';
import { ingestFeed as ingestFastCentrikFeed } from '../../integrations/fastcentrik/index.js';
import { normalizeEshopUrl } from '../../integrations/shoptet/pure.js';
import {
  normalizeUpgatesAdminUrl,
  normalizeUpgatesOrderPayload,
  verifyUpgatesWebhookSignature,
  buildUpgatesAuthHeader,
} from '../../integrations/upgates/pure.js';

const ecommerceRoutes: FastifyPluginAsync = async (app) => {
  // ─── Connection list/get/delete ──────────────────────────────────────────────

  app.get(
    '/api/v1/ecommerce/connections',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['E-commerce'], summary: 'List e-commerce connections' },
    },
    async (req, reply) => {
      return reply.send({ data: await listConnections(req.user!.orgId) });
    },
  );

  app.get(
    '/api/v1/ecommerce/connections/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['E-commerce'], summary: 'Get e-commerce connection' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getConnection(req.user!.orgId, id) });
    },
  );

  app.delete(
    '/api/v1/ecommerce/connections/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['E-commerce'], summary: 'Remove e-commerce connection' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteConnection(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/v1/ecommerce/connections/:id/test',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['E-commerce'], summary: 'Test connection health' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const conn = await getConnection(req.user!.orgId, id);
      const result = await testConnection(conn);
      if (!result.ok) {
        await db
          .update(ecommerceConnections)
          .set({
            status: 'error',
            lastErrorAt: new Date(),
            lastErrorMessage: result.error ?? 'Test failed',
          })
          .where(eq(ecommerceConnections.id, id));
      } else {
        await db
          .update(ecommerceConnections)
          .set({ status: 'active', lastErrorAt: null, lastErrorMessage: null })
          .where(eq(ecommerceConnections.id, id));
      }
      return reply.send({ data: result });
    },
  );

  // ─── Create connection (non-OAuth platforms) ─────────────────────────────────

  app.post(
    '/api/v1/ecommerce/connections',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: {
        tags: ['E-commerce'],
        summary: 'Create WooCommerce / BigCommerce / Magento / PrestaShop connection',
      },
    },
    async (req, reply) => {
      const body = z
        .discriminatedUnion('platform', [
          z.object({
            platform: z.literal('woocommerce'),
            name: z.string().min(1).max(255),
            storeUrl: z.string().url(),
            consumerKey: z.string().min(1),
            consumerSecret: z.string().min(1),
            webhookSecret: z.string().optional(),
          }),
          z.object({
            platform: z.literal('bigcommerce'),
            name: z.string().min(1).max(255),
            storeHash: z.string().min(1),
            accessToken: z.string().min(1),
            clientId: z.string().min(1),
            clientSecret: z.string().min(1),
            webhookSecret: z.string().optional(),
          }),
          z.object({
            platform: z.literal('magento'),
            name: z.string().min(1).max(255),
            baseUrl: z.string().url(),
            accessToken: z.string().min(1),
            webhookSecret: z.string().optional(),
          }),
          z.object({
            platform: z.literal('prestashop'),
            name: z.string().min(1).max(255),
            baseUrl: z.string().url(),
            apiKey: z.string().min(1),
            webhookSecret: z.string().optional(),
          }),
        ])
        .parse(req.body);

      const { platform, name, ...rest } = body;
      const conn = await createConnection(req.user!.orgId, {
        platform,
        name,
        credentials: rest as
          | WooCommerceCredentials
          | BigCommerceCredentials
          | MagentoCredentials
          | PrestaShopCredentials,
      });
      return reply.code(201).send({ data: conn });
    },
  );

  // ─── Shopify OAuth ────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/ecommerce/shopify/install',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['E-commerce'], summary: 'Start Shopify OAuth install flow' },
    },
    async (req, reply) => {
      const { shop, name } = z
        .object({
          shop: z.string().regex(/^[a-zA-Z0-9-]+\.myshopify\.com$/),
          name: z.string().min(1).max(255).optional(),
        })
        .parse(req.query);

      // Generate CSRF state
      const state = crypto.randomBytes(16).toString('hex');
      const stateKey = `shopify:oauth:state:${state}`;
      await redis.set(
        stateKey,
        JSON.stringify({ orgId: req.user!.orgId, shop, name: name ?? shop }),
        'EX',
        600,
      );

      const installUrl = buildShopifyInstallUrl(shop, state);
      return reply.redirect(installUrl);
    },
  );

  app.get(
    '/api/v1/ecommerce/shopify/callback',
    {
      schema: { tags: ['E-commerce'], summary: 'Shopify OAuth callback' },
    },
    async (req, reply) => {
      const { code, shop, state } = z
        .object({
          code: z.string(),
          shop: z.string(),
          state: z.string(),
        })
        .parse(req.query);

      // Validate state
      const stateKey = `shopify:oauth:state:${state}`;
      const stateRaw = await redis.get(stateKey);
      if (!stateRaw) {
        return reply
          .code(400)
          .send({ code: 'INVALID_STATE', message: 'OAuth state expired or invalid' });
      }
      const { orgId, name } = JSON.parse(stateRaw) as { orgId: string; shop: string; name: string };
      await redis.del(stateKey);

      // Exchange code for access token
      const { accessToken, scope } = await exchangeShopifyCode(shop, code);

      // Save connection
      const credentials: ShopifyCredentials = {
        shopDomain: shop,
        accessToken,
        scopes: scope.split(','),
      };
      const conn = await createConnection(orgId, { platform: 'shopify', name, credentials });

      // Register webhooks (fire-and-forget)
      registerShopifyWebhooks(shop, accessToken).catch(() => {});

      // Redirect to frontend success page
      const webBase = process.env.WEB_BASE_URL ?? 'https://app.forgemsg.io';
      return reply.redirect(`${webBase}/settings/integrations/ecommerce/${conn.id}?installed=1`);
    },
  );

  // ─── Shoptet OAuth (#366/#386) ────────────────────────────────────────────────

  app.get(
    '/api/v1/ecommerce/shoptet/install',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['E-commerce'], summary: 'Start Shoptet OAuth install flow' },
    },
    async (req, reply) => {
      const { eshop, name } = z
        .object({
          eshop: z.string().min(4).max(255),
          name: z.string().min(1).max(255).optional(),
        })
        .parse(req.query);

      const eshopUrl = normalizeEshopUrl(eshop);
      const state = crypto.randomBytes(16).toString('hex');
      const stateKey = `shoptet:oauth:state:${state}`;
      await redis.set(
        stateKey,
        JSON.stringify({ orgId: req.user!.orgId, eshopUrl, name: name ?? eshopUrl }),
        'EX',
        600,
      );

      return reply.redirect(buildShoptetAuthorizeUrl(eshopUrl, state));
    },
  );

  app.get(
    '/api/v1/ecommerce/shoptet/callback',
    {
      schema: { tags: ['E-commerce'], summary: 'Shoptet OAuth callback' },
    },
    async (req, reply) => {
      const { code, state } = z
        .object({
          code: z.string(),
          state: z.string(),
          eshop_url: z.string().optional(),
        })
        .parse(req.query);

      const stateKey = `shoptet:oauth:state:${state}`;
      const stateRaw = await redis.get(stateKey);
      if (!stateRaw) {
        return reply
          .code(400)
          .send({ code: 'INVALID_STATE', message: 'OAuth state expired or invalid' });
      }
      const { orgId, eshopUrl, name } = JSON.parse(stateRaw) as {
        orgId: string;
        eshopUrl: string;
        name: string;
      };
      await redis.del(stateKey);

      const tokens = await exchangeShoptetCode(eshopUrl, code);

      const credentials: ShoptetCredentials = {
        eshopUrl,
        accessToken: tokens.accessToken,
        ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
        ...(tokens.expiresIn
          ? { accessTokenExpiresAt: Math.floor(Date.now() / 1000) + tokens.expiresIn }
          : {}),
        ...(tokens.scope ? { scopes: tokens.scope.split(' ') } : {}),
      };
      const conn = await createConnection(orgId, { platform: 'shoptet', name, credentials });

      const webBase = process.env.WEB_BASE_URL ?? 'https://app.forgemsg.io';
      return reply.redirect(`${webBase}/settings/integrations/ecommerce/${conn.id}?installed=1`);
    },
  );

  // ─── FastCentrik install + manual pull (#392) ────────────────────────────────

  app.post(
    '/api/v1/ecommerce/fastcentrik/install',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['E-commerce'], summary: 'Register a FastCentrik feed connection' },
    },
    async (req, reply) => {
      const body = z
        .object({
          eshopUrl: z.string().url(),
          feedUrl: z.string().url(),
          feedUsername: z.string().min(1).max(128).optional(),
          feedPassword: z.string().min(1).max(256).optional(),
          name: z.string().min(1).max(255).optional(),
        })
        .parse(req.body);

      const credentials: FastCentrikCredentials = {
        eshopUrl: body.eshopUrl,
        feedUrl: body.feedUrl,
        ...(body.feedUsername ? { feedUsername: body.feedUsername } : {}),
        ...(body.feedPassword ? { feedPassword: body.feedPassword } : {}),
      };
      const conn = await createConnection(req.user!.orgId, {
        platform: 'fastcentrik',
        name: body.name ?? new URL(body.eshopUrl).hostname,
        credentials,
      });
      return reply.code(201).send({ data: conn });
    },
  );

  app.post(
    '/api/v1/ecommerce/fastcentrik/:connectionId/pull',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['E-commerce'], summary: 'Manually pull FastCentrik feed now' },
    },
    async (req, reply) => {
      const { connectionId } = z.object({ connectionId: z.string().uuid() }).parse(req.params);
      const conn = await getConnection(req.user!.orgId, connectionId);
      if (conn.platform !== 'fastcentrik') {
        return reply
          .code(400)
          .send({ code: 'WRONG_PLATFORM', message: 'Not a FastCentrik connection' });
      }
      const result = await ingestFastCentrikFeed(conn);
      return reply.send({ data: result });
    },
  );

  // ─── Upgates install (API-key, no OAuth) (#390) ───────────────────────────────

  app.post(
    '/api/v1/ecommerce/upgates/install',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['E-commerce'], summary: 'Install Upgates connection (API key)' },
    },
    async (req, reply) => {
      const body = z
        .object({
          adminUrl: z.string().min(4).max(255),
          apiLogin: z.string().min(1).max(128),
          apiKey: z.string().min(1).max(256),
          webhookSecret: z.string().min(1).max(256).optional(),
          name: z.string().min(1).max(255).optional(),
        })
        .parse(req.body);

      const adminUrl = normalizeUpgatesAdminUrl(body.adminUrl);
      const authHeader = buildUpgatesAuthHeader(body.apiLogin, body.apiKey);

      // Validate credentials by hitting a cheap read endpoint
      const ping = await fetch(`${adminUrl}/api/v2/eshop`, {
        headers: { Authorization: authHeader, Accept: 'application/json' },
      });
      if (!ping.ok) {
        return reply
          .code(400)
          .send({ code: 'UPGATES_AUTH_FAILED', message: `Upgates API returned ${ping.status}` });
      }

      const credentials: UpgatesCredentials = {
        adminUrl,
        apiLogin: body.apiLogin,
        apiKey: body.apiKey,
        ...(body.webhookSecret ? { webhookSecret: body.webhookSecret } : {}),
      };
      const conn = await createConnection(req.user!.orgId, {
        platform: 'upgates',
        name: body.name ?? new URL(adminUrl).hostname,
        credentials,
      });
      return reply.code(201).send({ data: conn });
    },
  );

  // ─── Webhook receivers (unauthenticated, verified by signature) ───────────────

  // Shopify webhook
  app.post(
    '/api/v1/ecommerce/webhooks/shopify',
    {
      schema: { tags: ['E-commerce'], summary: 'Receive Shopify webhook' },
    },
    async (req, reply) => {
      const shopDomain = req.headers['x-shopify-shop-domain'] as string;
      const hmac = req.headers['x-shopify-hmac-sha256'] as string;
      const topic = req.headers['x-shopify-topic'] as string;

      if (!shopDomain || !hmac) {
        return reply
          .code(400)
          .send({ code: 'MISSING_HEADERS', message: 'Shopify headers missing' });
      }

      // Find the connection by shop domain
      const rawBody =
        (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ??
        JSON.stringify(req.body);
      const [conn] = await db
        .select()
        .from(ecommerceConnections)
        .where(
          and(
            eq(ecommerceConnections.platform, 'shopify'),
            eq(ecommerceConnections.status, 'active'),
          ),
        )
        .limit(50); // scan up to 50 — filter by domain below

      if (!conn) return reply.code(204).send();

      const creds = conn.credentials as ShopifyCredentials;
      if (creds.shopDomain !== shopDomain) return reply.code(204).send();
      if (creds.webhookSecret && !verifyShopifyWebhook(rawBody, hmac, creds.webhookSecret)) {
        return reply.code(401).send({ code: 'INVALID_SIGNATURE', message: 'HMAC mismatch' });
      }

      if (topic === 'orders/create' || topic === 'orders/updated') {
        const order = normalizeShopifyOrder(req.body as Record<string, unknown>);
        await ingestOrder(conn, order).catch(() => {});
      }

      return reply.code(200).send({ received: true });
    },
  );

  // Upgates webhook (#390)
  app.post(
    '/api/v1/ecommerce/webhooks/upgates/:connectionId',
    {
      schema: { tags: ['E-commerce'], summary: 'Receive Upgates webhook' },
    },
    async (req, reply) => {
      const { connectionId } = z.object({ connectionId: z.string().uuid() }).parse(req.params);
      const signature = (req.headers['x-upgates-signature'] as string) ?? '';
      const topic = (req.headers['x-upgates-event'] as string) ?? '';
      const rawBody =
        (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ??
        JSON.stringify(req.body);

      const [conn] = await db
        .select()
        .from(ecommerceConnections)
        .where(
          and(
            eq(ecommerceConnections.id, connectionId),
            eq(ecommerceConnections.platform, 'upgates'),
          ),
        )
        .limit(1);

      if (!conn) return reply.code(204).send();

      const creds = conn.credentials as UpgatesCredentials;
      if (
        creds.webhookSecret &&
        !verifyUpgatesWebhookSignature(rawBody, signature, creds.webhookSecret)
      ) {
        return reply.code(401).send({ code: 'INVALID_SIGNATURE', message: 'HMAC mismatch' });
      }

      const orderTopics = new Set([
        'order.created',
        'order.updated',
        'order/create',
        'order/update',
      ]);
      if (orderTopics.has(topic)) {
        const order = normalizeUpgatesOrderPayload(req.body as Record<string, unknown>);
        await ingestOrder(conn, order).catch(() => {});
      }

      return reply.code(200).send({ received: true });
    },
  );

  // Shoptet webhook (#386)
  app.post(
    '/api/v1/ecommerce/webhooks/shoptet/:connectionId',
    {
      schema: { tags: ['E-commerce'], summary: 'Receive Shoptet webhook' },
    },
    async (req, reply) => {
      const { connectionId } = z.object({ connectionId: z.string().uuid() }).parse(req.params);
      const signature = (req.headers['x-shoptet-signature'] as string) ?? '';
      const topic = (req.headers['x-shoptet-event'] as string) ?? '';
      const rawBody =
        (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ??
        JSON.stringify(req.body);

      const [conn] = await db
        .select()
        .from(ecommerceConnections)
        .where(
          and(
            eq(ecommerceConnections.id, connectionId),
            eq(ecommerceConnections.platform, 'shoptet'),
          ),
        )
        .limit(1);

      if (!conn) return reply.code(204).send();

      const creds = conn.credentials as ShoptetCredentials;
      if (creds.webhookSecret && !verifyShoptetWebhook(rawBody, signature, creds.webhookSecret)) {
        return reply.code(401).send({ code: 'INVALID_SIGNATURE', message: 'HMAC mismatch' });
      }

      const orderTopics = new Set(['order/create', 'order/update', 'order.create', 'order.update']);
      if (orderTopics.has(topic)) {
        const order = normalizeShoptetOrder(req.body as Record<string, unknown>);
        await ingestOrder(conn, order).catch(() => {});
      }

      return reply.code(200).send({ received: true });
    },
  );

  // WooCommerce webhook
  app.post(
    '/api/v1/ecommerce/webhooks/woocommerce/:connectionId',
    {
      schema: { tags: ['E-commerce'], summary: 'Receive WooCommerce webhook' },
    },
    async (req, reply) => {
      const { connectionId } = z.object({ connectionId: z.string().uuid() }).parse(req.params);
      const signature = req.headers['x-wc-webhook-signature'] as string;
      const topic = req.headers['x-wc-webhook-topic'] as string;
      const rawBody =
        (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ??
        JSON.stringify(req.body);

      const [conn] = await db
        .select()
        .from(ecommerceConnections)
        .where(eq(ecommerceConnections.id, connectionId))
        .limit(1);

      if (!conn) return reply.code(204).send();

      const creds = conn.credentials as WooCommerceCredentials;
      if (
        creds.webhookSecret &&
        !verifyWooCommerceWebhook(rawBody, signature, creds.webhookSecret)
      ) {
        return reply.code(401).send({ code: 'INVALID_SIGNATURE', message: 'HMAC mismatch' });
      }

      if (topic === 'order.created' || topic === 'order.updated') {
        const order = normalizeWooCommerceOrder(req.body as Record<string, unknown>);
        await ingestOrder(conn, order).catch(() => {});
      }

      return reply.code(200).send({ received: true });
    },
  );

  // BigCommerce webhook
  app.post(
    '/api/v1/ecommerce/webhooks/bigcommerce/:connectionId',
    {
      schema: { tags: ['E-commerce'], summary: 'Receive BigCommerce webhook' },
    },
    async (req, reply) => {
      const { connectionId } = z.object({ connectionId: z.string().uuid() }).parse(req.params);
      const signature = (req.headers['x-bc-signature'] as string) ?? '';
      const rawBody =
        (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ??
        JSON.stringify(req.body);

      const [conn] = await db
        .select()
        .from(ecommerceConnections)
        .where(eq(ecommerceConnections.id, connectionId))
        .limit(1);

      if (!conn) return reply.code(204).send();

      const creds = conn.credentials as BigCommerceCredentials;
      if (
        creds.webhookSecret &&
        !verifyBigCommerceWebhook(rawBody, signature, creds.webhookSecret)
      ) {
        return reply.code(401).send({ code: 'INVALID_SIGNATURE', message: 'HMAC mismatch' });
      }

      const scope = ((req.body as Record<string, unknown>).scope as string) ?? '';
      if (scope.includes('store/order')) {
        // BigCommerce sends a thin event; we'd fetch the full order via REST in production.
        // For now we log the event for async processing.
        const data = ((req.body as Record<string, unknown>).data as Record<string, unknown>) ?? {};
        if (data.id) {
          const order = normalizeBigCommerceOrder({ id: data.id, ...data });
          await ingestOrder(conn, order).catch(() => {});
        }
      }

      return reply.code(200).send({ received: true });
    },
  );

  // Magento / PrestaShop — REST push webhook (custom trigger)
  app.post(
    '/api/v1/ecommerce/webhooks/generic/:connectionId',
    {
      schema: { tags: ['E-commerce'], summary: 'Receive Magento / PrestaShop order webhook' },
    },
    async (req, reply) => {
      const { connectionId } = z.object({ connectionId: z.string().uuid() }).parse(req.params);
      const secret = req.headers['x-webhook-secret'] as string;

      const [conn] = await db
        .select()
        .from(ecommerceConnections)
        .where(eq(ecommerceConnections.id, connectionId))
        .limit(1);

      if (!conn) return reply.code(204).send();

      const credAny = conn.credentials as unknown as Record<string, unknown>;
      if (credAny['webhookSecret']) {
        const expected = credAny['webhookSecret'] as string;
        if (secret !== expected) {
          return reply
            .code(401)
            .send({ code: 'INVALID_SECRET', message: 'Webhook secret mismatch' });
        }
      }

      const raw = req.body as Record<string, unknown>;
      let order;
      if (conn.platform === 'magento') {
        order = normalizeMagentoOrder(raw);
      } else if (conn.platform === 'prestashop') {
        order = normalizePrestaShopOrder(raw);
      } else {
        return reply.code(400).send({ code: 'UNSUPPORTED_PLATFORM' });
      }

      await ingestOrder(conn, order).catch(() => {});
      return reply.code(200).send({ received: true });
    },
  );
};

export default ecommerceRoutes;
