/**
 * Phone routes — VoIP dialing, WebRTC agent tokens, call routing admin (#249 + #251).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  placeOutboundCall,
  terminateCall,
  issueAgentToken,
  getVoipProvider,
} from '../../services/phone/voip.js';
import {
  createHuntGroup,
  listHuntGroups,
  updateHuntGroup,
  deleteHuntGroup,
  createIvrMenu,
  listIvrMenus,
  updateIvrMenu,
  deleteIvrMenu,
  setBusinessHours,
  getBusinessHours,
  route as routeInboundCall,
} from '../../services/phone/routing.js';

const phoneRoutes: FastifyPluginAsync = async (app) => {
  // ─── VoIP ──────────────────────────────────────────────────────────────────
  app.post(
    '/api/v1/phone/token',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Phone'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          provider: z.enum(['twilio', 'telnyx']).optional(),
        })
        .parse(req.body ?? {});
      return reply.send({ data: await issueAgentToken(req.user!.userId, body.provider) });
    },
  );

  app.post(
    '/api/v1/phone/dial',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Phone'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          from: z.string().min(3).max(64),
          to: z.string().min(3).max(64),
          callbackUrl: z.string().url(),
          provider: z.enum(['twilio', 'telnyx']).optional(),
          record: z.boolean().optional(),
          machineDetection: z.boolean().optional(),
          metadata: z.record(z.string(), z.string()).optional(),
        })
        .parse(req.body);
      const result = await placeOutboundCall(
        {
          orgId: req.user!.orgId,
          agentUserId: req.user!.userId,
          from: body.from,
          to: body.to,
          callbackUrl: body.callbackUrl,
          record: body.record,
          machineDetection: body.machineDetection,
          metadata: body.metadata,
        },
        body.provider,
      );
      return reply.code(201).send({ data: result });
    },
  );

  app.post(
    '/api/v1/phone/calls/:id/hangup',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Phone'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const body = z
        .object({ provider: z.enum(['twilio', 'telnyx']).optional() })
        .parse(req.body ?? {});
      await terminateCall(id, body.provider);
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/v1/phone/webhook/:provider',
    {
      // Webhooks are signature-verified, not session-authenticated
      schema: { tags: ['Phone'] },
    },
    async (req, reply) => {
      const { provider } = z.object({ provider: z.enum(['twilio', 'telnyx']) }).parse(req.params);
      const p = getVoipProvider(provider);
      const rawBody =
        (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ??
        (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));
      try {
        p.verifyWebhookSignature(rawBody, req.headers as Record<string, string>);
      } catch {
        return reply.code(401).send({ error: 'signature mismatch' });
      }
      const bodyObj =
        typeof req.body === 'object' && req.body !== null
          ? (req.body as Record<string, unknown>)
          : {};
      const parsed = p.parseWebhook(bodyObj);
      if (!parsed) return reply.code(204).send();

      // Route inbound calls through the IVR/routing engine
      if ('direction' in parsed && parsed.direction === 'inbound') {
        const decision = await routeInboundCall({
          orgId: (bodyObj.orgId as string) ?? (bodyObj.org_id as string) ?? '',
          from: parsed.from,
          to: parsed.to,
        });
        return reply.send({ data: decision });
      }
      return reply.send({ data: parsed });
    },
  );

  // ─── Routing admin (#251) ──────────────────────────────────────────────────
  app.get(
    '/api/v1/phone/hunt-groups',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Phone'] },
    },
    async (req, reply) => {
      return reply.send({ data: await listHuntGroups(req.user!.orgId) });
    },
  );

  app.post(
    '/api/v1/phone/hunt-groups',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Phone'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(255),
          strategy: z
            .enum(['ring-all', 'round-robin', 'least-idle', 'priority'])
            .default('ring-all'),
          memberUserIds: z.array(z.string().uuid()).min(1),
          ringTimeoutSeconds: z.number().int().min(5).max(300).default(30),
          overflowTarget: z.enum(['voicemail', 'voicebot', 'ivr', 'hangup']).default('voicemail'),
          overflowTargetId: z.string().uuid().optional(),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await createHuntGroup(req.user!.orgId, body) });
    },
  );

  app.patch(
    '/api/v1/phone/hunt-groups/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Phone'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          name: z.string().min(1).max(255).optional(),
          strategy: z.enum(['ring-all', 'round-robin', 'least-idle', 'priority']).optional(),
          memberUserIds: z.array(z.string().uuid()).optional(),
          ringTimeoutSeconds: z.number().int().min(5).max(300).optional(),
          overflowTarget: z.enum(['voicemail', 'voicebot', 'ivr', 'hangup']).optional(),
          overflowTargetId: z.string().uuid().optional(),
        })
        .parse(req.body);
      return reply.send({ data: await updateHuntGroup(req.user!.orgId, id, body) });
    },
  );

  app.delete(
    '/api/v1/phone/hunt-groups/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Phone'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteHuntGroup(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  app.get(
    '/api/v1/phone/ivr-menus',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Phone'] },
    },
    async (req, reply) => {
      return reply.send({ data: await listIvrMenus(req.user!.orgId) });
    },
  );

  app.post(
    '/api/v1/phone/ivr-menus',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Phone'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(255),
          greeting: z.string().max(2000),
          didNumber: z.string().min(3).max(64).optional(),
          options: z.array(
            z.object({
              digit: z.string().regex(/^[0-9*#]$/),
              label: z.string().max(255),
              action: z.enum([
                'hunt-group',
                'ivr-menu',
                'voicemail',
                'voicebot',
                'hangup',
                'external',
              ]),
              targetId: z.string().uuid().optional(),
              externalNumber: z.string().optional(),
            }),
          ),
          timeoutSeconds: z.number().int().min(3).max(120).default(10),
          invalidTarget: z.enum(['repeat', 'hangup', 'voicemail']).default('repeat'),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await createIvrMenu(req.user!.orgId, body) });
    },
  );

  app.patch(
    '/api/v1/phone/ivr-menus/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Phone'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z.record(z.string(), z.unknown()).parse(req.body);
      return reply.send({ data: await updateIvrMenu(req.user!.orgId, id, body as never) });
    },
  );

  app.delete(
    '/api/v1/phone/ivr-menus/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Phone'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteIvrMenu(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  app.get(
    '/api/v1/phone/business-hours',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Phone'] },
    },
    async (req, reply) => {
      return reply.send({ data: await getBusinessHours(req.user!.orgId) });
    },
  );

  app.put(
    '/api/v1/phone/business-hours',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Phone'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          timezone: z.string(),
          schedule: z.array(
            z.object({
              day: z.number().int().min(0).max(6),
              openMinutes: z.number().int().min(0).max(1440),
              closeMinutes: z.number().int().min(0).max(1440),
            }),
          ),
          holidays: z
            .array(
              z.object({
                date: z.string(),
                name: z.string().optional(),
              }),
            )
            .optional(),
          afterHoursTarget: z
            .enum(['voicemail', 'voicebot', 'external', 'hangup'])
            .default('voicemail'),
          afterHoursTargetId: z.string().uuid().optional(),
        })
        .parse(req.body);
      return reply.send({ data: await setBusinessHours(req.user!.orgId, body) });
    },
  );
};

export default phoneRoutes;
