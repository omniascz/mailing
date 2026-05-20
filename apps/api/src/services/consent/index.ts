/**
 * Per-channel consent service (Sprint D.4).
 *
 * High-level operations on top of the contact_channel_consents table.
 * The table is row-per-(contact, channel); these helpers absorb the
 * upsert + update-on-revoke pattern so callers don't reinvent it.
 *
 * Channel validation lives here too — `channel` is a varchar column so
 * the DB doesn't enforce membership; we do at the service boundary.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contactChannelConsents, type ContactChannelConsent } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

/**
 * Canonical channel set. 'tracking' covers the ePrivacy cookie-style
 * opt-in (Sprint D.8) — not a send channel but a separate consent
 * surface.
 */
export const KNOWN_CHANNELS = [
  'email',
  'sms',
  'whatsapp',
  'push',
  'voice',
  'in_app',
  'viber',
  'instagram',
  'messenger',
  'tracking',
] as const;

export type ConsentChannel = (typeof KNOWN_CHANNELS)[number];

export function isConsentChannel(value: string): value is ConsentChannel {
  return (KNOWN_CHANNELS as readonly string[]).includes(value);
}

function assertChannel(channel: string): asserts channel is ConsentChannel {
  if (!isConsentChannel(channel)) {
    throw AppError.badRequest(`Unknown consent channel: ${channel}`);
  }
}

// ─── Record / revoke ─────────────────────────────────────────────────────────

export interface RecordConsentInput {
  orgId: string;
  contactId: string;
  channel: string;
  source: string;
  consentText?: string;
  ipAddress?: string;
  userAgent?: string;
  importedFrom?: string;
}

/**
 * Idempotent opt-in. New (contact, channel) pair → INSERT. Existing
 * row → UPDATE optedIn=true, refresh consentedAt, clear revokedAt.
 */
export async function recordConsent(input: RecordConsentInput): Promise<ContactChannelConsent> {
  assertChannel(input.channel);
  const now = new Date();

  const [row] = await db
    .insert(contactChannelConsents)
    .values({
      orgId: input.orgId,
      contactId: input.contactId,
      channel: input.channel,
      optedIn: true,
      source: input.source,
      consentText: input.consentText ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      importedFrom: input.importedFrom ?? null,
      consentedAt: now,
      revokedAt: null,
      revokeReason: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [contactChannelConsents.contactId, contactChannelConsents.channel],
      set: {
        optedIn: true,
        source: input.source,
        consentText: input.consentText ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        importedFrom: input.importedFrom ?? null,
        consentedAt: now,
        revokedAt: null,
        revokeReason: null,
        updatedAt: now,
      },
    })
    .returning();

  if (!row) throw AppError.internal('Failed to record consent');
  return row;
}

export interface RevokeConsentInput {
  orgId: string;
  contactId: string;
  channel: string;
  reason?: string;
}

/**
 * Revoke flips optedIn=false on the existing row (no-op if there is no
 * row — we never "implicitly" had consent so nothing to revoke).
 * Returns null when no row existed; the calling layer can decide
 * whether that's a 404 or a silent OK.
 */
export async function revokeConsent(
  input: RevokeConsentInput,
): Promise<ContactChannelConsent | null> {
  assertChannel(input.channel);
  const now = new Date();

  const [row] = await db
    .update(contactChannelConsents)
    .set({
      optedIn: false,
      revokedAt: now,
      revokeReason: (input.reason ?? '').slice(0, 255) || null,
      updatedAt: now,
    })
    .where(
      and(
        eq(contactChannelConsents.orgId, input.orgId),
        eq(contactChannelConsents.contactId, input.contactId),
        eq(contactChannelConsents.channel, input.channel),
      ),
    )
    .returning();

  return row ?? null;
}

// ─── Read helpers ────────────────────────────────────────────────────────────

/**
 * All consent rows for a contact, keyed by channel for easy `.get()` access.
 * Returns an empty Map when the contact has never opted in on any channel.
 */
export async function getChannelStates(
  orgId: string,
  contactId: string,
): Promise<Map<string, ContactChannelConsent>> {
  const rows = await db
    .select()
    .from(contactChannelConsents)
    .where(
      and(eq(contactChannelConsents.orgId, orgId), eq(contactChannelConsents.contactId, contactId)),
    );
  return new Map(rows.map((r) => [r.channel, r]));
}

/**
 * Bulk lookup: returns the set of contactIds currently opted-in on a
 * given channel. Lookup is org-scoped + channel-scoped + bounded by the
 * provided candidateIds list — same shape as the other batch endpoints
 * the worker uses for pre-send checks (Sprint B.8).
 */
export async function listOptedInContacts(
  orgId: string,
  channel: string,
  candidateIds: string[],
): Promise<Set<string>> {
  assertChannel(channel);
  if (candidateIds.length === 0) return new Set();

  const rows = await db
    .select({ contactId: contactChannelConsents.contactId })
    .from(contactChannelConsents)
    .where(
      and(
        eq(contactChannelConsents.orgId, orgId),
        eq(contactChannelConsents.channel, channel),
        eq(contactChannelConsents.optedIn, true),
        inArray(contactChannelConsents.contactId, candidateIds),
      ),
    );

  return new Set(rows.map((r) => r.contactId));
}
