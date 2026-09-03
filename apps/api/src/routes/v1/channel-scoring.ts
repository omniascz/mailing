/**
 * Channel Scoring read endpoints (§9 P1 Channel Scoring per recipient).
 *
 * The /smart_channel workflow node consumes the cached per-recipient
 * scores directly through the service layer; these endpoints exist so
 * the UI can render the "best channel" badge on a contact card and the
 * channel performance dashboard.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  getContactChannelScores,
  topContactsByChannel,
} from '../../services/channel-scoring/index.js';
import { CHANNEL_KINDS } from '../../services/channel-scoring/pure.js';

const channelScoringRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/contacts/:id/channel-scores',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['ChannelScoring'],
        summary: 'Get cached channel scores for a contact',
      },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const scores = await getContactChannelScores(req.user!.orgId, id);
      if (!scores) return reply.code(404).send({ error: 'No scores computed yet' });
      return reply.send({ data: scores });
    },
  );

  app.get(
    '/api/v1/channel-scoring/top',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['ChannelScoring'],
        summary: 'List top-scoring contacts for a single channel',
      },
    },
    async (req, reply) => {
      const { channel, limit } = z
        .object({
          channel: z.enum(CHANNEL_KINDS as unknown as [string, ...string[]]),
          limit: z.coerce.number().int().min(1).max(1000).optional(),
        })
        .parse(req.query);
      const rows = await topContactsByChannel(
        req.user!.orgId,
        channel as (typeof CHANNEL_KINDS)[number],
        limit,
      );
      return reply.send({ data: rows });
    },
  );
};

export default channelScoringRoutes;
