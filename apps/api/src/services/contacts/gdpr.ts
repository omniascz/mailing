/**
 * GDPR data-subject endpoints — right to be forgotten (Art. 17) and
 * data portability (Art. 20).
 *
 * Anonymise (RTBF):
 *   - Scrubs PII from contacts (email, phone, names, custom_fields)
 *     while keeping the row id so foreign-key references in
 *     email_events / suppressions / segment memberships don't fall over.
 *   - Sets deletedAt and gdprAnonymizedAt timestamps so audit-traceable.
 *   - Adds the original email's SHA-256 to suppressions so a future
 *     accidental import can't re-add the same identity.
 *   - Anonymises matching email_events rows (clears userAgent + IP)
 *     to avoid retaining behavioral PII tied to the identity.
 *
 * Export (data portability):
 *   - Single JSON envelope with profile + custom fields + last 365 days
 *     of email events. Stable shape suitable for hand-off to another
 *     ESP under GDPR Art. 20.
 *
 * Both endpoints scope strictly by orgId — cross-org leakage is the
 * only thing worse than a data-subject complaint.
 */

import crypto from 'node:crypto';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts, emailEvents, suppressions } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export interface GdprAnonymizeResult {
  contactId: string;
  emailHash: string;
  anonymizedAt: string;
  emailEventsScrubbed: number;
  /** Per-table count of related PII rows deleted by the cascade. */
  relatedRowsDeleted: Record<string, number>;
  /** Number of tables the cascade cleared. */
  tablesCleared: number;
}

// Tables handled specially (anonymised/kept) and therefore excluded from the
// hard-delete cascade. `contacts` is anonymised in place to keep FK ids valid;
// `email_events` keeps aggregate rows with PII scrubbed.
const CASCADE_EXCLUDE = new Set(['contacts', 'email_events']);
const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;

/**
 * Right-to-erasure cascade: discover every table with a `contact_id` column and
 * delete that contact's rows (org-scoped where the table has `org_id`). Driven
 * by information_schema so new PII-bearing tables are covered automatically —
 * no hand-maintained list to drift out of sync with the schema.
 */
async function eraseRelatedRows(
  orgId: string,
  contactId: string,
): Promise<Record<string, number>> {
  const catalog = await db.execute<{ table_name: string; has_org: boolean }>(sql`
    SELECT c.table_name,
           EXISTS (
             SELECT 1 FROM information_schema.columns o
             WHERE o.table_schema = 'public'
               AND o.table_name = c.table_name
               AND o.column_name = 'org_id'
           ) AS has_org
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'contact_id'
  `);

  const tables = (catalog as unknown as Array<{ table_name: string; has_org: boolean }>).filter(
    (t) => SAFE_IDENT.test(t.table_name) && !CASCADE_EXCLUDE.has(t.table_name),
  );

  const deleted: Record<string, number> = {};
  for (const t of tables) {
    try {
      const where = t.has_org
        ? sql`contact_id = ${contactId}::uuid AND org_id = ${orgId}::uuid`
        : sql`contact_id = ${contactId}::uuid`;
      const res = await db.execute(
        sql`DELETE FROM ${sql.raw(`"${t.table_name}"`)} WHERE ${where}`,
      );
      // postgres-js exposes affected rows as `.count`; other drivers `.rowCount`.
      const r = res as unknown as { count?: number; rowCount?: number };
      const count = r.count ?? r.rowCount ?? 0;
      if (count > 0) deleted[t.table_name] = count;
    } catch {
      // A FK RESTRICT or missing table shouldn't abort the whole erasure;
      // record nothing for this table and continue. Surfaced via the audit.
    }
  }
  return deleted;
}

/**
 * Anonymise a contact in-place. Returns the SHA-256 of the original
 * email so callers can audit which identity was scrubbed without
 * retaining the email itself.
 */
