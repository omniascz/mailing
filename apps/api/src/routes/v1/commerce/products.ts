import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../../../services/commerce/products.js';

const commerceProductRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };

  app.get('/api/v1/commerce/products', auth, async (req, reply) => {
    const q = z
      .object({
        active: z
          .enum(['true', 'false'])
          .optional()
          .transform((v) => (v != null ? v === 'true' : undefined)),
        limit: z.coerce.number().int().min(1).max(500).default(100),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const data = await listProducts(req.user!.orgId, q);
    return reply.send({ data });
  });

  app.get('/api/v1/commerce/products/:productId', auth, async (req, reply) => {
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    const data = await getProduct(req.user!.orgId, productId);
    return reply.send({ data });
  });

  app.post('/api/v1/commerce/products', auth, async (req, reply) => {
    const body = z
      .object({
        sku: z.string().min(1).max(128),
        name: z.string().min(1).max(255),
        description: z.string().max(2048).optional(),
        price: z.number().positive(),
        currency: z.string().length(3).default('USD'),
        imageUrl: z.string().url().optional(),
        url: z.string().url().optional(),
        categories: z.array(z.string()).default([]),
        tags: z.array(z.string()).default([]),
        stock: z.number().int().optional(),
        active: z.boolean().default(true),
      })
      .parse(req.body);
    const data = await createProduct(req.user!.orgId, body);
    return reply.code(201).send({ data });
  });

  app.patch('/api/v1/commerce/products/:productId', auth, async (req, reply) => {
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        name: z.string().max(255).optional(),
        description: z.string().max(2048).optional(),
        price: z.number().positive().optional(),
        currency: z.string().length(3).optional(),
        imageUrl: z.string().url().optional(),
        stock: z.number().int().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    const data = await updateProduct(req.user!.orgId, productId, body);
    return reply.send({ data });
  });

  app.delete('/api/v1/commerce/products/:productId', auth, async (req, reply) => {
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    await deleteProduct(req.user!.orgId, productId);
    return reply.code(204).send();
  });
};

export default commerceProductRoutes;
