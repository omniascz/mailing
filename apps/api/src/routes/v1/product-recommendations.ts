import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  alsoBought,
  topInCategory,
  personalisedFor,
  upsertProduct,
  listProducts,
  bulkUpsertProducts,
} from '../../services/product-recommendations/index.js';

const productSchema = z.object({
  sku: z.string().min(1).max(128),
  name: z.string().min(1).max(255),
  description: z.string().max(2048).optional(),
  price: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
  imageUrl: z.string().url().optional(),
  url: z.string().url().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  stock: z.number().int().optional(),
});

const productRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/products',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Products'] },
    },
    async (req, reply) => {
      return reply.send({ data: await listProducts(req.user!.orgId) });
    },
  );

  app.put(
    '/api/v1/products',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Products'] },
    },
    async (req, reply) => {
      const body = productSchema.parse(req.body);
      return reply.send({ data: await upsertProduct(req.user!.orgId, body) });
    },
  );

  app.post(
    '/api/v1/products/bulk',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Products'] },
    },
    async (req, reply) => {
      const body = z.object({ products: z.array(productSchema).max(500) }).parse(req.body);
      return reply.send({ data: await bulkUpsertProducts(req.user!.orgId, body.products) });
    },
  );

  app.get(
    '/api/v1/products/recommendations',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Products'] },
    },
    async (req, reply) => {
      const q = z
        .object({
          sku: z.string().optional(),
          category: z.string().optional(),
          contactId: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(24).default(6),
        })
        .parse(req.query);

      if (q.contactId)
        return reply.send({ data: await personalisedFor(req.user!.orgId, q.contactId, q.limit) });
      if (q.sku) return reply.send({ data: await alsoBought(req.user!.orgId, q.sku, q.limit) });
      if (q.category)
        return reply.send({ data: await topInCategory(req.user!.orgId, q.category, q.limit) });
      return reply
        .code(400)
        .send({ code: 'MISSING_FILTER', message: 'Provide contactId, sku, or category' });
    },
  );
};

export default productRoutes;
