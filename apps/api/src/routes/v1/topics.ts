/**
 * Subscription topic management (authed) + public per-topic preference updates
 * via the preference-center signed token.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  listContactTopics,
  setContactTopicStatus,
} from '../../services/topics/index.js';
import { verifyTrackingToken } from '@forgemsg/shared';
import { AppError } from '../../lib/app-error.js';

const topicRoutes: FastifyPluginAsync = async (app) => {
  // ── Authed topic CRUD ─────────────────────────────────────────────────────
  app.get('/api/v1/topics', { preHandler: [app.requireAuth], schema: { tags: ['Topics'] } }, async (req) => ({
    data: await listTopics(req.user!.orgId),
  }));

  app.post(
    '/api/v1/topics',
    { preHandler: [app.requireAuth, app.requireRole('editor', 'admin', 'owner')], schema: { tags: ['Topics'] } },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(128),
          displayName: z.string().min(1).max(255),
          description: z.string().max(500).optional(),
          defaultStatus: z.enum(['opt_in', 'opt_out']).optional(),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await createTopic(req.user!.orgId, body) });
    },
  );

  app.patch(
    '/api/v1/topics/:id',
    { preHandler: [app.requireAuth, app.requireRole('editor', 'admin', 'owner')], schema: { tags: ['Topics'] } },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          displayName: z.string().min(1).max(255).optional(),
          description: z.string().max(500).optional(),
          defaultStatus: z.enum(['opt_in', 'opt_out']).optional(),
          active: z.boolean().optional(),
        })
        .parse(req.body);
      return { data: await updateTopic(req.user!.orgId, id, body) };
    },
  );

  app.delete(
    '/api/v1/topics/:id',
    { preHandler: [app.requireAuth, app.requireRole('editor', 'admin', 'owner')], schema: { tags: ['Topics'] } },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteTopic(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // ── Authed: a contact's topic preferences ─────────────────────────────────
  app.get(
    '/api/v1/contacts/:contactId/topics',
    { preHandler: [app.requireAuth], schema: { tags: ['Topics'] } },
    async (req) => {
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
      return { data: await listContactTopics(req.user!.orgId, contactId) };
    },
  );

  // ── Public: view/update topic prefs via preference-center token ────────────
  function resolvePrefToken(token: string): { orgId: string; contactId: string } {
    const payload = verifyTrackingToken(token) as
      | { type?: string; orgId?: string; contactId?: string }
      | null;
    if (!payload || payload.type !== 'pref' || !payload.orgId || !payload.contactId) {
      throw AppError.unauthorized('Invalid or expired token');
    }
    return { orgId: payload.orgId, contactId: payload.contactId };
  }

  app.get('/public/topics/:token', { schema: { tags: ['Topics'] } }, async (req) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.params);
    const { orgId, contactId } = resolvePrefToken(token);
    return { data: await listContactTopics(orgId, contactId) };
  });

  app.post('/public/topics/:token', { schema: { tags: ['Topics'] } }, async (req) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.params);
    const body = z
      .object({ topicId: z.string().uuid(), status: z.enum(['subscribed', 'unsubscribed']) })
      .parse(req.body);
    const { orgId, contactId } = resolvePrefToken(token);
    await setContactTopicStatus(orgId, contactId, body.topicId, body.status);
    return { data: { ok: true } };
  });
};

export default topicRoutes;
