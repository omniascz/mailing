/**
 * Sklik retargeting pixel (#422).
 *
 * Two surfaces:
 *   1. **JS snippet** served at `GET /sklik-pixel/:siteToken.js` — the
 *      customer pastes a `<script async>` tag on their website. The snippet
 *      drops a visitor cookie, fires a 1×1 GIF for the page view, and lets
 *      the customer call `forgemsg.identify({ email, phone })` to associate
 *      the visitor with a known contact.
 *   2. **Tracking GIF** at `GET /sklik-pixel/:siteToken/event.gif` — receives
 *      the page view and records it on `site_page_views`.
 *
 * Audience building reuses the visitor → contact join: every contact that
 * touched the site in the last N days becomes a member of a Sklik Custom
 * Audience, hashed via `services/ads/providers/sklik/pure.ts`.
 */

import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gte, isNotNull } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { sitePageViews, trackedSites } from '../../../../db/schema/site-tracking.js';
import { contacts } from '../../../../db/schema/contacts.js';
import { AppError } from '../../../../lib/app-error.js';
import type { AudienceMember } from './pure.js';

export const VISITOR_COOKIE = 'fm_sklik_v';
export const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Render the JS snippet for a tracked site. The snippet is small,
 * dependency-free, and works in IE11+.
 */
export function generateSklikSnippet(
  siteToken: string,
  opts: {
    endpointBase?: string;
    cookieName?: string;
  } = {},
): string {
  const safeToken = siteToken.replace(/[^A-Za-z0-9_-]/g, '');
  if (!safeToken) throw new Error('Invalid site token');
  const base = opts.endpointBase ?? '';
  const cookie = opts.cookieName ?? VISITOR_COOKIE;
  return `(function(){
  var TOKEN=${JSON.stringify(safeToken)};
  var BASE=${JSON.stringify(base)};
  var COOKIE=${JSON.stringify(cookie)};
  function uuid(){var c=window.crypto;if(c&&c.randomUUID)return c.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(d){
      var r=Math.random()*16|0,v=d=='x'?r:(r&0x3|0x8);return v.toString(16);});}
  function getCookie(){var m=document.cookie.match(new RegExp('(?:^|; )'+COOKIE+'=([^;]+)'));return m?m[1]:null;}
  function setCookie(v){document.cookie=COOKIE+'='+v+'; path=/; max-age=${VISITOR_COOKIE_MAX_AGE}; samesite=lax';}
  var vid=getCookie();if(!vid){vid=uuid();setCookie(vid);}
  function hash(s){return s;} // server hashes — keep client snippet tiny
  function fire(extra){
    var u=BASE+'/sklik-pixel/'+TOKEN+'/event.gif?v='+encodeURIComponent(vid)
      +'&u='+encodeURIComponent(location.href)+'&t='+Date.now();
    if(extra&&extra.email)u+='&e='+encodeURIComponent(extra.email.toLowerCase().trim());
    if(extra&&extra.phone)u+='&p='+encodeURIComponent(extra.phone);
    var img=new Image(1,1);img.src=u;
  }
  fire();
  window.forgemsg=window.forgemsg||{};
  window.forgemsg.identify=function(payload){fire(payload||{});};
})();`;
}

/** SHA-256(lowercase trim email). */
export function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/** Validate site token shape (safe characters + reasonable length). */
export function isValidSiteToken(token: string): boolean {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(token);
}

/** Generate a fresh visitor id (server-side fallback). */
export function newVisitorId(): string {
  return randomBytes(16).toString('hex');
}

/** Parse the tracking-pixel query into a normalised event payload. */
export interface TrackingEvent {
  visitorId: string;
  url: string;
  emailLower: string | null;
  phone: string | null;
  ts: Date;
}

export function parseTrackingEvent(
  query: Record<string, unknown>,
  fallbackTs: Date = new Date(),
): TrackingEvent | null {
  const v = typeof query.v === 'string' ? query.v : '';
  const u = typeof query.u === 'string' ? query.u : '';
  if (!v || !u) return null;
  return {
    visitorId: v,
    url: u,
    emailLower:
      typeof query.e === 'string' && query.e.includes('@') ? query.e.toLowerCase().trim() : null,
    phone: typeof query.p === 'string' && query.p.length > 0 ? query.p : null,
    ts:
      typeof query.t === 'string' && /^\d+$/.test(query.t) ? new Date(Number(query.t)) : fallbackTs,
  };
}

/**
 * Look up the tracked site by its public token. Returns null when missing or
 * disabled — callers respond with the GIF either way to avoid leaking
 * site-existence information.
 */
export async function resolveTrackedSite(siteToken: string): Promise<{
  id: string;
  orgId: string;
  trackingEnabled: boolean;
} | null> {
  if (!isValidSiteToken(siteToken)) return null;
  const [row] = await db
    .select({
      id: trackedSites.id,
      orgId: trackedSites.orgId,
      trackingEnabled: trackedSites.trackingEnabled,
    })
    .from(trackedSites)
    .where(eq(trackedSites.siteToken, siteToken))
    .limit(1);
  return row ?? null;
}

/**
 * Persist a Sklik-pixel page view. If the request carries an identifier
 * (email/phone), we also resolve and link the matching contact.
 */
export async function recordPixelEvent(
  site: { id: string; orgId: string },
  event: TrackingEvent,
): Promise<void> {
  let contactId: string | null = null;
  if (event.emailLower) {
    const [c] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, site.orgId), eq(contacts.email, event.emailLower)))
      .limit(1);
    contactId = c?.id ?? null;
  }

  let path: string | undefined;
  try {
    path = new URL(event.url).pathname.slice(0, 2048);
  } catch {
    // best-effort
  }

  await db.insert(sitePageViews).values({
    orgId: site.orgId,
    siteId: site.id,
    visitorId: event.visitorId.slice(0, 128),
    contactId: contactId ?? undefined,
    url: event.url.slice(0, 2048),
    path: path,
    referrer: undefined,
    title: undefined,
    utmSource: undefined,
    utmMedium: undefined,
    utmCampaign: undefined,
  } as typeof sitePageViews.$inferInsert);
}

/**
 * Build a Sklik audience from page-view events: every distinct identified
 * contact that visited the org's tracked sites in the last `sinceDays` days.
 * Returns an `AudienceMember[]` ready to feed into `uploadToSklik`.
 */
export async function buildAudienceFromPixel(
  orgId: string,
  sinceDays: number = 30,
): Promise<AudienceMember[]> {
  if (!Number.isFinite(sinceDays) || sinceDays <= 0) {
    throw AppError.badRequest('sinceDays must be a positive number');
  }
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .selectDistinct({ email: contacts.email, phone: contacts.phone })
    .from(sitePageViews)
    .innerJoin(contacts, eq(contacts.id, sitePageViews.contactId))
    .where(
      and(
        eq(sitePageViews.orgId, orgId),
        isNotNull(sitePageViews.contactId),
        gte(sitePageViews.occurredAt, since),
      ),
    );

  return rows.filter((r) => r.email || r.phone).map((r) => ({ email: r.email, phone: r.phone }));
}
