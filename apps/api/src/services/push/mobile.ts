/**
 * Native mobile push — device registry + send preparation.
 *
 * The mobile SDK registers a device token here; sends load a contact's active
 * devices and build per-platform payloads (mobile-pure.ts). The actual APNs/FCM
 * HTTP transport requires per-org credentials (APNs .p8 key / FCM service
 * account) that are provisioned separately — deliverPreparedSends is where that
 * transport plugs in; without credentials the prepared sends are logged as
 * 'queued' for a transport worker to pick up.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { mobileDevices, pushSendLog, type MobileDevice } from '../../db/schema/push.js';
import { AppError } from '../../lib/app-error.js';
import {
  buildApnsPayload,
  buildApnsHeaders,
  buildFcmMessage,
  type MobileNotification,
  type MobilePlatform,
} from './mobile-pure.js';
import {
  getApnsConfig,
  getFcmConfig,
  sendApns,
  sendFcm,
  type PushDeliveryResult,
} from './mobile-transport.js';

export interface RegisterDeviceInput {
  contactId?: string;
  platform: MobilePlatform;
  token: string;
  appId?: string;
  deviceModel?: string;
  osVersion?: string;
}

/** Register (or refresh) a device token. Idempotent on (orgId, token). */
export async function registerDevice(
  orgId: string,
  input: RegisterDeviceInput,
): Promise<MobileDevice> {
  if (input.platform !== 'ios' && input.platform !== 'android') {
    throw AppError.badRequest("platform must be 'ios' or 'android'");
  }
  if (!input.token || input.token.length < 8) {
    throw AppError.badRequest('A valid device token is required');
  }
  const now = new Date();
  const [row] = await db
    .insert(mobileDevices)
    .values({
      orgId,
      contactId: input.contactId,
      platform: input.platform,
      token: input.token,
      appId: input.appId,
      deviceModel: input.deviceModel,
      osVersion: input.osVersion,
      active: true,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [mobileDevices.orgId, mobileDevices.token],
      set: {
        contactId: input.contactId,
        platform: input.platform,
        appId: input.appId,
        deviceModel: input.deviceModel,
        osVersion: input.osVersion,
        active: true,
        invalidatedAt: null,
        lastSeenAt: now,
        updatedAt: now,
      },
    })
    .returning();
  return row!;
}

/** Deactivate a device by token (SDK logout / uninstall signal). */
export async function deactivateDevice(orgId: string, token: string): Promise<void> {
  const [row] = await db
    .update(mobileDevices)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(mobileDevices.orgId, orgId), eq(mobileDevices.token, token)))
    .returning({ id: mobileDevices.id });
  if (!row) throw AppError.notFound('MobileDevice');
}

export async function listContactDevices(orgId: string, contactId: string): Promise<MobileDevice[]> {
  return db
    .select()
    .from(mobileDevices)
    .where(
      and(
        eq(mobileDevices.orgId, orgId),
        eq(mobileDevices.contactId, contactId),
        eq(mobileDevices.active, true),
      ),
    );
}

export interface PreparedSend {
  deviceId: string;
  platform: MobilePlatform;
  token: string;
  appId: string | null;
  /** APNs payload (ios) or FCM v1 message (android). */
  payload: Record<string, unknown>;
}

/**
 * Prepare per-device payloads for a contact + persist a queued send-log row per
 * device. Returns the prepared sends for the transport layer to deliver. No
 * network here — delivery needs org APNs/FCM credentials.
 */
export async function prepareContactSend(
  orgId: string,
  contactId: string,
  notification: MobileNotification,
  campaignId?: string,
): Promise<PreparedSend[]> {
  const devices = await listContactDevices(orgId, contactId);
  const prepared: PreparedSend[] = [];

  for (const d of devices) {
    const platform = d.platform as MobilePlatform;
    const payload =
      platform === 'ios'
        ? buildApnsPayload(notification)
        : buildFcmMessage(d.token, notification);
    prepared.push({ deviceId: d.id, platform, token: d.token, appId: d.appId, payload });

    await db.insert(pushSendLog).values({
      orgId,
      subscriptionId: d.id,
      contactId,
      title: notification.title,
      body: notification.body,
      url: notification.url,
      imageUrl: notification.imageUrl,
      campaignId,
      status: 'queued',
    });
  }

  return prepared;
}

export interface MobileSendSummary {
  sent: number;
  failed: number;
  skipped: number;
  deactivated: number;
}

/**
 * Deliver a notification to all of a contact's active devices via APNs/FCM.
 * Logs one push_send_log row per device with the final status, and deactivates
 * tokens Apple/Google report as permanently invalid. When the relevant
 * provider isn't configured, the device is recorded as skipped (not failed).
 */
export async function sendContactMobilePush(
  orgId: string,
  contactId: string,
  notification: MobileNotification,
  campaignId?: string,
): Promise<MobileSendSummary> {
  const devices = await listContactDevices(orgId, contactId);
  const apns = getApnsConfig();
  const fcm = getFcmConfig();
  const summary: MobileSendSummary = { sent: 0, failed: 0, skipped: 0, deactivated: 0 };

  for (const d of devices) {
    const platform = d.platform as MobilePlatform;
    let result: PushDeliveryResult;
    let status: string;

    if (platform === 'ios') {
      if (!apns) {
        status = 'skipped_unconfigured';
        summary.skipped++;
      } else {
        result = await sendApns(
          apns,
          d.token,
          buildApnsPayload(notification),
          buildApnsHeaders(d.appId ?? apns.bundleId),
        );
        status = result.status;
        if (result.status === 'sent') summary.sent++;
        else summary.failed++;
        if (result.tokenInvalid) {
          await db
            .update(mobileDevices)
            .set({ active: false, invalidatedAt: new Date(), updatedAt: new Date() })
            .where(eq(mobileDevices.id, d.id));
          summary.deactivated++;
        }
      }
    } else {
      if (!fcm) {
        status = 'skipped_unconfigured';
        summary.skipped++;
      } else {
        result = await sendFcm(fcm, buildFcmMessage(d.token, notification));
        status = result.status;
        if (result.status === 'sent') summary.sent++;
        else summary.failed++;
        if (result.tokenInvalid) {
          await db
            .update(mobileDevices)
            .set({ active: false, invalidatedAt: new Date(), updatedAt: new Date() })
            .where(eq(mobileDevices.id, d.id));
          summary.deactivated++;
        }
      }
    }

    await db.insert(pushSendLog).values({
      orgId,
      subscriptionId: d.id,
      contactId,
      title: notification.title,
      body: notification.body,
      url: notification.url,
      imageUrl: notification.imageUrl,
      campaignId,
      status,
    });
  }

  return summary;
}
