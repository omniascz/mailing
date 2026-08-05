/**
 * Internal webhook delivery routes — the API side of the delivery worker.
 *
 * The worker in @forgemsg/workers never touches the database (see
 * invoice-reminder.ts for the pattern it follows), so both DB-writing steps of
 * a delivery live here:
 *
 *   POST /api/v1/internal/webhooks/deliver    one attempt
 *   POST /api/v1/internal/webhooks/exhausted  BullMQ gave up, record it
 *
 * The deliver route answers 200 for a settled delivery — success or terminally
 * failed — and 502 when the attempt should be repeated. That mapping is what
 * drives the retry: the worker's callInternal throws on a non-2xx, BullMQ sees
 * the throw and re-queues on its own backoff. Returning 200 with an "outcome:
 * retry" field would need the worker to re-derive the decision, and two places
 * deciding the same thing is how the old `retrying` status got stranded.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  deliverWebhook,
  markDeliveryFailed,
  RetryableDeliveryError,
} from '../../../services/webhooks/index.js';

const internalWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/webhooks/deliver',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const { deliveryId } = z.object({ deliveryId: z.string().uuid() }).parse(req.body);

      try {
        const result = await deliverWebhook(deliveryId);
        return reply.send({ data: result });
      } catch (err) {
        if (err instanceof RetryableDeliveryError) {
          // 502: we reached out on the caller's behalf and the far end did not
          // settle the request. The worker turns this into a thrown job, which
          // is what BullMQ needs to schedule the next attempt.
          return reply.status(502).send({
            code: 'WEBHOOK_DELIVERY_RETRY',
            message: err.message,
            statusCode: 502,
            details: { deliveryId, receiverStatus: err.statusCode ?? null },
          });
        }
        throw err;
      }
    },
  );

  /**
   * Called from the worker's `failed` handler once attempts are exhausted.
   * Separate from /deliver because by then there is nothing left to attempt —
   * this only records the outcome and applies the auto-disable rule.
   */
  app.post(
    '/api/v1/internal/webhooks/exhausted',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const { deliveryId, reason, attempts } = z
        .object({
          deliveryId: z.string().uuid(),
          reason: z.string().max(2000).optional(),
          attempts: z.number().int().min(0).optional(),
        })
        .parse(req.body);

      const result = await markDeliveryFailed(deliveryId, {
        responseBody: reason,
        attempts,
      });
      return reply.send({ data: result });
    },
  );
};

export default internalWebhookRoutes;
