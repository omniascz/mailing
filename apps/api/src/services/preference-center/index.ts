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

import { and, eq, inArray, isNull, isNotNull } from 'drizzle-orm';
import { verifyTrackingToken, type PreferenceCenterPayload } from '@forgemsg/shared';
import { db } from '../../db/client.js';
import {
  consentEvents,
  contacts,
  lists,
  contactLists,
  suppressions,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { unsubscribeContact, type UnsubscribeHttpMethod } from '../contacts/unsubscribe.js';
import { hashIp, resubscribeContact } from '../contacts/resubscribe.js';
import { suppressionEmailIs } from '../suppressions/email.js';

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
  /** Whether the recipient can undo it here: the only thing suppressing the
   *  address is their own unsubscribe. A bounce or a complaint is not theirs
   *  to lift, and the page does not offer it. */
  canResubscribe: boolean;
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

/**
 * How long a preference link may bring someone back: 30 days from `ts`, the
 * moment the link was minted (batch-sender: the send; browser-view: the
 * e-mail the copy is of).
 *
 * The token never expired, so a link out of a year-old e-mail — forwarded,
 * leaked, sitting in an archive — lifted the recipient's own unsubscribe and
 * reopened the lists they had left, and the next campaign reached them. A
 * resubscribe is a consent; a fresh e-mail is the proof the link is still the
 * recipient's. Leaving is never limited: viewing the page, unsubscribing from
 * everything or from a list work with a link of any age. Someone who left more
 * than 30 days ago comes back through a signup form with double opt-in.
 */
export const PREF_RESUBSCRIBE_MAX_AGE_S = 30 * 86_400;
/** Clock skew between the worker that minted the link and this process. */
const PREF_FUTURE_SKEW_S = 300;

/** Whether this pref link is young enough to raise consent (resubscribe). */
export function prefTokenMayResubscribe(payload: { ts?: unknown }, now = Date.now()): boolean {
  const ts = payload.ts;
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return false;
  const age = now / 1000 - ts;
  return age >= -PREF_FUTURE_SKEW_S && age < PREF_RESUBSCRIBE_MAX_AGE_S;
}

interface ResolvedToken {
  orgId: string;
  contactId: string;
  mayResubscribe: boolean;
}

function resolveToken(token: string): ResolvedToken {
  const payload = verifyTrackingToken(token);
  if (!payload || payload.type !== 'pref') {
    throw AppError.unauthorized('Invalid or expired preference-center token');
  }
  const pref = payload as PreferenceCenterPayload;
  return {
    orgId: pref.orgId,
    contactId: pref.contactId,
    mayResubscribe: prefTokenMayResubscribe(pref),
  };
}

/**
 * Masks an email so it can render on a public page that might be forwarded
 * or screenshotted without leaking the full address. Keeps the first letter
 * + last letter of the local part + full domain ("p***r@example.cz").
 */
export function maskEmail(email: string | null): string {
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
  return (await loadPreferences(token)).view;
}

/**
 * The view, and whether the link is too old for a way back the page would
 * otherwise offer — the page says so instead of showing the button or the
 * boxes of the lists the contact left.
 */
export async function loadPreferences(
  token: string,
): Promise<{ view: PreferenceCenterView; resubscribeExpired: boolean }> {
  const { orgId, contactId, mayResubscribe } = resolveToken(token);

  const [contact] = await db
    .select({
      email: contacts.email,
      status: contacts.status,
      deletedAt: contacts.deletedAt,
    })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);

  if (!contact || contact.deletedAt) {
    throw AppError.notFound('Contact');
  }

  const globalRows = contact.email
    ? await db
        .select({ reason: suppressions.reason })
        .from(suppressions)
        .where(and(eq(suppressions.orgId, orgId), suppressionEmailIs(contact.email)))
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

  const ownUnsubscribeOnly =
    contact.status === 'unsubscribed' &&
    globalRows.length > 0 &&
    globalRows.every((r) => r.reason === 'unsubscribe');
  const globallyUnsubscribed = globalRows.length > 0;
  const view: PreferenceCenterView = {
    emailMasked: maskEmail(contact.email),
    globallyUnsubscribed,
    canResubscribe: ownUnsubscribeOnly && mayResubscribe,
    lists: listRows.map((r) => ({
      id: r.id,
      name: r.name,
      subscribed: !r.unsubscribedAt,
      subscribedAt: r.addedAt ? r.addedAt.toISOString() : null,
      unsubscribedAt: r.unsubscribedAt ? r.unsubscribedAt.toISOString() : null,
    })),
  };
  const wouldOffer = globallyUnsubscribed
    ? ownUnsubscribeOnly
    : view.lists.some((l) => !l.subscribed);
  return { view, resubscribeExpired: !mayResubscribe && wouldOffer };
}

// ─── POST — update preferences ───────────────────────────────────────────────

export interface UpdateRequest {
  /** When true, add (or refresh) a row in `suppressions` and clear every
   *  per-list subscription. Equivalent to "Unsubscribe from all". */
  globalUnsubscribe?: boolean;
  /** When true, undo the recipient's own global unsubscribe — the
   *  'unsubscribe' suppression and the status, never a bounce or complaint
   *  (services/contacts/resubscribe.ts) — but does NOT resubscribe individual
   *  lists, those need explicit toggles below. */
  globalResubscribe?: boolean;
  /** List IDs to unsubscribe from. Sets contact_lists.unsubscribed_at. */
  unsubscribeFromLists?: string[];
  /** List IDs to resubscribe to: clears unsubscribed_at on a list the contact
   *  left. Never creates a membership — a list they were never on is not a
   *  way back, and is dropped. */
  resubscribeToLists?: string[];
  /** Free-text reason recorded against the suppression / per-list unsub.
   *  Stored verbatim; surface in support tooling. */
  reason?: string;
}

