import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../lib/app-error.js';
import {
  subscribeBackInStock,
  subscribePriceDrop,
} from '../../services/stock-alerts/public-subscribe.js';
import {
  listForContact as listStockForContact,
  notifyRestock,
  unsubscribe as unsubscribeStock,
  pendingBySku,
} from '../../services/back-in-stock/index.js';
import {
  listForContact as listPriceForContact,
  notifyPriceChange,
  unsubscribe as unsubscribePrice,
} from '../../services/price-drop/index.js';

/**
 * A visitor asking to be told about one product is not an API client working
 * through a quota. The global limiter is keyed on the API key or the IP
 * (plugins/rate-limit.ts), so with a publishable key every shopper on a shop
 * shares ONE bucket — a single abuser would lock out every genuine visitor.
 * This limit is keyed on the key AND the caller's address, so one visitor's
 * flood costs that visitor and nobody else, and 10 an hour is far more than a
 * person browsing a shop will ever need.
 */
const PUBLIC_SUBSCRIBE_LIMIT = {
  max: 10,
  timeWindow: '1 hour',
  keyGenerator: (req: { headers: Record<string, unknown>; ip: string }) =>
    `stock-sub:${(req.headers['x-api-key'] as string) ?? 'anon'}:${req.ip}`,
};

/**
 * A publishable key may name an address, never a contact id.
 *
 * The key lives in page JS, so a caller holding it is anonymous in every way
 * that matters; letting it attach a subscription to a contact id would let a
 * page enumerate ids and subscribe strangers by handle. An address at least
 * names the person being subscribed. Secret keys and sessions keep `contactId`,
 * which is what the merchant's own backend has been using.
 */
function publicSafeBody(req: { user?: { isPublicKey?: boolean } }, body: unknown) {
  const parsed = z
    .object({
      contactId: z.string().uuid().optional(),
      email: z.string().email().max(255).optional(),
      sku: z.string().min(1).max(128),
      channel: z.enum(['email', 'sms', 'push', 'whatsapp']).optional(),
    })
    .parse(body);

  if (req.user?.isPublicKey && parsed.contactId) {
    throw AppError.forbidden('A publishable key must identify the subscriber by email');
  }
  if (!parsed.contactId && !parsed.email) {
    throw AppError.badRequest('Either contactId or email is required');
  }
  return parsed;
}

const stockRoutes: FastifyPluginAsync = async (app) => {
  // ─── Back-in-stock ────────────────────────────────────────────────────────
  // `authenticatePublic`, which is this repository's answer to "a page needs to
  // call this": it accepts the publishable `fm_pub_` key packages/web-sdk sends
  // as X-API-Key, AND it still accepts secret keys and sessions, so the
  // merchant backends already calling this keep working. POST /api/v1/events,
  // GET /api/v1/in-app/messages/sdk and POST /api/v1/push/devices sit behind
  // it, and push/devices is the precedent that matters here: a public WRITE.
  //
  // A signed per-product token was the alternative and is the wrong tool — it
  // would have to be issued, rotated and embedded per SKU, while the key
  // already carries the one fact this route needs, which is the org.
  app.post(
    '/api/v1/back-in-stock/subscribe',
    {
      preHandler: [app.authenticatePublic],
      config: { rateLimit: PUBLIC_SUBSCRIBE_LIMIT },
      schema: { tags: ['StockAlerts'] },
    },
    async (req, reply) => {
      const body = publicSafeBody(req, req.body);
      const out = await subscribeBackInStock(req.user!.orgId, body);
      // 202 either way. Answering differently for an address that opted out
      // would turn this into a way to test whether someone is on the list.
      return reply.code(202).send({ data: out });
    },
  );

  app.get(
    '/api/v1/back-in-stock/contact/:contactId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['StockAlerts'] },
    },
    async (req, reply) => {
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await listStockForContact(contactId) });
    },
  );

  app.delete(
    '/api/v1/back-in-stock/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['StockAlerts'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await unsubscribeStock(id, req.user!.orgId);
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/v1/back-in-stock/notify',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['StockAlerts'] },
    },
    async (req, reply) => {
      const body = z.object({ sku: z.string().min(1) }).parse(req.body);
      return reply.send({ data: await notifyRestock(req.user!.orgId, body.sku) });
    },
  );

  app.get(
    '/api/v1/back-in-stock/pending',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['StockAlerts'] },
    },
    async (req, reply) => {
      return reply.send({ data: await pendingBySku(req.user!.orgId) });
    },
  );

  // ─── Price-drop ───────────────────────────────────────────────────────────
  app.post(
    '/api/v1/price-drop/subscribe',
    {
      preHandler: [app.authenticatePublic],
      config: { rateLimit: PUBLIC_SUBSCRIBE_LIMIT },
      schema: { tags: ['StockAlerts'] },
    },
    async (req, reply) => {
      const body = publicSafeBody(req, req.body);
      return reply.code(202).send({ data: await subscribePriceDrop(req.user!.orgId, body) });
    },
  );

  app.get(
    '/api/v1/price-drop/contact/:contactId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['StockAlerts'] },
    },
    async (req, reply) => {
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await listPriceForContact(contactId) });
    },
  );

  app.delete(
    '/api/v1/price-drop/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['StockAlerts'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await unsubscribePrice(id, req.user!.orgId);
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/v1/price-drop/notify',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['StockAlerts'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          sku: z.string().min(1),
          newPrice: z.number().nonnegative(),
        })
        .parse(req.body);
      return reply.send({
        data: await notifyPriceChange(req.user!.orgId, body.sku, body.newPrice),
      });
    },
  );
};

export default stockRoutes;
