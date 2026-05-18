/**
 * Abuse detection admin routes.
 *
 *  Rules:
 *   - GET    /api/v1/abuse/rules              — list rules (global + org)
 *   - POST   /api/v1/abuse/rules              — create org-override rule
 *   - PUT    /api/v1/abuse/rules/:id          — update org rule
 *
 *  Events:
 *   - GET    /api/v1/abuse/events             — list abuse events
 *   - GET    /api/v1/abuse/events/:id         — get event detail
 *   - POST   /api/v1/abuse/events/:id/resolve — resolve / ack / dismiss
 *
 *  Sanctions:
 *   - GET    /api/v1/abuse/sanctions          — list active sanctions
 *   - POST   /api/v1/abuse/sanctions/:id/lift — manually lift sanction
 *   - GET    /api/v1/abuse/status             — sending allowed?
 *
 *  Spam traps:
 *   - POST   /api/v1/abuse/spam-traps         — add address to trap list (admin)
 *   - POST   /api/v1/abuse/check-trap         — check email against trap list
 *
 *  Signals (for internal workers / tests):
 *   - POST   /api/v1/abuse/signals            — submit observed signal
 *
 *  System:
 *   - POST   /api/v1/abuse/seed-rules         — seed default system rules
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listRules,
  createRule,
  updateRule,
  listEvents,
  getEvent,
  resolveEvent,
  listActiveSanctions,
  liftSanction,
  checkSendingAllowed,
  addSpamTrap,
  checkSpamTrap,
  evaluateSignal,
  seedSystemRules,
} from '../../services/abuse-detection/index.js';

const idParam = z.object({ id: z.string().uuid() });

const signalTypeEnum = z.enum([
  'high_bounce_rate',
  'high_complaint_rate',
  'spam_trap_hit',
  'honeypot_hit',
  'volume_spike',
  'list_quality_low',
  'new_account_high_volume',
  'blacklist_hit',
  'content_spam_score',
  'suspicious_login',
  'api_abuse',
  'credential_stuffing',
  'stale_list_send',
]);

const severityEnum = z.enum(['info', 'low', 'medium', 'high', 'critical']);
const actionEnum = z.enum([
  'none',
  'alert',
  'throttle',
  'pause_campaigns',
  'suspend_sending',
  'suspend_account',
  'require_review',
]);

const routes: FastifyPluginAsync = async (app) => {
  // ─── Rules ───────────────────────────────────────────────────────────────
  app.get(
    '/api/v1/abuse/rules',
    { preHandler: [app.authenticate], schema: { tags: ['Abuse Detection'] } },
    async (req) => ({ data: await listRules(req.user!.orgId) }),
  );

  app.post(
    '/api/v1/abuse/rules',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['Abuse Detection'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(100),
          description: z.string().max(1000).optional(),
          signalType: signalTypeEnum,
          threshold: z.number(),
          windowMinutes: z.number().int().min(1).max(10080).optional(),
          minSampleSize: z.number().int().min(0).optional(),
          severity: severityEnum.optional(),
          action: actionEnum.optional(),
          enabled: z.boolean().optional(),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await createRule(req.user!.orgId, body) });
    },
  );

  app.put(
    '/api/v1/abuse/rules/:id',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['Abuse Detection'] },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const patch = z
        .object({
          name: z.string().min(1).max(100).optional(),
          description: z.string().max(1000).optional(),
          threshold: z.number().optional(),
          windowMinutes: z.number().int().min(1).max(10080).optional(),
          minSampleSize: z.number().int().min(0).optional(),
          severity: severityEnum.optional(),
          action: actionEnum.optional(),
          enabled: z.boolean().optional(),
        })
        .parse(req.body);
      return { data: await updateRule(req.user!.orgId, id, patch) };
    },
  );

  // ─── Events ──────────────────────────────────────────────────────────────
  app.get(
    '/api/v1/abuse/events',
    { preHandler: [app.authenticate], schema: { tags: ['Abuse Detection'] } },
    async (req) => {
      const q = z
        .object({
          status: z
            .enum(['open', 'acknowledged', 'investigating', 'resolved', 'false_positive'])
            .optional(),
          severity: severityEnum.optional(),
          limit: z.coerce.number().int().min(1).max(500).optional(),
        })
        .parse(req.query);
      return { data: await listEvents(req.user!.orgId, q) };
    },
  );

  app.get(
    '/api/v1/abuse/events/:id',
    { preHandler: [app.authenticate], schema: { tags: ['Abuse Detection'] } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await getEvent(req.user!.orgId, id) };
    },
  );

  app.post(
    '/api/v1/abuse/events/:id/resolve',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['Abuse Detection'] },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          status: z.enum(['acknowledged', 'investigating', 'resolved', 'false_positive']),
          notes: z.string().max(2000).optional(),
        })
        .parse(req.body);
      return {
        data: await resolveEvent(req.user!.orgId, id, req.user!.userId, body),
      };
    },
  );

  // ─── Sanctions ───────────────────────────────────────────────────────────
  app.get(
    '/api/v1/abuse/sanctions',
    { preHandler: [app.authenticate], schema: { tags: ['Abuse Detection'] } },
    async (req) => ({ data: await listActiveSanctions(req.user!.orgId) }),
  );

  app.post(
    '/api/v1/abuse/sanctions/:id/lift',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['Abuse Detection'] },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await liftSanction(req.user!.orgId, id, req.user!.userId) };
    },
  );

  app.get(
    '/api/v1/abuse/status',
    { preHandler: [app.authenticate], schema: { tags: ['Abuse Detection'] } },
    async (req) => ({ data: await checkSendingAllowed(req.user!.orgId) }),
  );

  // ─── Spam traps ──────────────────────────────────────────────────────────
  app.post(
    '/api/v1/abuse/spam-traps',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['Abuse Detection'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          email: z.string().email(),
          trapType: z.enum(['pristine', 'recycled', 'typo', 'honeypot']),
          source: z.string().max(50).optional(),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await addSpamTrap(body) });
    },
  );

  app.post(
    '/api/v1/abuse/check-trap',
    { preHandler: [app.authenticate], schema: { tags: ['Abuse Detection'] } },
    async (req) => {
      const body = z
        .object({
          email: z.string().email(),
          campaignId: z.string().uuid().optional(),
        })
        .parse(req.body);
      return {
        data: await checkSpamTrap({ ...body, orgId: req.user!.orgId }),
      };
    },
  );

  // ─── Signal submission (for workers / test) ──────────────────────────────
  app.post(
    '/api/v1/abuse/signals',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['Abuse Detection'] },
    },
    async (req) => {
      const body = z
        .object({
          signalType: signalTypeEnum,
          observedValue: z.number(),
          sampleSize: z.number().int().min(0),
          campaignId: z.string().uuid().optional(),
          ipAddress: z.string().max(45).optional(),
          metadata: z.record(z.unknown()).optional(),
        })
        .parse(req.body);
      return {
        data: await evaluateSignal({ ...body, orgId: req.user!.orgId }),
      };
    },
  );

  // ─── System bootstrap ────────────────────────────────────────────────────
  app.post(
    '/api/v1/abuse/seed-rules',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['Abuse Detection'] },
    },
    async () => ({ data: await seedSystemRules() }),
  );
};

export default routes;
