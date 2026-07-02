/**
 * Native mobile push — pure payload builders.
 *
 * Turns a channel-agnostic notification into the exact wire payload each
 * platform expects: APNs (iOS) and FCM HTTP v1 (Android). Kept pure so the
 * payload shape — the part that must match Apple/Google's spec exactly — is
 * unit-testable without any push credentials. The network transport lives in
 * mobile.ts.
 */

export type MobilePlatform = 'ios' | 'android';

export interface MobileNotification {
  title: string;
  body: string;
  /** Deep link / URL opened on tap (delivered as custom data). */
  url?: string;
  /** iOS badge count. */
  badge?: number;
  /** Sound name; 'default' for the standard sound. */
  sound?: string;
  /** Arbitrary key/value data delivered to the app. */
  data?: Record<string, string>;
  /** Image URL for rich notifications. */
  imageUrl?: string;
}

/**
 * APNs payload (the JSON body POSTed to api.push.apple.com). `aps` carries the
 * user-visible alert + badge/sound; custom keys sit alongside `aps`. When a URL
 * or image is present we set mutable-content so a Notification Service Extension
 * can act on it.
 */
export function buildApnsPayload(n: MobileNotification): Record<string, unknown> {
  const aps: Record<string, unknown> = {
    alert: { title: n.title, body: n.body },
    sound: n.sound ?? 'default',
  };
  if (typeof n.badge === 'number') aps.badge = n.badge;
  if (n.url || n.imageUrl) aps['mutable-content'] = 1;

  const payload: Record<string, unknown> = { aps };
  if (n.url) payload.url = n.url;
  if (n.imageUrl) payload.image_url = n.imageUrl;
  for (const [k, v] of Object.entries(n.data ?? {})) payload[k] = v;
  return payload;
}

/** APNs request headers for a given topic (app bundle id) + priority. */
export function buildApnsHeaders(
  bundleId: string,
  opts: { priority?: 5 | 10; collapseId?: string } = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    'apns-topic': bundleId,
    'apns-push-type': 'alert',
    'apns-priority': String(opts.priority ?? 10),
  };
  if (opts.collapseId) headers['apns-collapse-id'] = opts.collapseId;
  return headers;
}

/**
 * FCM HTTP v1 message body (POSTed to
 * /v1/projects/{projectId}/messages:send). notification carries the visible
 * title/body; data must be a flat string map; android/apns blocks override
 * per-platform. All values in `data` are coerced to strings (FCM requirement).
 */
export function buildFcmMessage(token: string, n: MobileNotification): Record<string, unknown> {
  const data: Record<string, string> = {};
  if (n.url) data.url = n.url;
  for (const [k, v] of Object.entries(n.data ?? {})) data[k] = String(v);

  const message: Record<string, unknown> = {
    token,
    notification: {
      title: n.title,
      body: n.body,
      ...(n.imageUrl ? { image: n.imageUrl } : {}),
    },
  };
  if (Object.keys(data).length > 0) message.data = data;
  return { message };
}

/**
 * Interpret an APNs/FCM error as "should we drop this token?". Apple returns
 * BadDeviceToken/Unregistered; FCM returns UNREGISTERED/INVALID_ARGUMENT.
 */
export function isTokenInvalidError(platform: MobilePlatform, code: string): boolean {
  const c = code.toUpperCase();
  if (platform === 'ios') {
    return c === 'BADDEVICETOKEN' || c === 'UNREGISTERED' || c === 'DEVICETOKENNOTFORTOPIC';
  }
  return c === 'UNREGISTERED' || c === 'INVALID_ARGUMENT' || c === 'NOT_FOUND';
}
