/**
 * Per-org Web Push adapter factory. VAPID keys are stored per organization in
 * the `vapid_keys` table (not env), so background workers must resolve them by
 * orgId. Returns null when the org has no active VAPID keys.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { vapidKeys } from '../../db/schema/index.js';
import { WebPushAdapter } from '../../channels/push/web-push-adapter.js';

export async function getPushAdapterForOrg(orgId: string): Promise<WebPushAdapter | null> {
  const [key] = await db
    .select()
    .from(vapidKeys)
    .where(and(eq(vapidKeys.orgId, orgId), eq(vapidKeys.active, true)))
    .limit(1);
  if (!key) return null;
  return new WebPushAdapter({
    vapidPublicKey: key.publicKey,
    vapidPrivateKey: key.privateKey,
    vapidSubject: `mailto:${process.env.VAPID_EMAIL ?? 'push@forgemsg.com'}`,
  });
}
