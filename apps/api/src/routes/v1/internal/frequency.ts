/**
 * Internal frequency-cap batch check — runs the per-contact Redis
 * sorted-set check in parallel server-side and returns the contact IDs
 * that are currently capped. Avoids 1000 HTTP round-trips even though
 * the underlying check is per-contact (the cost is in connection setup,
 * not the Redis op itself).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { checkFrequencyCap, recordSend } from '../../../services/frequency-capping/index.js';
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

  /**
   * POST /api/v1/internal/frequency/record
   *
   * The write half of the cap, and until now it had no route at all.
   * batch-sender has always POSTed here after a successful hand-off
   * (batch-sender.ts, recordFrequencySend) — against a path nothing served.
   * fetch does not reject on 404, so its try/catch never ran and nothing was
   * ever logged: the send looked recorded.
   *
   * The consequence was not a missing statistic. checkFrequencyCap counts
   * members of the Redis sorted set that recordSend writes, and the only other
   * caller of recordSend in the repo is its own unit test — so the set was
   * always empty, and the frequency cap has never capped anything.
   */
  app.post(
    '/api/v1/internal/frequency/record',
    {
      schema: { tags: ['Internal'], summary: 'Record one send against the frequency cap' },
    },
    async (req, reply) => {
      const body = z
        .object({
          orgId: z.string().uuid(),
          contactId: z.string().uuid(),
          channel: channelEnum,
        })
        .parse(req.body);

      await recordSend({ orgId: body.orgId, contactId: body.contactId, channel: body.channel });
      return reply.send({ data: { recorded: true } });
    },
  );
};

export default internalFrequencyRoutes;