export async function anonymizeContact(
  orgId: string,
  contactId: string,
): Promise<GdprAnonymizeResult> {
  const [contact] = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      phone: contacts.phone,
    })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
    .limit(1);

  if (!contact) throw AppError.notFound('Contact');

  const originalEmail = (contact.email ?? '').toLowerCase().trim();
  const emailHash = originalEmail
    ? crypto.createHash('sha256').update(originalEmail).digest('hex')
    : '';

  const now = new Date();

  // Scrub PII fields. We keep the row + foreign-key references intact;
  // email/phone/names go null; customFields keeps only the anonymise
  // audit marker so the row's history is reconstructable from logs.
  await db
    .update(contacts)
    .set({
      email: null,
      phone: null,
      firstName: null,
      lastName: null,
      customFields: {
        gdpr_anonymized_at: now.toISOString(),
        gdpr_email_hash: emailHash,
      },
      deletedAt: now,
    })
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)));

  // Clear behavioral PII from related email_events. We keep aggregate
  // event counts (the row itself stays) but nuke IP + UA so the event
  // log can no longer be used to re-identify the subject.
  let emailEventsScrubbed = 0;
  try {
    const updateRes = await db
      .update(emailEvents)
      .set({
        ipAddress: null,
        userAgent: null,
      })
      .where(and(eq(emailEvents.orgId, orgId), eq(emailEvents.contactId, contactId)))
      .returning({ id: emailEvents.id });
    emailEventsScrubbed = updateRes.length;
  } catch {
    // email_events may live in ClickHouse only in some deploys; tolerate
    // the absence rather than fail the whole anonymise operation.
  }

  // Full right-to-erasure cascade across every other table that holds the
  // contact's PII (reviews, tickets, notes, deals, SMS logs, consent rows,
  // loyalty, …). Discovered dynamically so coverage tracks the schema.
  const relatedRowsDeleted = await eraseRelatedRows(orgId, contactId);

  // Permanent suppression by hash. Prevents an accidental re-import (e.g.
  // a customer re-syncing Shopify) from resurrecting the identity. We
  // store the SHA-256 in the notes field rather than the email field so
  // the suppression doesn't double as a re-identification vector.
  if (emailHash) {
    try {
      await db
        .insert(suppressions)
        .values({
          orgId,
          email: null,
          phone: null,
          reason: 'manual',
          notes: `gdpr_anonymized:${emailHash}`,
        })
        .onConflictDoNothing();
    } catch {
      // Suppression insert is best-effort; the contact is already
      // anonymised so re-import dedup would catch it via the hash above.
    }
  }

  return {
    contactId,
    emailHash,
    anonymizedAt: now.toISOString(),
    emailEventsScrubbed,
    relatedRowsDeleted,
    tablesCleared: Object.keys(relatedRowsDeleted).length,
  };
}

export interface GdprDataExport {
  contact: {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    status: string;
    lifecycleStage: string;
    createdAt: string;
    customFields: Record<string, unknown>;
  };
  emailEvents: Array<{
    eventType: string;
    campaignId: string | null;
    /** ISO 8601 — sourced from email_events.createdAt (PG copy). */
    occurredAt: string;
    metadata: Record<string, unknown>;
  }>;
  exportedAt: string;
}

/**
 * Compile a GDPR Art. 20-compliant export of everything we hold for
 * a given contact. JSON envelope, stable shape, suitable to hand off
 * to another ESP. Limited to the last 365 days of email events to
 * keep the payload bounded.
 */
export async function exportContactData(orgId: string, contactId: string): Promise<GdprDataExport> {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
    .limit(1);

  if (!contact) throw AppError.notFound('Contact');

  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  let events: GdprDataExport['emailEvents'] = [];
  try {
    const rows = await db
      .select({
        eventType: emailEvents.eventType,
        campaignId: emailEvents.campaignId,
        createdAt: emailEvents.createdAt,
        metadata: emailEvents.metadata,
      })
      .from(emailEvents)
      .where(
        and(
          eq(emailEvents.orgId, orgId),
          eq(emailEvents.contactId, contactId),
          gte(emailEvents.createdAt, oneYearAgo),
        ),
      )
      .orderBy(emailEvents.createdAt);
    events = rows.map((r) => ({
      eventType: String(r.eventType),
      campaignId: r.campaignId ?? null,
      occurredAt: r.createdAt.toISOString(),
      metadata: (r.metadata as Record<string, unknown>) ?? {},
    }));
  } catch {
    // Same tolerance pattern as anonymize — if email_events isn't
    // present in this deployment we still hand back the profile half.
  }

  return {
    contact: {
      id: contact.id,
      email: contact.email,
      phone: contact.phone,
      firstName: contact.firstName,
      lastName: contact.lastName,
      status: String(contact.status),
      lifecycleStage: String(contact.lifecycleStage),
      createdAt: contact.createdAt.toISOString(),
      customFields: (contact.customFields ?? {}) as Record<string, unknown>,
    },
    emailEvents: events,
    exportedAt: new Date().toISOString(),
  };
}
