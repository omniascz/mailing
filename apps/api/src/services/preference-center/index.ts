/**
 * Public preference center (Sprint D.1).
 *
 * Recipients receive a signed token in the `{{preference_center_url}}` merge
 * tag. They open it, see their lists + global status, can toggle per-list
 * subscriptions, opt out globally, or pause for a period. No login.
 *
 * Token format reuses @forgemsg/shared's tracking-token HMAC scheme — same
 * secret, same Buffer.timingSafeEqual verification, so the only thing that
 * makes a preference-center token different from a click token is the
 * `type: 'pref'` discriminator on the JSON payload.
 */

import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { verifyTrackingToken, type PreferenceCenterPayload } from '@forgemsg/shared';
import { db } from '../../db/client.js';
import { contacts, lists, contactLists, suppressions } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// ─── View shape returned by GET /p/center/:token ─────────────────────────────

export interface PreferenceCenterView {
  /** Email of the contact, redacted to "u***@example.cz" for safety in
   *  shared/forwarded links. Full email surfaces only after a re-auth flow
   *  (out of scope for this sprint). */
  emailMasked: string;
  /** Whether the contact is globally suppressed for the org (i.e. on
   *  the suppressions table). When true, every list opt-in below is
   *  ignored at send time. */
  globallyUnsubscribed: boolean;
  /** Lists the contact is currently on, with their per-list opt-out
   *  state. Only lists whose `deletedAt` IS NULL appear here. */
  lists: Array<{
    id: string;
    name: string;
    subscribed: boolean;
    /** ISO 8601 when added; null for legacy rows. */
    subscribedAt: string | null;
    unsubscribedAt: string | null;
  }>;
}

// ─── Token decoding ──────────────────────────────────────────────────────────

interface ResolvedToken {
  orgId: string;
  contactId: string;
}

function resolveToken(token: string): ResolvedToken {
  const payload = verifyTrackingToken(token);
  if (!payload || payload.type !== 'pref') {
    throw AppError.unauthorized('Invalid or expired preference-center token');
  }
  const pref = payload as PreferenceCenterPayload;
  return { orgId: pref.orgId, contactId: pref.contactId };
}

/**
 * Masks an email so it can render on a public page that might be forwarded
 * or screenshotted without leaking the full address. Keeps the first letter
 * + last letter of the local part + full domain ("p***r@example.cz").
 */
