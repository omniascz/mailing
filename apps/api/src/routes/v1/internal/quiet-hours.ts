/**
 * Quiet hours for the send path, asked on its own.
 *
 * batch-sender already learns about quiet hours for broadcasts, but only as a
 * side effect of `/internal/frequency/check-batch` — which also applies the
 * volume cap and the holdout, both of which are campaign concepts. A triggered
 * send must be able to ask "is it night for this org right now?" WITHOUT
 * acquiring a frequency cap it never had: capping flow mail is a different
 * decision from not sending it at 3am, and bundling them would smuggle one in
 * under the other.
 *
 * Org + channel, not per contact, so it is one call per batch rather than one
 * per recipient — the window is an org setting (#135), and Klaviyo's is an
 * account setting too.
 *
 * `nextSendAt` comes back because the caller delays rather than drops: the
 * worker needs to know how long to wait, and computing that a second time in
 * the worker would be the two-implementations mistake #135 removed.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { isQuiet } from '../../../services/quiet-hours/index.js';

const channelEnum = z.enum(['email', 'sms', 'whatsapp', 'push', 'voice', 'all']);

const internalQuietHoursRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/quiet-hours/check',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const body = z
        .object({
          orgId: z.string().uuid(),
          channel: channelEnum.default('email'),
        })
        .parse(req.body);

      const result = await isQuiet(body.orgId, body.channel);
      return reply.send({
        data: {
          inQuietHours: result.inQuietHours,
          nextSendAt: result.nextSendAt ? result.nextSendAt.toISOString() : null,
        },
      });
    },
  );
};

export default internalQuietHoursRoutes;