export interface UpdateResult {
  globallyUnsubscribed: boolean;
  listChanges: { listId: string; subscribed: boolean }[];
  /** Present only when a resubscribe in the request was not carried out
   *  because the link is older than PREF_RESUBSCRIBE_MAX_AGE_S. */
  resubscribeRefused?: 'link_expired';
}

/** Which of these ids are live lists of this organisation. */
async function listsOfOrg(orgId: string, ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();
  const rows = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.orgId, orgId), inArray(lists.id, unique), isNull(lists.deletedAt)));
  return new Set(rows.map((r) => r.id));
}

/** Who is acting, for the consent records an unsubscribe or a resubscribe writes. */
export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
  /** 'page' — the button on the preference page; 'api' — the JSON body. */
  via: 'page' | 'api';
  /** The request's method, for the opt_out record; absent, it is not written. */
  method?: UnsubscribeHttpMethod;
}

export async function updatePreferences(
  token: string,
  body: UpdateRequest,
  ctx: RequestContext,
): Promise<UpdateResult> {
  const { orgId, contactId, mayResubscribe } = resolveToken(token);

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
  // An old link still unsubscribes; it raises nothing (PREF_RESUBSCRIBE_MAX_AGE_S).
  const resubscribeRefused =
    !mayResubscribe && (!!body.globalResubscribe || (body.resubscribeToLists?.length ?? 0) > 0);

  // 1. Global state. This used to write the suppression alone, leaving
  //    contacts.status at 'active' — so the same person read as subscribed in
  //    the UI while the send path refused to mail them.
  if (body.globalUnsubscribe) {
    await unsubscribeContact(orgId, contactId, {
      scope: { kind: 'global' },
      source: 'preference_centre',
      reason,
      ipAddress: ctx.ip ?? undefined,
      userAgent: ctx.userAgent ?? undefined,
      httpMethod: ctx.method,
    });
  }

  if (body.globalResubscribe && mayResubscribe) {
    // Undoes the recipient's own global unsubscribe: the 'unsubscribe'
    // suppression AND the status, which batch-sender refuses on. This used to
    // delete the suppression row whatever its reason and leave the status — so
    // the person who came back got nothing, while a hard-bounced or complained
    // address had its gate lifted. Only an 'unsubscribed' contact is brought
    // back; one that never subscribed is not subscribed by this. We
    // intentionally do NOT touch per-list unsubscribedAt — the user must
    // re-opt-in to each list explicitly.
    await resubscribeContact(orgId, contactId, {
      from: ['unsubscribed'],
      proof: {
        eventType: 're_consent',
        source: 'preference_center',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { via: ctx.via, lists: body.resubscribeToLists ?? [] },
      },
    });
  }

  // 2. Per-list toggles — only on this organisation's lists.
  //
  // The token proves who the contact is; it says nothing about the list ids
  // beside it in the body. resubscribeToLists used to insert a membership for
  // any id it was given, so a token issued by one organisation put its contact
  // on another's list. Ids that are not a live list of the token's
  // organisation are dropped here, before either loop sees them.
  const ownListIds = await listsOfOrg(orgId, [
    ...(body.unsubscribeFromLists ?? []),
    ...(body.resubscribeToLists ?? []),
  ]);
  const unsubscribeFrom = (body.unsubscribeFromLists ?? []).filter((id) => ownListIds.has(id));
  const resubscribeTo = mayResubscribe
    ? (body.resubscribeToLists ?? []).filter((id) => ownListIds.has(id))
    : [];

  if (unsubscribeFrom.length) {
    for (const listId of unsubscribeFrom) {
      // Still conditional on unsubscribedAt being null — unsubscribeContact
      // keeps that behaviour and reports whether anything changed, which is
      // what listChanges was already using the RETURNING row for.
      const result = await unsubscribeContact(orgId, contactId, {
        scope: { kind: 'list', listId },
        source: 'preference_centre',
        reason,
        ipAddress: ctx.ip ?? undefined,
        userAgent: ctx.userAgent ?? undefined,
        httpMethod: ctx.method,
      });
      if (result.changed) listChanges.push({ listId, subscribed: false });
    }
  }

  if (resubscribeTo.length) {
    for (const listId of resubscribeTo) {
      // Only back to a list they left. This used to insert a membership for a
      // live list the contact had never been on, confirmed now and with no
      // consent event — a subscription nobody asked for, from a link.
      //
      // The way back is a consent, and is recorded as one with the row it
      // reopened: same transaction, so there is never a reopened list without
      // its re_consent, nor a re_consent for a list that stayed closed.
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
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
        if (row) {
          await tx.insert(consentEvents).values({
            orgId,
            contactId,
            eventType: 're_consent',
            legalBasis: 'consent',
            channel: 'email',
            purposeCode: 'marketing_email',
            ipHash: hashIp(ctx.ip),
            userAgent: ctx.userAgent?.slice(0, 1000) ?? null,
            source: 'preference_center',
            proofPayload: { listId: row.listId, via: ctx.via },
          });
        }
        return row;
      });

      if (updated) listChanges.push({ listId: updated.listId, subscribed: true });
    }
  }

  // 3. Recompute global state for the response
  const globalStillSuppressed = contact.email
    ? (
        await db
          .select({ id: suppressions.id })
          .from(suppressions)
          .where(and(eq(suppressions.orgId, orgId), suppressionEmailIs(contact.email)))
          .limit(1)
      ).length > 0
    : false;

  return {
    globallyUnsubscribed: globalStillSuppressed,
    listChanges,
    ...(resubscribeRefused ? { resubscribeRefused: 'link_expired' as const } : {}),
  };
}
