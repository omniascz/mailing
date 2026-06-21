/**
 * GDPR purpose-aware send guardrail (#644).
 *
 * Checks whether a contact has active consent for a given purpose before
 * allowing an email/SMS/Viber send. Integrates with batch-sender and
 * workflow action executors.
 *
 * Usage:
 *   const check = await checkSendConsent(orgId, contactId, 'marketing_emails');
 *   if (!check.allowed) { skip; }
 */

import { db } from '../../db/client.js';
import { processingPurposes, contactGdprConsents } from '../../db/schema/index.js';
import { and, eq, isNull, desc } from 'drizzle-orm';

export interface ConsentCheckResult {
  allowed: boolean;
  reason: 'no_purpose_configured' | 'consent_granted' | 'no_consent' | 'consent_expired' | 'consent_revoked';
  purposeId?: string;
  purposeSlug?: string;
}

/**
 * Check if a contact has active consent for a purpose identified by slug.
 *
 * If no purpose with the given slug exists for the org, returns allowed=true
 * (opt-in is not enforced for unknown purposes — orgs must explicitly configure them).
 *
 * If the purpose exists, consent must be:
 *  - granted = true
 *  - revokedAt IS NULL
 *  - (expiresAt IS NULL OR expiresAt > NOW())
 */
export async function checkSendConsent(
  orgId: string,
  contactId: string,
  purposeSlug: string,
): Promise<ConsentCheckResult> {
  // Look up the purpose
  const [purpose] = await db
    .select({ id: processingPurposes.id, slug: processingPurposes.slug })
    .from(processingPurposes)
    .where(
      and(
        eq(processingPurposes.orgId, orgId),
        eq(processingPurposes.slug, purposeSlug),
        eq(processingPurposes.archived, false),
      ),
    )
    .limit(1);

  // No purpose configured → allow (not enforced)
  if (!purpose) {
    return { allowed: true, reason: 'no_purpose_configured' };
  }

  // Get latest consent record for this contact + purpose
  const [latest] = await db
    .select()
    .from(contactGdprConsents)
    .where(
      and(
        eq(contactGdprConsents.orgId, orgId),
        eq(contactGdprConsents.contactId, contactId),
        eq(contactGdprConsents.purposeId, purpose.id),
      ),
    )
    .orderBy(desc(contactGdprConsents.grantedAt))
    .limit(1);

  // No consent record → block
  if (!latest) {
    return { allowed: false, reason: 'no_consent', purposeId: purpose.id, purposeSlug: purpose.slug };
  }

  // Revoked → block
  if (latest.revokedAt) {
    return { allowed: false, reason: 'consent_revoked', purposeId: purpose.id, purposeSlug: purpose.slug };
  }

  // Explicitly not granted → block
  if (!latest.granted) {
    return { allowed: false, reason: 'no_consent', purposeId: purpose.id, purposeSlug: purpose.slug };
  }

  // Expired → block
  if (latest.expiresAt && latest.expiresAt < new Date()) {
    return { allowed: false, reason: 'consent_expired', purposeId: purpose.id, purposeSlug: purpose.slug };
  }

  return { allowed: true, reason: 'consent_granted', purposeId: purpose.id, purposeSlug: purpose.slug };
}

/**
 * Bulk pre-check for a batch of contact IDs against a purpose.
 * Returns a Set of contactIds that are BLOCKED (no active consent).
 * Use this in batch-sender to filter before enqueue.
 */
export async function getBatchBlockedContacts(
  orgId: string,
  contactIds: string[],
  purposeSlug: string,
): Promise<Set<string>> {
  if (!contactIds.length) return new Set();

  // Look up the purpose
  const [purpose] = await db
    .select({ id: processingPurposes.id })
    .from(processingPurposes)
    .where(
      and(
        eq(processingPurposes.orgId, orgId),
        eq(processingPurposes.slug, purposeSlug),
        eq(processingPurposes.archived, false),
      ),
    )
    .limit(1);

  // No purpose configured → none blocked
  if (!purpose) return new Set();

  // Get all active consents for the batch
  const { sql, inArray } = await import('drizzle-orm');
  const activeConsents = await db
    .select({ contactId: contactGdprConsents.contactId })
    .from(contactGdprConsents)
    .where(
      and(
        eq(contactGdprConsents.orgId, orgId),
        inArray(contactGdprConsents.contactId, contactIds),
        eq(contactGdprConsents.purposeId, purpose.id),
        eq(contactGdprConsents.granted, true),
        isNull(contactGdprConsents.revokedAt),
        // expiresAt IS NULL OR expiresAt > NOW()
        sql`(${contactGdprConsents.expiresAt} IS NULL OR ${contactGdprConsents.expiresAt} > NOW())`,
      ),
    );

  const consentedSet = new Set(activeConsents.map((r) => r.contactId));
  const blocked = new Set(contactIds.filter((id) => !consentedSet.has(id)));
  return blocked;
}
