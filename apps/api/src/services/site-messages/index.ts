import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { siteMessages, siteMessageImpressions, type SiteMessage } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createMessage(
  orgId: string,
  input: {
    siteId?: string | null;
    name: string;
    type?: SiteMessage['type'];
    trigger?: SiteMessage['trigger'];
    conditions?: SiteMessage['conditions'];
    headline?: string;
    body?: string;
    ctaText?: string;
    ctaUrl?: string;
    style?: Record<string, unknown>;
    showOncePerVisitor?: boolean;
    showOncePerSession?: boolean;
    delaySeconds?: number;
  },
): Promise<SiteMessage> {
  const [row] = await db
    .insert(siteMessages)
    .values({
      orgId,
      siteId: input.siteId ?? null,
      name: input.name,
      type: input.type ?? 'popup',
      trigger: input.trigger ?? 'page_visit',
      conditions: input.conditions ?? [],
      headline: input.headline ?? null,
      body: input.body ?? null,
      ctaText: input.ctaText ?? null,
      ctaUrl: input.ctaUrl ?? null,
      style: input.style ?? {},
      showOncePerVisitor: input.showOncePerVisitor ?? true,
      showOncePerSession: input.showOncePerSession ?? false,
      delaySeconds: input.delaySeconds ?? 0,
    })
    .returning();
  return row!;
}

export async function getMessage(orgId: string, id: string): Promise<SiteMessage> {
  const [row] = await db
    .select()
    .from(siteMessages)
    .where(
      and(eq(siteMessages.id, id), eq(siteMessages.orgId, orgId), isNull(siteMessages.deletedAt)),
    );
  if (!row) throw AppError.notFound('Site message not found');
  return row;
}

export async function listMessages(orgId: string, siteId?: string): Promise<SiteMessage[]> {
  const conditions = [eq(siteMessages.orgId, orgId), isNull(siteMessages.deletedAt)];
  if (siteId) conditions.push(eq(siteMessages.siteId, siteId));
  return db
    .select()
    .from(siteMessages)
    .where(and(...conditions))
    .orderBy(desc(siteMessages.createdAt));
}

export async function updateMessage(
  orgId: string,
  id: string,
  patch: Partial<{
    name: string;
    type: SiteMessage['type'];
    trigger: SiteMessage['trigger'];
    conditions: SiteMessage['conditions'];
    headline: string | null;
    body: string | null;
    ctaText: string | null;
    ctaUrl: string | null;
    style: Record<string, unknown>;
    showOncePerVisitor: boolean;
    showOncePerSession: boolean;
    delaySeconds: number;
    active: boolean;
  }>,
): Promise<SiteMessage> {
  await getMessage(orgId, id);
  const [row] = await db
    .update(siteMessages)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(siteMessages.id, id), eq(siteMessages.orgId, orgId)))
    .returning();
  return row!;
}

export async function deleteMessage(orgId: string, id: string): Promise<void> {
  await getMessage(orgId, id);
  await db
    .update(siteMessages)
    .set({ deletedAt: new Date() })
    .where(and(eq(siteMessages.id, id), eq(siteMessages.orgId, orgId)));
}

// ─── Public: resolve active messages for a visitor ────────────────────────────

/**
 * Returns the list of active messages that should be displayed to this visitor.
 * Excludes messages the visitor has already seen (when showOncePerVisitor=true).
 */
export async function resolveMessagesForVisitor(input: {
  siteToken: string;
  visitorId: string;
  url?: string;
  sessionId?: string;
}): Promise<SiteMessage[]> {
  // Resolve org from site token
  const { getSiteByToken } = await import('../tracking/site-tracker.js');
  const site = await getSiteByToken(input.siteToken);
  if (!site) return [];

  // Get all active messages for this site/org
  const messages = await db
    .select()
    .from(siteMessages)
    .where(
      and(
        eq(siteMessages.orgId, site.orgId),
        eq(siteMessages.active, true),
        isNull(siteMessages.deletedAt),
      ),
    );

  // Get impressions for this visitor
  const seen = await db
    .select({ messageId: siteMessageImpressions.messageId })
    .from(siteMessageImpressions)
    .where(eq(siteMessageImpressions.visitorId, input.visitorId));
  const seenIds = new Set(seen.map((s) => s.messageId));

  return messages.filter((m) => {
    if (m.showOncePerVisitor && seenIds.has(m.id)) return false;
    if (m.siteId && m.siteId !== site.id) return false;
    return true;
  });
}

// ─── Record impression ────────────────────────────────────────────────────────

export async function recordImpression(input: {
  siteToken: string;
  messageId: string;
  visitorId: string;
  contactId?: string;
  clicked?: boolean;
  dismissed?: boolean;
}): Promise<void> {
  const { getSiteByToken } = await import('../tracking/site-tracker.js');
  const site = await getSiteByToken(input.siteToken);
  if (!site) return;

  await db
    .insert(siteMessageImpressions)
    .values({
      orgId: site.orgId,
      messageId: input.messageId,
      visitorId: input.visitorId,
      contactId: input.contactId ?? null,
      clicked: input.clicked ?? false,
      dismissed: input.dismissed ?? false,
    })
    .onConflictDoNothing();
}
