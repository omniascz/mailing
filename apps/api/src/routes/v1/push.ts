/**
 * Web Push notification routes (task 7.10).
 *
 *   GET  /api/v1/push/vapid-key              (public VAPID key for client)
 *   POST /api/v1/push/subscriptions          (register subscription)
 *   DELETE /api/v1/push/subscriptions/:id    (unregister)
 *   GET  /api/v1/push/subscriptions          (list subscriptions)
 *   POST /api/v1/push/send                   (send push to a contact)
 *   POST /api/v1/push/send/broadcast         (send to all org subscribers)
 *   POST /api/v1/push/track/click            (record click from SW)
 *   POST /api/v1/push/vapid-keys             (generate + store VAPID pair)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { pushSubscriptions, vapidKeys, pushSendLog } from '../../db/schema/push.js';
import { generateVapidKeyPair, WebPushAdapter } from '../../channels/push/web-push-adapter.js';
import {
  registerDevice,
  deactivateDevice,
  listContactDevices,
  sendContactMobilePush,
} from '../../services/push/mobile.js';
import { AppError } from '../../lib/app-error.js';

export default async function pushRoutes(app: FastifyInstance) {
  // ── Native mobile device registry (APNs / FCM) ────────────────────────────
  // The mobile SDK registers with a public (fm_pub_) key → authenticatePublic.

  app.post('/api/v1/push/devices', { preHandler: [app.authenticatePublic] }, async (req, reply) => {
    const { orgId } = req.user as { orgId: string };
    const body = z
      .object({
        contactId: z.string().uuid().optional(),
        platform: z.enum(['ios', 'android']),
        token: z.string().min(8).max(4096),
        appId: z.string().max(255).optional(),
        deviceModel: z.string().max(128).optional(),
        osVersion: z.string().max(64).optional(),
      })
      .parse(req.body);
    const device = await registerDevice(orgId, body);
    return reply.status(201).send({ data: { id: device.id, platform: device.platform } });
  });

  app.delete(
    '/api/v1/push/devices/:token',
    { preHandler: [app.authenticatePublic] },
    async (req, reply) => {
      const { orgId } = req.user as { orgId: string };
      const { token } = z.object({ token: z.string().min(8).max(4096) }).parse(req.params);
      await deactivateDevice(orgId, token);
      return reply.status(204).send();
    },
  );

  app.get('/api/v1/push/devices', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.query);
    return { data: await listContactDevices(orgId, contactId) };
  });

  // Deliver a native mobile push to a contact's registered devices (APNs/FCM).
  app.post('/api/v1/push/mobile/send', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };
    const body = z
      .object({
        contactId: z.string().uuid(),
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(500),
        url: z.string().url().optional(),
        badge: z.number().int().min(0).optional(),
      })
      .parse(req.body);
    const summary = await sendContactMobilePush(orgId, body.contactId, {
      title: body.title,
      body: body.body,
      url: body.url,
      badge: body.badge,
    });
    return { data: summary };
  });

  // ── VAPID key management ──────────────────────────────────────────────────

  /** Generate a new VAPID key pair for an org */
  app.post('/api/v1/push/vapid-keys', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { orgId } = req.user as { orgId: string };

    // Deactivate any existing key
    await db.update(vapidKeys).set({ active: false }).where(eq(vapidKeys.orgId, orgId));

    const { publicKey, privateKey } = await generateVapidKeyPair();

    const [key] = await db.insert(vapidKeys).values({ orgId, publicKey, privateKey }).returning({
      id: vapidKeys.id,
      publicKey: vapidKeys.publicKey,
      createdAt: vapidKeys.createdAt,
    });

    return reply.status(201).send({ data: key });
  });

  /** Get the public VAPID key (for the browser's pushManager.subscribe call) */
  app.get('/api/v1/push/vapid-key', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };

    const [key] = await db
      .select({ publicKey: vapidKeys.publicKey })
      .from(vapidKeys)
      .where(and(eq(vapidKeys.orgId, orgId), eq(vapidKeys.active, true)))
      .limit(1);

    if (!key) throw AppError.notFound('VapidKey (generate one first via POST /push/vapid-keys)');
    return { data: { publicKey: key.publicKey } };
  });

  // ── Subscription management ───────────────────────────────────────────────

  const subscribeSchema = z.object({
    endpoint: z.string().url(),
    p256dh: z.string(),
    auth: z.string(),
    contactId: z.string().uuid().optional(),
    fcmToken: z.string().optional(),
    userAgent: z.string().optional(),
  });

  app.post('/api/v1/push/subscriptions', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { orgId } = req.user as { orgId: string };
    const data = subscribeSchema.parse(req.body);

    const [sub] = await db
      .insert(pushSubscriptions)
      .values({ orgId, ...data })
      .onConflictDoUpdate({
        target: [pushSubscriptions.endpoint],
        set: {
          p256dh: data.p256dh,
          auth: data.auth,
          active: true,
          unsubscribedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return reply.status(201).send({ data: sub });
  });

  app.get('/api/v1/push/subscriptions', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };
    const subs = await db
      .select({
        id: pushSubscriptions.id,
        contactId: pushSubscriptions.contactId,
        active: pushSubscriptions.active,
        createdAt: pushSubscriptions.createdAt,
      })
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.orgId, orgId), eq(pushSubscriptions.active, true)));

    return { data: subs };
  });

  app.delete(
    '/api/v1/push/subscriptions/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { orgId } = req.user as { orgId: string };
      const { id } = req.params as { id: string };

      await db
        .update(pushSubscriptions)
        .set({ active: false, unsubscribedAt: new Date() })
        .where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.orgId, orgId)));

      return reply.status(204).send();
    },
  );

  // ── Send ──────────────────────────────────────────────────────────────────

  const sendSchema = z.object({
    contactId: z.string().uuid(),
    title: z.string().min(1),
    body: z.string().min(1),
    url: z.string().optional(),
    icon: z.string().optional(),
    image: z.string().optional(),
    badge: z.number().int().optional(),
    actions: z.array(z.object({ title: z.string(), url: z.string() })).optional(),
    campaignId: z.string().uuid().optional(),
  });

  async function getAdapter(orgId: string): Promise<WebPushAdapter> {
    const [key] = await db
      .select()
      .from(vapidKeys)
      .where(and(eq(vapidKeys.orgId, orgId), eq(vapidKeys.active, true)))
      .limit(1);

    if (!key) throw AppError.badRequest('No VAPID keys configured for this org');

    return new WebPushAdapter({
      vapidPublicKey: key.publicKey,
      vapidPrivateKey: key.privateKey,
      vapidSubject: `mailto:${process.env.VAPID_EMAIL ?? 'push@forgemsg.com'}`,
    });
  }

  app.post('/api/v1/push/send', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };
    const data = sendSchema.parse(req.body);
    const adapter = await getAdapter(orgId);

    const result = await adapter.send(
      {
        channel: 'push',
        content: {
          kind: 'push',
          title: data.title,
          body: data.body,
          url: data.url,
          icon: data.icon,
          image: data.image,
          badge: data.badge,
          actions: data.actions,
        },
        orgId,
        campaignId: data.campaignId,
      },
      { contactId: data.contactId },
    );

    return { data: result };
  });

  // ── Click tracking (from Service Worker) ─────────────────────────────────

  app.post('/api/v1/push/track/click', async (req, reply) => {
    const { messageId } = req.body as { messageId?: string; contactId?: string };

    if (messageId) {
      await db
        .update(pushSendLog)
        .set({ clickedAt: new Date() })
        .where(eq(pushSendLog.id, messageId));
    }

    return reply.status(204).send();
  });
}
