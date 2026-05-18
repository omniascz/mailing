import crypto from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  trackedSites,
  sitePageViews,
  siteEvents,
  contacts,

  type TrackedSite,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// ─── Site management ──────────────────────────────────────────────────────────

export async function createSite(orgId: string, input: {
  domain: string;
  name?: string;
  crossDomainSync?: boolean;
}): Promise<TrackedSite> {
  const siteToken = crypto.randomBytes(24).toString('hex');
  const [row] = await db.insert(trackedSites).values({
    orgId,
    siteToken,
    domain: input.domain.toLowerCase(),
    name: input.name ?? null,
    crossDomainSync: input.crossDomainSync ?? false,
  }).returning();
  return row!;
}

export async function listSites(orgId: string): Promise<TrackedSite[]> {
  return db.select().from(trackedSites).where(eq(trackedSites.orgId, orgId));
}

export async function getSite(orgId: string, id: string): Promise<TrackedSite> {
  const [row] = await db.select().from(trackedSites)
    .where(and(eq(trackedSites.id, id), eq(trackedSites.orgId, orgId)));
  if (!row) throw AppError.notFound('Site not found');
  return row;
}

export async function getSiteByToken(token: string): Promise<TrackedSite | null> {
  const [row] = await db.select().from(trackedSites)
    .where(and(eq(trackedSites.siteToken, token), eq(trackedSites.trackingEnabled, true)));
  return row ?? null;
}

export async function updateSite(orgId: string, id: string, patch: {
  name?: string;
  trackingEnabled?: boolean;
  crossDomainSync?: boolean;
}): Promise<TrackedSite> {
  await getSite(orgId, id);
  const [row] = await db.update(trackedSites).set({ ...patch, updatedAt: new Date() })
    .where(and(eq(trackedSites.id, id), eq(trackedSites.orgId, orgId)))
    .returning();
  return row!;
}

export async function deleteSite(orgId: string, id: string): Promise<void> {
  await getSite(orgId, id);
  await db.delete(trackedSites)
    .where(and(eq(trackedSites.id, id), eq(trackedSites.orgId, orgId)));
}

// ─── Page view recording ─────────────────────────────────────────────────────

export async function recordPageView(input: {
  siteToken: string;
  visitorId: string;
  sessionId?: string;
  url: string;
  path?: string;
  referrer?: string;
  title?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  contactId?: string;
}): Promise<{ pageViewId: string }> {
  const site = await getSiteByToken(input.siteToken);
  if (!site) throw AppError.notFound('Site not found or tracking disabled');

  const [row] = await db.insert(sitePageViews).values({
    orgId: site.orgId,
    siteId: site.id,
    visitorId: input.visitorId,
    sessionId: input.sessionId ?? null,
    contactId: input.contactId ?? null,
    url: input.url,
    path: input.path ?? null,
    referrer: input.referrer ?? null,
    title: input.title ?? null,
    utmSource: input.utmSource ?? null,
    utmMedium: input.utmMedium ?? null,
    utmCampaign: input.utmCampaign ?? null,
    utmContent: input.utmContent ?? null,
  }).returning({ id: sitePageViews.id });

  return { pageViewId: row!.id };
}

// ─── Custom event recording ───────────────────────────────────────────────────

export async function recordEvent(input: {
  siteToken: string;
  visitorId: string;
  eventName: string;
  properties?: Record<string, unknown>;
  contactId?: string;
}): Promise<void> {
  const site = await getSiteByToken(input.siteToken);
  if (!site) return; // silently ignore unknown tokens

  await db.insert(siteEvents).values({
    orgId: site.orgId,
    siteId: site.id,
    visitorId: input.visitorId,
    contactId: input.contactId ?? null,
    eventName: input.eventName,
    properties: input.properties ?? {},
  });
}

// ─── Identity: link visitor to contact ───────────────────────────────────────

export async function identifyVisitor(input: {
  siteToken: string;
  visitorId: string;
  email?: string;
  externalId?: string;
  traits?: Record<string, unknown>;
}): Promise<{ contactId: string | null }> {
  const site = await getSiteByToken(input.siteToken);
  if (!site) return { contactId: null };

  let contactId: string | null = null;

  if (input.email) {
    const [contact] = await db.select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, site.orgId), eq(contacts.email, input.email), isNull(contacts.deletedAt)))
      .limit(1);
    contactId = contact?.id ?? null;
  }

  if (contactId) {
    // Back-fill contactId on recent page views for this visitor
    await db.update(sitePageViews)
      .set({ contactId })
      .where(and(eq(sitePageViews.visitorId, input.visitorId), isNull(sitePageViews.contactId)));
    await db.update(siteEvents)
      .set({ contactId })
      .where(and(eq(siteEvents.visitorId, input.visitorId), isNull(siteEvents.contactId)));

    // Merge anonymous profile
    const { mergeVisitorIntoContact } = await import('../identity-merge/index.js').catch(() => ({ mergeVisitorIntoContact: null }));
    if (mergeVisitorIntoContact) {
      await (mergeVisitorIntoContact as unknown as (a: string, b: string) => Promise<void>)(input.visitorId, contactId).catch(() => {});
    }
  }

  return { contactId };
}

// ─── Analytics queries ────────────────────────────────────────────────────────

export async function getContactPageViews(orgId: string, contactId: string, limit = 50) {
  return db.select().from(sitePageViews)
    .where(and(eq(sitePageViews.orgId, orgId), eq(sitePageViews.contactId, contactId)))
    .orderBy(desc(sitePageViews.occurredAt))
    .limit(limit);
}
