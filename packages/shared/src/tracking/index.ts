/**
 * Email open and click tracking service.
 *
 * Open tracking:
 *   - Injects a 1×1 transparent GIF pixel into the rendered HTML
 *   - Endpoint decodes the token, logs the open event, detects Apple MPP
 *
 * Click tracking:
 *   - Wraps all outbound <a href> links with a tracked redirect URL
 *   - Appends UTM parameters to the destination URL
 *   - Endpoint logs the click event then 302-redirects to the original URL
 *
 * Token format: base64url(JSON(payload)) + "." + base64url(HMAC-SHA256)
 * Signed with TRACKING_SECRET env var (falls back to a dev-only constant).
 */

import crypto from 'node:crypto';

const TRACKING_SECRET = process.env.TRACKING_SECRET ?? 'dev-tracking-secret-changeme';

// ─── Payload types ────────────────────────────────────────────────────────────

export interface OpenTrackingPayload {
  type: 'open';
  campaignId: string;
  contactId: string;
  orgId: string;
  /** Unix timestamp (seconds) when the token was generated */
  ts: number;
}

export interface ClickTrackingPayload {
  type: 'click';
  campaignId: string;
  contactId: string;
  orgId: string;
  /** The original destination URL (before tracking was applied) */
  url: string;
  ts: number;
}

/**
 * Preference-center access token. Embedded as a merge tag
 * `{{preference_center_url}}` into outbound emails so recipients can
 * manage subscriptions without logging in. Same HMAC scheme as the
 * tracking tokens above; the type field guards against an open/click
 * token being replayed against the preference center.
 */
export interface PreferenceCenterPayload {
  type: 'pref';
  orgId: string;
  contactId: string;
  ts: number;
}

/**
 * One-click unsubscribe token. Embedded in the `List-Unsubscribe` header and
 * the `{{unsubscribe_url}}` merge tag. Stateless + HMAC-signed so bulk sends
 * don't need a per-recipient Redis write and the token can't be forged to
 * unsubscribe an arbitrary contact.
 */
export interface UnsubscribePayload {
  type: 'unsub';
  orgId: string;
  contactId: string;
  /** Optional originating campaign — used for unsubscribe attribution. */
  campaignId?: string;
  ts: number;
}

/**
 * View-in-browser token. Embedded as {{view_in_browser_url}} so a recipient can
 * open a hosted copy of the exact email they received. Signed + stateless so no
 * per-recipient HTML is stored; the endpoint re-renders from campaign + contact.
 */
export interface ViewInBrowserPayload {
  type: 'view';
  orgId: string;
  campaignId: string;
  contactId: string;
  ts: number;
}

export type TrackingPayload =
  | OpenTrackingPayload
  | ClickTrackingPayload
  | PreferenceCenterPayload
  | UnsubscribePayload
  | ViewInBrowserPayload;

// ─── Token helpers ────────────────────────────────────────────────────────────

function toBase64Url(buf: Buffer | string): string {
  const b64 =
    typeof buf === 'string' ? Buffer.from(buf).toString('base64') : buf.toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64Url(str: string): Buffer {
  const padded = str
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
}

function sign(payload: string): string {
  return toBase64Url(crypto.createHmac('sha256', TRACKING_SECRET).update(payload).digest());
}

/**
 * Create a signed tracking token from a payload object.
 */
export function createTrackingToken(payload: TrackingPayload): string {
  const encoded = toBase64Url(JSON.stringify(payload));
  const sig = sign(encoded);
  return `${encoded}.${sig}`;
}

/**
 * Verify and decode a tracking token.
 * Returns null if the token is invalid or tampered.
 */
export function verifyTrackingToken(token: string): TrackingPayload | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;

  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expectedSig = sign(encoded);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  // Constant-time comparison to prevent timing attacks
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const raw = fromBase64Url(encoded).toString('utf8');
    return JSON.parse(raw) as TrackingPayload;
  } catch {
    return null;
  }
}

// ─── Apple MPP detection ──────────────────────────────────────────────────────

