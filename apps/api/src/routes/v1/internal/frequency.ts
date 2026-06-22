/**
 * Internal frequency-cap batch check — runs the per-contact Redis
 * sorted-set check in parallel server-side and returns the contact IDs
 * that are currently capped. Avoids 1000 HTTP round-trips even though
 * the underlying check is per-contact (the cost is in connection setup,
 * not the Redis op itself).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { checkFrequencyCap } from '../../../services/frequency-capping/index.js';
import { canSend as smartCanSend } from '../../../services/smart-sending/index.js';

// FrequencyChannel in service excludes 'all' (that's a rule-level value, not a
// channel a contact actually receives on). 'in_app' isn't part of the frequency
// model either — in-app messages are server-rendered, not bound to a send cap.
const channelEnum = z.enum(['email', 'sms', 'whatsapp', 'push', 'voice']);

const internalFrequencyRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/frequency/check-batch',
    {
      schema: { tags: ['Internal'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          orgId: z.string().uuid(),
          contactIds: z.array(z.string().uuid()).max(1000),
          channel: channelEnum,
        })
        .parse(req.body);

      if (body.contactIds.length === 0) {
        return reply.send({ data: { capped: [] } });
      }

      // A contact is gated if EITHER the frequency-cap rule OR the
      // smart-sending fatigue rule (per-day / per-week / cooldown) blocks them.
      const results = await Promise.all(
        body.contactIds.map(async (contactId) => {
          const [freq, smart] = await Promise.all([
            checkFrequencyCap({ orgId: body.orgId, contactId, channel: body.channel }),
            smartCanSend(body.orgId, contactId, body.channel),
          ]);
          return freq.allowed && smart.allowed ? null : contactId;
        }),
      );

      const capped = results.filter((id): id is string => id !== null);
      return reply.send({ data: { capped } });
    },
  );
};

export default internalFrequencyRoutes;
