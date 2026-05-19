/**
 * Per-channel consent CRUD (Sprint D.4).
 *
 *   GET    /api/v1/contacts/:id/consent             — read all channel states
 *   POST   /api/v1/contacts/:id/consent             — record/refresh opt-in
 *   DELETE /api/v1/contacts/:id/consent/:channel    — revoke
 *
 * Authenticated — internal admin operations. Public consent capture
 * (form submit → opt-in) goes through dedicated form-submit routes that
 * call recordConsent() server-side with source='web_form' + capture IP.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  recordConsent,
  revokeConsent,
  getChannelStates,
  KNOWN_CHANNELS,
} from '../../services/consent/index.js';

const idParam = z.object({ id: z.string().uuid() });

const channelChannelParam = z.object({
  id: z.string().uuid(),
  channel: z.enum(KNOWN_CHANNELS),
});

const recordSchema = z.object({
  channel: z.enum(KNOWN_CHANNELS),
  source: z.string().min(1).max(64),
  consentText: z.string().max(8000).optional(),
  ipAddress: z.string().max(45).optional(),
  userAgent: z.string().max(1024).optional(),
  importedFrom: z.string().max(64).optional(),
});

const revokeSchema = z.object({
  reason: z.string().max(255).optional(),
});

export default async function consentRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/contacts/:id/consent',
    {
      schema: {
        tags: ['Contacts', 'Consent'],
        summary: "Read contact's per-channel consent state",
      },
    },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const states = await getChannelStates(req.user!.orgId, id);
      // Convert Map → JSON-friendly array, in canonical channel order so
      // UI doesn't have to sort. Row already carries `channel` — spread
      // does the right thing.
      const data = KNOWN_CHANNELS.flatMap((ch) => {
        const row = states.get(ch);
        return row ? [row] : [];
      });
      return reply.send({ data });
    },
  );

  app.post(
    '/api/v1/contacts/:id/consent',
    {
      preHandler: [app.requireRole('admin', 'owner', 'editor')],
      schema: {
        tags: ['Contacts', 'Consent'],
        summary: 'Record (or refresh) per-channel opt-in',
      },
    },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const body = recordSchema.parse(req.body);
      const row = await recordConsent({
        orgId: req.user!.orgId,
        contactId: id,
        ...body,
      });
      return reply.code(201).send({ data: row });
    },
  );

  app.delete(
    '/api/v1/contacts/:id/consent/:channel',
    {
      preHandler: [app.requireRole('admin', 'owner', 'editor')],
      schema: {
        tags: ['Contacts', 'Consent'],
        summary: 'Revoke per-channel consent',
      },
    },
    async (req, reply) => {
      const { id, channel } = channelChannelParam.parse(req.params);
      const body = revokeSchema.parse(req.body ?? {});
      const row = await revokeConsent({
        orgId: req.user!.orgId,
        contactId: id,
        channel,
        reason: body.reason,
      });
      if (!row) return reply.code(204).send();
      return reply.send({ data: row });
    },
  );
}
