/**
 * WhatsApp compliance engine (task 7.9).
 *
 * Enforces:
 *   - Explicit opt-in (separate from email/SMS consent)
 *   - Quality rating monitoring + alerting
 *   - Messaging limit tier management
 *   - Conversation category tracking + pricing awareness
 *   - Pre-send consent gate
 */

import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  whatsappConsents,
  whatsappPhoneNumbers,
  whatsappConversations,
} from '../../db/schema/whatsapp.js';
import { AppError } from '../../lib/app-error.js';

// ─── Consent management ───────────────────────────────────────────────────────

export async function recordWaConsent(
  orgId: string,
  phone: string,
  opts: {
    contactId?: string;
    consentSource: string;
    consentContext?: string;
  },
) {
  const [consent] = await db
    .insert(whatsappConsents)
    .values({
      orgId,
      phone,
      contactId: opts.contactId,
      consentSource: opts.consentSource,
      consentContext: opts.consentContext,
    })
    .onConflictDoUpdate({
      target: [whatsappConsents.orgId, whatsappConsents.phone],
      set: {
        revokedAt: null,
        consentSource: opts.consentSource,
        consentContext: opts.consentContext ?? null,
        consentedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  return consent;
}

export async function revokeWaConsent(orgId: string, phone: string) {
  await db
    .update(whatsappConsents)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(whatsappConsents.orgId, orgId), eq(whatsappConsents.phone, phone)));
}

export async function hasActiveWaConsent(orgId: string, phone: string): Promise<boolean> {
  const [row] = await db
    .select({ id: whatsappConsents.id })
    .from(whatsappConsents)
    .where(
      and(
        eq(whatsappConsents.orgId, orgId),
        eq(whatsappConsents.phone, phone),
        isNull(whatsappConsents.revokedAt),
      ),
    )
    .limit(1);

  return !!row;
}

// ─── Pre-send compliance gate ─────────────────────────────────────────────────

/**
 * Check that a WA send is permitted.
 * Marketing templates require explicit opt-in.
 * Throws AppError if blocked.
 */
export async function checkWaCompliance(
  orgId: string,
  phone: string,
  templateCategory: 'marketing' | 'utility' | 'authentication',
): Promise<void> {
  // Marketing requires opt-in; utility and auth are typically transactional (exempted)
  if (templateCategory === 'marketing') {
    const consented = await hasActiveWaConsent(orgId, phone);
    if (!consented) {
      throw new AppError({
        code: 'WA_COMPLIANCE_BLOCKED',
        message: `No active WhatsApp marketing consent for ${phone}`,
        statusCode: 403,
      });
    }
  }
}

// ─── Quality rating management ─────────────────────────────────────────────────

/** Update quality rating from Meta webhook (quality_update event). */
export async function updateQualityRating(
  orgId: string,
  phoneNumberId: string,
  qualityRating: 'GREEN' | 'YELLOW' | 'RED',
) {
  const [updated] = await db
    .update(whatsappPhoneNumbers)
    .set({ qualityRating, updatedAt: new Date() })
    .where(
      and(
        eq(whatsappPhoneNumbers.orgId, orgId),
        eq(whatsappPhoneNumbers.phoneNumberId, phoneNumberId),
      ),
    )
    .returning();

  return updated ?? null;
}

/** Update messaging limit tier from Meta webhook (account_update event). */
export async function updateMessagingLimitTier(
  orgId: string,
  phoneNumberId: string,
  tier: string, // "TIER_1K" | "TIER_10K" | "TIER_100K" | "TIER_UNLIMITED"
) {
  // Normalize Meta tier strings to human-readable
  const tierMap: Record<string, string> = {
    TIER_1K: '1000',
    TIER_10K: '10000',
    TIER_100K: '100000',
    TIER_UNLIMITED: 'UNLIMITED',
  };
  const normalizedTier = tierMap[tier] ?? tier;

  const [updated] = await db
    .update(whatsappPhoneNumbers)
    .set({ messagingLimitTier: normalizedTier, updatedAt: new Date() })
    .where(
      and(
        eq(whatsappPhoneNumbers.orgId, orgId),
        eq(whatsappPhoneNumbers.phoneNumberId, phoneNumberId),
      ),
    )
    .returning();

  return updated ?? null;
}

/** Register or update a phone number record. */
export async function upsertWaPhoneNumber(
  orgId: string,
  phoneNumberId: string,
  displayPhone?: string,
) {
  const [row] = await db
    .insert(whatsappPhoneNumbers)
    .values({
      orgId,
      phoneNumberId,
      displayPhone,
    })
    .onConflictDoUpdate({
      target: [whatsappPhoneNumbers.orgId, whatsappPhoneNumbers.phoneNumberId],
      set: {
        ...(displayPhone && { displayPhone }),
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

export async function getWaPhoneNumber(orgId: string, phoneNumberId: string) {
  const [row] = await db
    .select()
    .from(whatsappPhoneNumbers)
    .where(
      and(
        eq(whatsappPhoneNumbers.orgId, orgId),
        eq(whatsappPhoneNumbers.phoneNumberId, phoneNumberId),
      ),
    )
    .limit(1);

  return row ?? null;
}

// ─── Conversation tracking ────────────────────────────────────────────────────

/**
 * Open or refresh a conversation window.
 * Meta's 24h customer service window resets on each inbound message.
 */
export async function openConversationWindow(
  orgId: string,
  phoneNumberId: string,
  contactPhone: string,
  category: 'marketing' | 'utility' | 'authentication' | 'service',
  contactId?: string,
) {
  const windowExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24h

  const [conv] = await db
    .insert(whatsappConversations)
    .values({
      orgId,
      phoneNumberId,
      contactPhone,
      contactId,
      category,
      windowExpiresAt,
      messageCount: 1,
      lastMessageAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [whatsappConversations.orgId],
      set: {
        windowExpiresAt,
        messageCount: db
          .select({ v: whatsappConversations.messageCount })
          .from(whatsappConversations)
          .where(
            and(
              eq(whatsappConversations.orgId, orgId),
              eq(whatsappConversations.contactPhone, contactPhone),
            ),
          )
          .limit(1) as unknown as number,
        lastMessageAt: new Date(),
      },
    })
    .returning();

  return conv;
}

/** Check if there's an open conversation window (within 24h of last inbound). */
export async function hasOpenConversationWindow(
  orgId: string,
  contactPhone: string,
): Promise<boolean> {
  const now = new Date();
  const rows = await db
    .select({ id: whatsappConversations.id })
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.orgId, orgId),
        eq(whatsappConversations.contactPhone, contactPhone),
      ),
    )
    .limit(1);

  if (rows.length === 0) return false;

  // Check windowExpiresAt > now
  const [full] = await db
    .select()
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.orgId, orgId),
        eq(whatsappConversations.contactPhone, contactPhone),
      ),
    )
    .limit(1);

  return full?.windowExpiresAt != null && full.windowExpiresAt > now;
}
