/**
 * Web Push notification routes (task 7.10).
 *
 *   GET  /api/v1/push/vapid-key              (public VAPID key for client)
 *   POST /api/v1/push/subscriptions          (register subscription)
 *   DELETE /api/v1/push/subscriptions/:id    (unregister)
 *   GET  /api/v1/push/subscriptions          (list subscriptions)
 *   POST /api/v1/push/send                   (send push to a contact)
 *   POST /api/v1/push/send/broadcast         (send to all org subscribers)
 *   POST /api/v1/push/track/click            (record click from SW, signed token)
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
import { verifyTrackingToken } from '@forgemsg/shared';

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
      vapidSubject: `mailto:${process.env.VAPID_EMAIL ?? 'push@example.invalid'}`,
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
  //
  // No session, because a service worker has none — but a signed token, for the
  // same reason the poll and unsubscribe routes carry one: the request asserts
  // something about a specific row, and without a signature anybody could assert
  // it about anybody's row. This one took `messageId` straight out of the body
  // and updated `push_send_log` by id with no org filter, so one curl marked
  // another tenant's notification as clicked — and `clicked_at` is what channel
  // scoring (services/channel-scoring/index.ts:381) and the engagement score
  // (services/engagement-score/index.ts:283) count as push engagement. The
  // forged number would arrive as somebody else's "push works for this contact".
  //
  // The token names the row, so the body no longer does. `messageId` is still
  // read, but only to be compared: a service worker that sends both must agree
  // with the signature, and a mismatch is refused rather than resolved in favour
  // of the unsigned half.
  //
  // Worth knowing why no tool caught this: `forgemsgOrg/require-org-scope` never
  // reported it. Its exemption 1 treats `update(t).where(eq(t.id, x))` as already
  // as narrow as a query can be — one row, found by its key — which held for all
  // 603 warnings it was read against, because there the id came from a lookup the
  // same function had already scoped. Here it came from the body of a request
  // that carried no session, and a primary key supplied by a stranger narrows
  // nothing. The audit inherited the blind spot: this route is not in it.
  app.post('/api/v1/push/track/click', async (req, reply) => {
    const { token, messageId } = req.body as {
      token?: string;
      messageId?: string;
      contactId?: string;
    };

    if (!token) {
      return reply
        .code(400)
        .send({ code: 'TOKEN_REQUIRED', message: 'A signed click token is required' });
    }

    const payload = verifyTrackingToken(token);
    if (!payload || payload.type !== 'pushclick') {
      return reply
        .code(400)
        .send({ code: 'INVALID_TOKEN', message: 'The click token could not be verified' });
    }

    if (messageId && messageId !== payload.messageId) {
      return reply
        .code(400)
        .send({ code: 'TOKEN_MISMATCH', message: 'The click token names a different message' });
    }

    // Scoped by the org inside the signature as well as by id: the id alone is
    // what made this cross-tenant, and a token is only ever minted for the org
    // that owns the row.
    await db
      .update(pushSendLog)
      .set({ clickedAt: new Date() })
      .where(and(eq(pushSendLog.id, payload.messageId), eq(pushSendLog.orgId, payload.orgId)));

    // 204 whether or not a row matched. A token this service signed is authentic
    // even when the row is gone, and answering differently would turn the
    // endpoint into a way to ask which message ids exist.
    return reply.status(204).send();
  });
}
