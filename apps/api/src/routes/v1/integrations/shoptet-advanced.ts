import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getAbandonedCarts,
  getRecentOrders,
  getProductData,
  triggerReviewRequest,
} from '../../../services/integrations/shoptet-cart-recovery.js';

export default async function shoptetAdvancedRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /** GET /api/v1/integrations/shoptet/abandoned-carts */
  app.get('/api/v1/integrations/shoptet/abandoned-carts', async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
    const carts = await getAbandonedCarts(req.user!.orgId, q.limit);
    return { data: carts };
  });

  /** GET /api/v1/integrations/shoptet/recent-orders */
  app.get('/api/v1/integrations/shoptet/recent-orders', async (req) => {
    const q = z.object({ sinceHours: z.coerce.number().int().min(1).max(168).default(24) }).parse(req.query);
    const orders = await getRecentOrders(req.user!.orgId, q.sinceHours);
    return { data: orders };
  });

  /** GET /api/v1/integrations/shoptet/products/:productId/live */
  app.get('/api/v1/integrations/shoptet/products/:productId/live', async (req) => {
    const { productId } = z.object({ productId: z.string().min(1) }).parse(req.params);
    const product = await getProductData(req.user!.orgId, productId);
    return { data: product };
  });

  /** POST /api/v1/integrations/shoptet/orders/:orderId/review-request */
  app.post('/api/v1/integrations/shoptet/orders/:orderId/review-request', async (req) => {
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.params);
    const result = await triggerReviewRequest(req.user!.orgId, orderId);
    return { data: result };
  });
}