function maskEmail(email: string | null): string {
  if (!email) return '';
  const at = email.lastIndexOf('@');
  if (at < 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0]}*${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 5))}${local[local.length - 1]}${domain}`;
}

// ─── GET — fetch current preferences ─────────────────────────────────────────

export async function getPreferences(token: string): Promise<PreferenceCenterView> {
  const { orgId, contactId } = resolveToken(token);

  const [contact] = await db
    .select({
      email: contacts.email,
      deletedAt: contacts.deletedAt,
    })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);

  if (!contact || contact.deletedAt) {
    throw AppError.notFound('Contact');
  }

  const globalRow = contact.email
    ? await db
        .select({ id: suppressions.id })
        .from(suppressions)
        .where(and(eq(suppressions.orgId, orgId), eq(suppressions.email, contact.email)))
        .limit(1)
    : [];

  const listRows = await db
    .select({
      id: lists.id,
      name: lists.name,
      addedAt: contactLists.addedAt,
      unsubscribedAt: contactLists.unsubscribedAt,
    })
    .from(contactLists)
    .innerJoin(lists, eq(lists.id, contactLists.listId))
    .where(
      and(eq(contactLists.contactId, contactId), eq(lists.orgId, orgId), isNull(lists.deletedAt)),
    )
    .orderBy(lists.name);

  return {
    emailMasked: maskEmail(contact.email),
    globallyUnsubscribed: globalRow.length > 0,
    lists: listRows.map((r) => ({
      id: r.id,
      name: r.name,
      subscribed: !r.unsubscribedAt,
      subscribedAt: r.addedAt ? r.addedAt.toISOString() : null,
      unsubscribedAt: r.unsubscribedAt ? r.unsubscribedAt.toISOString() : null,
    })),
  };
}

// ─── POST — update preferences ───────────────────────────────────────────────

export interface UpdateRequest {
  /** When true, add (or refresh) a row in `suppressions` and clear every
   *  per-list subscription. Equivalent to "Unsubscribe from all". */
  globalUnsubscribe?: boolean;
  /** When true, remove the global suppression (re-opt-in) — but does NOT
   *  resubscribe individual lists, those need explicit toggles below. */
  globalResubscribe?: boolean;
  /** List IDs to unsubscribe from. Sets contact_lists.unsubscribed_at. */
  unsubscribeFromLists?: string[];
  /** List IDs to resubscribe to (clear unsubscribed_at). Re-adds the
   *  contact_lists row when missing (e.g. previously deleted). */
  resubscribeToLists?: string[];
  /** Free-text reason recorded against the suppression / per-list unsub.
   *  Stored verbatim; surface in support tooling. */
  reason?: string;
}

export interface UpdateResult {
  globallyUnsubscribed: boolean;
  listChanges: { listId: string; subscribed: boolean }[];
}

export async function updatePreferences(token: string, body: UpdateRequest): Promise<UpdateResult> {
  const { orgId, contactId } = resolveToken(token);

  const [contact] = await db
    .select({ email: contacts.email, deletedAt: contacts.deletedAt })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);

  if (!contact || contact.deletedAt) {
    throw AppError.notFound('Contact');
  }

  const reason = body.reason?.slice(0, 255) ?? 'preference_center';
  const listChanges: UpdateResult['listChanges'] = [];

  // 1. Global state — suppression row toggle
  if (body.globalUnsubscribe && contact.email) {
    await db
      .insert(suppressions)
      .values({
        orgId,
        email: contact.email,
        reason: 'unsubscribe',
        notes: `pref_center:${reason}`,
      })
      .onConflictDoNothing();
  }

  if (body.globalResubscribe && contact.email) {
    // Hard delete the suppression row so the global gate releases. We
    // intentionally do NOT touch per-list unsubscribedAt — the user must
    // re-opt-in to each list explicitly.
    await db
      .delete(suppressions)
      .where(and(eq(suppressions.orgId, orgId), eq(suppressions.email, contact.email)));
  }

  // 2. Per-list toggles
  const now = new Date();

  if (body.unsubscribeFromLists?.length) {
    for (const listId of body.unsubscribeFromLists) {
      const [updated] = await db
        .update(contactLists)
        .set({ unsubscribedAt: now, unsubscribedReason: reason })
        .where(
          and(
            eq(contactLists.contactId, contactId),
            eq(contactLists.listId, listId),
            isNull(contactLists.unsubscribedAt),
          ),
        )
        .returning({ listId: contactLists.listId });
      if (updated) listChanges.push({ listId: updated.listId, subscribed: false });
    }
  }

  if (body.resubscribeToLists?.length) {
    for (const listId of body.resubscribeToLists) {
      // Try clear unsubscribed_at on existing row
      const [updated] = await db
        .update(contactLists)
        .set({ unsubscribedAt: null, unsubscribedReason: null })
        .where(
          and(
            eq(contactLists.contactId, contactId),
            eq(contactLists.listId, listId),
            isNotNull(contactLists.unsubscribedAt),
          ),
        )
        .returning({ listId: contactLists.listId });

      if (updated) {
        listChanges.push({ listId: updated.listId, subscribed: true });
        continue;
      }

      // No existing membership — create it. Use ON CONFLICT DO NOTHING
      // so a race or stale state doesn't 500.
      const [inserted] = await db
        .insert(contactLists)
        .values({
          contactId,
          listId,
          addedAt: now,
          confirmedAt: now,
        })
        .onConflictDoNothing()
        .returning({ listId: contactLists.listId });
      if (inserted) listChanges.push({ listId: inserted.listId, subscribed: true });
    }
  }

  // 3. Recompute global state for the response
  const globalStillSuppressed = contact.email
    ? (
        await db
          .select({ id: suppressions.id })
          .from(suppressions)
          .where(and(eq(suppressions.orgId, orgId), eq(suppressions.email, contact.email)))
          .limit(1)
      ).length > 0
    : false;

  return {
    globallyUnsubscribed: globalStillSuppressed,
    listChanges,
  };
}
