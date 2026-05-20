/**
 * Universal inbox routes (#244). Webhook sinks from each channel arrive
 * at /api/v1/helpdesk/inbox/ingest; agents read the unified thread list
 * from /api/v1/helpdesk/inbox.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  routeInbound,
  recordOutbound,
  listInbox,
  getUnifiedContactHistory,
  type InboxChannel,
} from '../../../services/helpdesk/universal-inbox.js';

const CHANNEL_ENUM = [
  'email',
  'chat',
  'sms',
  'whatsapp',
  'voice',
  'messenger',
  'twitter',
  'instagram',
  'viber',
  'rcs',
  'telegram',
  'webchat',
] as const;

const universalInboxRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/helpdesk/inbox/ingest',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          channel: z.enum(CHANNEL_ENUM),
          externalThreadId: z.string().max(255).optional(),
          externalMessageId: z.string().max(255).optional(),
          identity: z.object({
            email: z.string().email().optional(),
            phone: z.string().max(32).optional(),
            socialId: z.string().max(255).optional(),
          }),
          body: z.string().min(1),
          subject: z.string().max(512).optional(),
          attachments: z.array(z.object({ url: z.string().url(), name: z.string() })).optional(),
          channelMetadata: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(req.body);

      const { channel, ...rest } = body;
      const result = await routeInbound({
        orgId: req.user!.orgId,
        channel: channel as InboxChannel,
        ...rest,
      });
      return reply.code(201).send({ data: result });
    },
  );

  app.post(
    '/api/v1/helpdesk/inbox/:ticketId/reply',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const { ticketId } = z.object({ ticketId: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          body: z.string().min(1),
          externalMessageId: z.string().max(255).optional(),
          attachments: z.array(z.object({ url: z.string().url(), name: z.string() })).optional(),
          internal: z.boolean().optional(),
        })
        .parse(req.body);
      const msg = await recordOutbound(req.user!.orgId, ticketId, {
        ...body,
        agentUserId: req.user!.userId,
      });
      return reply.code(201).send({ data: msg });
    },
  );

  app.get(
    '/api/v1/helpdesk/inbox',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const q = z
        .object({
          channel: z.enum(CHANNEL_ENUM).optional(),
          status: z.enum(['open', 'pending', 'closed']).optional(),
          assignedTo: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
          cursor: z.string().optional(),
        })
        .parse(req.query);
      const res = await listInbox(req.user!.orgId, {
        ...q,
        channel: q.channel as InboxChannel | undefined,
      });
      return reply.send(res);
    },
  );

  app.get(
    '/api/v1/helpdesk/inbox/contact/:contactId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
      const q = z
        .object({ limit: z.coerce.number().int().min(1).max(500).optional() })
        .parse(req.query);
      return reply.send({
        data: await getUnifiedContactHistory(req.user!.orgId, contactId, q.limit),
      });
    },
  );
};

export default universalInboxRoutes;
