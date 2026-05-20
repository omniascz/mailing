import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as svc from '../../services/app-studio/index.js';
import { onApiEvent } from '../../services/workflows/triggers.js';
import { AppError } from '../../lib/app-error.js';

const idParam = z.object({ id: z.string().uuid() });
const appIdParam = z.object({ appId: z.string().uuid() });

const installSchema = z.object({
  slug: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  iconUrl: z.string().url().max(1024).optional(),
  settingsSchema: z.record(z.unknown()).optional(),
  settings: z.record(z.unknown()).optional(),
});

const updateAppSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  iconUrl: z.string().url().max(1024).optional(),
  settings: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

const subscriberSchema = z.object({
  event: z.string().min(1).max(100),
  targetUrl: z.string().url().max(2048),
});

const actionSchema = z.object({
  key: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  urlTemplate: z.string().min(1).max(2048),
  headers: z.record(z.string()).optional(),
  bodyTemplate: z.string().optional(),
  paramSchema: z.record(z.unknown()).optional(),
  responsePath: z.string().max(255).optional(),
});

const triggerSchema = z.object({
  key: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  eventName: z.string().min(1).max(100),
  payloadSchema: z.record(z.unknown()).optional(),
});

export default async function appStudioRoutes(app: FastifyInstance) {
  // ─── Authenticated dashboard endpoints ─────────────────────────────────────

  app.get(
    '/api/v1/app-studio/apps',
    {
      preHandler: app.requireAuth,
      schema: { tags: ['AppStudio'], summary: 'List installed apps' },
    },
    async (req) => ({ data: await svc.listApps(req.user!.orgId) }),
  );

  app.post(
    '/api/v1/app-studio/apps',
    {
      preHandler: app.requireAuth,
      schema: { tags: ['AppStudio'], summary: 'Install (or define) an app' },
    },
    async (req, reply) => {
      const body = installSchema.parse(req.body);
      const { app: row, accessToken } = await svc.installApp({ orgId: req.user!.orgId, ...body });
      return reply.code(201).send({ data: { ...row, accessToken } });
    },
  );

  app.get(
    '/api/v1/app-studio/apps/:idOrSlug',
    { preHandler: app.requireAuth, schema: { tags: ['AppStudio'], summary: 'Get app' } },
    async (req) => {
      const { idOrSlug } = z.object({ idOrSlug: z.string() }).parse(req.params);
      return { data: await svc.getApp(req.user!.orgId, idOrSlug) };
    },
  );

  app.put(
    '/api/v1/app-studio/apps/:id',
    { preHandler: app.requireAuth, schema: { tags: ['AppStudio'], summary: 'Update app' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const body = updateAppSchema.parse(req.body);
      return { data: await svc.updateApp(req.user!.orgId, id, body) };
    },
  );

  app.delete(
    '/api/v1/app-studio/apps/:id',
    { preHandler: app.requireAuth, schema: { tags: ['AppStudio'], summary: 'Uninstall app' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await svc.uninstallApp(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/v1/app-studio/apps/:id/rotate-token',
    {
      preHandler: app.requireAuth,
      schema: { tags: ['AppStudio'], summary: 'Rotate access token' },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await svc.rotateAccessToken(req.user!.orgId, id) };
    },
  );

  // Subscribers
  app.get(
    '/api/v1/app-studio/apps/:appId/subscribers',
    { preHandler: app.requireAuth, schema: { tags: ['AppStudio'], summary: 'List subscribers' } },
    async (req) => {
      const { appId } = appIdParam.parse(req.params);
      return { data: await svc.listSubscribers(req.user!.orgId, appId) };
    },
  );

  app.post(
    '/api/v1/app-studio/apps/:appId/subscribers',
    { preHandler: app.requireAuth, schema: { tags: ['AppStudio'], summary: 'Add subscriber' } },
    async (req, reply) => {
      const { appId } = appIdParam.parse(req.params);
      const body = subscriberSchema.parse(req.body);
      const sub = await svc.addSubscriber({ orgId: req.user!.orgId, appId, ...body });
      return reply.code(201).send({ data: sub });
    },
  );

  app.delete(
    '/api/v1/app-studio/subscribers/:id',
    { preHandler: app.requireAuth, schema: { tags: ['AppStudio'], summary: 'Remove subscriber' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await svc.removeSubscriber(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // Actions
  app.get(
    '/api/v1/app-studio/apps/:appId/actions',
    { preHandler: app.requireAuth, schema: { tags: ['AppStudio'], summary: 'List actions' } },
    async (req) => {
      const { appId } = appIdParam.parse(req.params);
      return { data: await svc.listActions(req.user!.orgId, appId) };
    },
  );

  app.post(
    '/api/v1/app-studio/apps/:appId/actions',
    { preHandler: app.requireAuth, schema: { tags: ['AppStudio'], summary: 'Define action' } },
    async (req, reply) => {
      const { appId } = appIdParam.parse(req.params);
      const body = actionSchema.parse(req.body);
      const a = await svc.defineAction({ orgId: req.user!.orgId, appId, ...body });
      return reply.code(201).send({ data: a });
    },
  );

  app.delete(
    '/api/v1/app-studio/actions/:id',
    { preHandler: app.requireAuth, schema: { tags: ['AppStudio'], summary: 'Delete action' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await svc.deleteAction(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/v1/app-studio/actions/:key/execute',
    {
      preHandler: app.requireAuth,
      schema: { tags: ['AppStudio'], summary: 'Execute action with provided context' },
    },
    async (req) => {
      const { key } = z.object({ key: z.string() }).parse(req.params);
      const body = z.object({ context: z.record(z.unknown()) }).parse(req.body);
      return { data: await svc.executeAction(req.user!.orgId, key, body.context) };
    },
  );

  // Triggers
  app.get(
    '/api/v1/app-studio/apps/:appId/triggers',
    { preHandler: app.requireAuth, schema: { tags: ['AppStudio'], summary: 'List triggers' } },
    async (req) => {
      const { appId } = appIdParam.parse(req.params);
      return { data: await svc.listTriggers(req.user!.orgId, appId) };
    },
  );

  app.post(
    '/api/v1/app-studio/apps/:appId/triggers',
    { preHandler: app.requireAuth, schema: { tags: ['AppStudio'], summary: 'Define trigger' } },
    async (req, reply) => {
      const { appId } = appIdParam.parse(req.params);
      const body = triggerSchema.parse(req.body);
      const t = await svc.defineTrigger({ orgId: req.user!.orgId, appId, ...body });
      return reply.code(201).send({ data: t });
    },
  );

  app.delete(
    '/api/v1/app-studio/triggers/:id',
    { preHandler: app.requireAuth, schema: { tags: ['AppStudio'], summary: 'Delete trigger' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await svc.deleteTrigger(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // ─── Public trigger ingest — no platform user auth, app token instead ──────

  app.post(
    '/api/v1/app-studio/ingest/:appSlug/:triggerKey',
    { schema: { tags: ['AppStudio'], summary: 'Trigger ingest endpoint (app token auth)' } },
    async (req, reply) => {
      const auth = req.headers.authorization ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const installedApp = await svc.authenticateApp(token);
      if (!installedApp) throw AppError.unauthorized('Invalid app token');

      const { appSlug, triggerKey } = z
        .object({ appSlug: z.string(), triggerKey: z.string() })
        .parse(req.params);
      if (installedApp.slug !== appSlug)
        throw AppError.forbidden('Token does not belong to this app');

      const trigger = await svc.findTrigger(installedApp.orgId, installedApp.id, triggerKey);
      if (!trigger) throw AppError.notFound('Trigger');

      const body = z
        .object({ contactId: z.string().uuid(), payload: z.record(z.unknown()).optional() })
        .parse(req.body);
      await onApiEvent(installedApp.orgId, body.contactId, trigger.eventName, body.payload ?? {});
      return reply.code(202).send({ data: { accepted: true } });
    },
  );
}