/**
 * Detect Apple Mail Privacy Protection (MPP) opens.
 *
 * Apple's MPP proxy pre-fetches tracking pixels via a CloudFront CDN using a
 * server-side UA. These "opens" should be flagged as suspected bots rather than
 * genuine human engagement.
 *
 * Heuristics used (no single signal is 100% reliable):
 *  1. UA contains "Apple Mail" / "Mail.app" identifiers
 *  2. UA contains AppleWebKit + Mail keywords (Apple's proxy UA pattern)
 *  3. UA matches known Apple CloudFront bot pattern
 */
export function isAppleMpp(userAgent: string): boolean {
  if (!userAgent) return false;
  const ua = userAgent;

  // Direct Apple Mail indicators
  if (/Apple[\s_-]?Mail/i.test(ua)) return true;
  if (/mobilemail/i.test(ua)) return true;

  // Apple's MPP proxy UA often includes AppleWebKit but no real device/browser context
  if (/applewebkit/i.test(ua) && /\bmail\b/i.test(ua)) return true;

  // Apple's CDN-side image prefetching bot
  if (/Cloudfront.*Apple|Apple.*Cloudfront/i.test(ua)) return true;

  return false;
}

// ─── Open tracking ────────────────────────────────────────────────────────────

/**
 * Inject a 1×1 transparent tracking pixel before </body> in the HTML.
 *
 * The pixel is a standard <img> tag pointing to the open-tracking endpoint.
 * It is intentionally placed just before </body> so it loads last and does
 * not affect email rendering.
 */
export function injectOpenPixel(
  html: string,
  baseUrl: string,
  orgId: string,
  campaignId: string,
  contactId: string,
): string {
  const token = createTrackingToken({
    type: 'open',
    orgId,
    campaignId,
    contactId,
    ts: Math.floor(Date.now() / 1000),
  });

  const pixelUrl = `${baseUrl}/track/o/${token}`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;border:0;outline:0;line-height:0;mso-hide:all;" />`;

  // Insert before </body> if present, otherwise append
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return html + pixel;
}

// ─── Click tracking ───────────────────────────────────────────────────────────

const UTM_PARAMS = (campaignName: string) =>
  `utm_source=forgemsg&utm_medium=email&utm_campaign=${encodeURIComponent(campaignName)}`;

/** URLs that should NOT be wrapped with click tracking */
const SKIP_URL_PATTERNS = [
  /^mailto:/i,
  /^tel:/i,
  /^sms:/i,
  /\{\{.*unsubscribe/i, // merge-tag unsubscribe links
  /\/unsubscribe/i, // unsubscribe paths
  /\/track\/(o|c)\//i, // already tracked
  /^#/, // anchor-only links
  /^javascript:/i,
];

function shouldSkip(url: string): boolean {
  return SKIP_URL_PATTERNS.some((p) => p.test(url));
}

/**
 * Wrap all outbound links in the HTML with tracked redirect URLs.
 *
 * Original: `<a href="https://example.com/product">Shop now</a>`
 * Wrapped:  `<a href="https://track.forgemsg.com/track/c/{token}">Shop now</a>`
 *
 * UTM parameters are appended to the destination (not the tracking URL) before
 * encoding, so the redirect preserves them.
 */
export function wrapLinks(
  html: string,
  baseUrl: string,
  orgId: string,
  campaignId: string,
  contactId: string,
  campaignName = '',
): string {
  // Match href attributes — handle both single and double quotes
  return html.replace(/href=(["'])(.*?)\1/gi, (match, quote, rawUrl) => {
    const url = rawUrl.trim();

    if (!url || shouldSkip(url)) return match;

    // Append UTM params to the destination URL
    const hasParams = url.includes('?');
    const utmSuffix = campaignName ? `${hasParams ? '&' : '?'}${UTM_PARAMS(campaignName)}` : '';
    const destinationUrl = url + utmSuffix;

    const token = createTrackingToken({
      type: 'click',
      orgId,
      campaignId,
      contactId,
      url: destinationUrl,
      ts: Math.floor(Date.now() / 1000),
    });

    const trackedUrl = `${baseUrl}/track/c/${token}`;
    return `href=${quote}${trackedUrl}${quote}`;
  });
}
