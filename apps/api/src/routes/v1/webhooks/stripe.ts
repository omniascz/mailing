/**
 * Stripe webhook — isolated in its own encapsulated plugin so it can use a
 * raw-body content-type parser WITHOUT affecting any other route's JSON parsing.
 * Stripe signatures are computed over the exact request bytes, so we must verify
 * against the raw Buffer (not a re-serialized req.body, which would never match).
 */
import type { FastifyInstance } from 'fastify';
import { handleStripeWebhook } from '../../../services/commerce/payments.js';

export default async function stripeWebhookRoutes(app: FastifyInstance) {
  // Scoped to this encapsulated plugin only: keep req.body as parsed JSON for
  // ergonomics, but also stash the raw bytes on req.rawBody for signature checks.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = body as Buffer;
      try {
        const parsed = (body as Buffer).length ? JSON.parse((body as Buffer).toString('utf8')) : {};
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.post('/api/v1/webhooks/stripe', async (req, reply) => {
    const sig = (req.headers['stripe-signature'] as string) ?? '';
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from('');
    await handleStripeWebhook(raw, sig);
    return reply.code(200).send({ received: true });
  });
}
