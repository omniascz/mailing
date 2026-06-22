/**
 * Stripe webhook. Stripe signatures are computed over the exact request bytes,
 * so we verify against req.rawBody (the original Buffer preserved by the global
 * raw-body JSON parser in index.ts), not a re-serialized req.body.
 */
import type { FastifyInstance } from 'fastify';
import { handleStripeWebhook } from '../../../services/commerce/payments.js';

export default async function stripeWebhookRoutes(app: FastifyInstance) {
  app.post('/api/v1/webhooks/stripe', async (req, reply) => {
    const sig = (req.headers['stripe-signature'] as string) ?? '';
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from('');
    await handleStripeWebhook(raw, sig);
    return reply.code(200).send({ received: true });
  });
}
