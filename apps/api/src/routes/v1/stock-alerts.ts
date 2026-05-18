import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  subscribe as subscribeStock, listForContact as listStockForContact,
  notifyRestock, unsubscribe as unsubscribeStock, pendingBySku,
} from '../../services/back-in-stock/index.js';
import {
  subscribe as subscribePrice, listForContact as listPriceForContact,
  notifyPriceChange, unsubscribe as unsubscribePrice,
} from '../../services/price-drop/index.js';

const stockRoutes: FastifyPluginAsync = async (app) => {
  // ─── Back-in-stock ────────────────────────────────────────────────────────
  app.post('/api/v1/back-in-stock/subscribe', {
    preHandler: [app.authenticate],
    schema: { tags: ['StockAlerts'] },
  }, async (req, reply) => {
    const body = z.object({
      contactId: z.string().uuid(),
      sku: z.string().min(1).max(128),
      channel: z.enum(['email', 'sms', 'push', 'whatsapp']).optional(),
    }).parse(req.body);
    return reply.code(201).send({ data: await subscribeStock(req.user!.orgId, body) });
  });

  app.get('/api/v1/back-in-stock/contact/:contactId', {
    preHandler: [app.authenticate],
    schema: { tags: ['StockAlerts'] },
  }, async (req, reply) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    return reply.send({ data: await listStockForContact(contactId) });
  });

  app.delete('/api/v1/back-in-stock/:id', {
    preHandler: [app.authenticate],
    schema: { tags: ['StockAlerts'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await unsubscribeStock(id, req.user!.orgId);
    return reply.code(204).send();
  });

  app.post('/api/v1/back-in-stock/notify', {
    preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
    schema: { tags: ['StockAlerts'] },
  }, async (req, reply) => {
    const body = z.object({ sku: z.string().min(1) }).parse(req.body);
    return reply.send({ data: await notifyRestock(req.user!.orgId, body.sku) });
  });

  app.get('/api/v1/back-in-stock/pending', {
    preHandler: [app.authenticate],
    schema: { tags: ['StockAlerts'] },
  }, async (req, reply) => {
    return reply.send({ data: await pendingBySku(req.user!.orgId) });
  });

  // ─── Price-drop ───────────────────────────────────────────────────────────
  app.post('/api/v1/price-drop/subscribe', {
    preHandler: [app.authenticate],
    schema: { tags: ['StockAlerts'] },
  }, async (req, reply) => {
    const body = z.object({
      contactId: z.string().uuid(),
      sku: z.string().min(1).max(128),
      channel: z.enum(['email', 'sms', 'push', 'whatsapp']).optional(),
    }).parse(req.body);
    return reply.code(201).send({ data: await subscribePrice(req.user!.orgId, body) });
  });

  app.get('/api/v1/price-drop/contact/:contactId', {
    preHandler: [app.authenticate],
    schema: { tags: ['StockAlerts'] },
  }, async (req, reply) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    return reply.send({ data: await listPriceForContact(contactId) });
  });

  app.delete('/api/v1/price-drop/:id', {
    preHandler: [app.authenticate],
    schema: { tags: ['StockAlerts'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await unsubscribePrice(id, req.user!.orgId);
    return reply.code(204).send();
  });

  app.post('/api/v1/price-drop/notify', {
    preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
    schema: { tags: ['StockAlerts'] },
  }, async (req, reply) => {
    const body = z.object({
      sku: z.string().min(1), newPrice: z.number().nonnegative(),
    }).parse(req.body);
    return reply.send({ data: await notifyPriceChange(req.user!.orgId, body.sku, body.newPrice) });
  });
};

export default stockRoutes;
