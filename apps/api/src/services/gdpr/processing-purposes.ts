/**
 * GDPR processing purposes service.
 *
 * Manages org-level purpose definitions and per-contact consent records.
 * Consent history is append-only — each change inserts a new row.
 * The "current" state is the most recent row per (contactId, purposeId).
 */

import { db } from '../../db/client.js';
import { processingPurposes, contactGdprConsents } from '../../db/schema/processing-purposes.js';
import type {
  ProcessingPurpose,
  NewProcessingPurpose,
  ContactGdprConsent,
} from '../../db/schema/processing-purposes.js';
import { and, eq, isNull, lte, desc } from 'drizzle-orm';

// ─── Purpose management ───────────────────────────────────────────────────────

export async function listPurposes(orgId: string): Promise<ProcessingPurpose[]> {
  return db
    .select()
    .from(processingPurposes)
    .where(and(eq(processingPurposes.orgId, orgId), eq(processingPurposes.archived, false)))
    .orderBy(processingPurposes.createdAt);
}

export async function getPurpose(orgId: string, id: string): Promise<ProcessingPurpose | null> {
  const [row] = await db
    .select()
    .from(processingPurposes)
    .where(and(eq(processingPurposes.orgId, orgId), eq(processingPurposes.id, id)));
  return row ?? null;
}

export async function createPurpose(
  data: Omit<NewProcessingPurpose, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<ProcessingPurpose> {
  const [row] = await db.insert(processingPurposes).values(data).returning();
  return row!;
}

export async function updatePurpose(
  orgId: string,
  id: string,
  data: Partial<Pick<ProcessingPurpose, 'name' | 'description' | 'legalBasis' | 'retentionDays' | 'archived'>>,
): Promise<ProcessingPurpose | null> {
  const [row] = await db
    .update(processingPurposes)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(processingPurposes.orgId, orgId), eq(processingPurposes.id, id)))
    .returning();
  return row ?? null;
}

export async function archivePurpose(orgId: string, id: string): Promise<void> {
  await db
    .update(processingPurposes)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(processingPurposes.orgId, orgId), eq(processingPurposes.id, id)));
}

// ─── Contact consent records ──────────────────────────────────────────────────

export interface GrantConsentInput {
  orgId: string;
  contactId: string;
  purposeId: string;
  source: string;
  consentText?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function grantConsent(input: GrantConsentInput): Promise<ContactGdprConsent> {
  // Look up retention days to compute expiresAt
  const [purpose] = await db
    .select({ retentionDays: processingPurposes.retentionDays })
    .from(processingPurposes)
    .where(eq(processingPurposes.id, input.purposeId));

  const now = new Date();
  let expiresAt: Date | null = null;
  if (purpose?.retentionDays) {
    expiresAt = new Date(now.getTime() + purpose.retentionDays * 86_400_000);
  }

  const [row] = await db
    .insert(contactGdprConsents)
    .values({
      orgId: input.orgId,
      contactId: input.contactId,
      purposeId: input.purposeId,
      granted: true,
      source: input.source,
      consentText: input.consentText,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      grantedAt: now,
      expiresAt,
    })
    .returning();

  return row!;
}

export interface RevokeConsentInput {
  orgId: string;
  contactId: string;
  purposeId: string;
  reason?: string;
}

export async function revokeConsent(input: RevokeConsentInput): Promise<ContactGdprConsent> {
  const [row] = await db
    .insert(contactGdprConsents)
    .values({
      orgId: input.orgId,
      contactId: input.contactId,
      purposeId: input.purposeId,
      granted: false,
      source: 'explicit_revoke',
      revokedAt: new Date(),
      revokeReason: input.reason,
    })
    .returning();

  return row!;
}

/**
 * Fetch the most recent consent record for each purpose for a given contact.
 * Returns a map: purposeId → latest ContactGdprConsent.
 */
export async function getContactConsentStates(
  orgId: string,
  contactId: string,
): Promise<Map<string, ContactGdprConsent>> {
  // Subquery-based approach: get the latest record per purposeId
  const rows = await db
    .select()
    .from(contactGdprConsents)
    .where(
      and(
        eq(contactGdprConsents.orgId, orgId),
        eq(contactGdprConsents.contactId, contactId),
      ),
    )
    .orderBy(desc(contactGdprConsents.createdAt));

  const latest = new Map<string, ContactGdprConsent>();
  for (const row of rows) {
    if (!latest.has(row.purposeId)) latest.set(row.purposeId, row);
  }
  return latest;
}

/**
 * Check if a contact has active (granted + not expired + not revoked) consent
 * for a specific processing purpose.
 */
export async function hasActiveConsent(
  orgId: string,
  contactId: string,
  purposeId: string,
): Promise<boolean> {
  const states = await getContactConsentStates(orgId, contactId);
  const record = states.get(purposeId);
  if (!record) return false;
  if (!record.granted) return false;
  if (record.revokedAt) return false;
  if (record.expiresAt && record.expiresAt < new Date()) return false;
  return true;
}

/**
 * Expire consents where expiresAt < now and no explicit revokedAt yet.
 * Called nightly by the cron worker.
 * Returns the count of expired records.
 */
export async function expireStaleConsents(): Promise<number> {
  const now = new Date();
  const result = await db
    .update(contactGdprConsents)
    .set({ revokedAt: now, revokeReason: 'expired', updatedAt: now })
    .where(
      and(
        lte(contactGdprConsents.expiresAt, now),
        isNull(contactGdprConsents.revokedAt),
        eq(contactGdprConsents.granted, true),
      ),
    );

  // Drizzle returns rowCount on pg driver
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}

/**
 * Bulk-revoke all consents for a contact (GDPR erasure / right-to-be-forgotten).
 */
export async function revokeAllConsents(orgId: string, contactId: string): Promise<void> {
  const now = new Date();
  const purposes = await db
    .selectDistinct({ purposeId: contactGdprConsents.purposeId })
    .from(contactGdprConsents)
    .where(
      and(
        eq(contactGdprConsents.orgId, orgId),
        eq(contactGdprConsents.contactId, contactId),
        eq(contactGdprConsents.granted, true),
        isNull(contactGdprConsents.revokedAt),
      ),
    );

  if (!purposes.length) return;

  await db.insert(contactGdprConsents).values(
    purposes.map((p) => ({
      orgId,
      contactId,
      purposeId: p.purposeId,
      granted: false,
      source: 'erasure_request',
      revokedAt: now,
      revokeReason: 'GDPR erasure',
    })),
  );
}

/**
 * Get full consent history for a contact (audit log).
 */
export async function getConsentHistory(
  orgId: string,
  contactId: string,
): Promise<ContactGdprConsent[]> {
  return db
    .select()
    .from(contactGdprConsents)
    .where(
      and(eq(contactGdprConsents.orgId, orgId), eq(contactGdprConsents.contactId, contactId)),
    )
    .orderBy(desc(contactGdprConsents.createdAt));
}
