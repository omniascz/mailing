/**
 * Shared upsert helper for CDP source connectors (#263).
 * Resolves or creates the contact, then merges trait data into contact_traits.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts } from '../../db/schema/contacts.js';
import { contactTraits } from '../../db/schema/cdp-events.js';

export interface CdpContactInput {
  externalId: string;
  source: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  traits?: Record<string, unknown>;
}

export async function upsertContactFromCdp(
  orgId: string,
  input: CdpContactInput,
): Promise<string> {
  let contactId: string | null = null;

  // 1. Try to find by email
  if (input.email) {
    const [existing] = await db.select({ id: contacts.id }).from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.email, input.email))).limit(1);

    if (existing) {
      contactId = existing.id;
      await db.update(contacts).set({
        firstName: input.firstName ?? undefined,
        lastName: input.lastName ?? undefined,
        phone: input.phone ?? undefined,
        updatedAt: new Date(),
      }).where(eq(contacts.id, contactId));
    }
  }

  // 2. Create if not found
  if (!contactId) {
    const [created] = await db.insert(contacts).values({
      orgId,
      email: input.email ?? `${input.source}:${input.externalId}@noemail.invalid`,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      phone: input.phone ?? null,
      source: input.source,
    } as typeof contacts.$inferInsert).returning({ id: contacts.id });
    contactId = created!.id;
  }

  // 3. Merge traits
  if (input.traits && Object.keys(input.traits).length > 0) {
    await db.insert(contactTraits).values({
      contactId,
      orgId,
      values: input.traits,
    }).onConflictDoUpdate({
      target: contactTraits.contactId,
      set: {
        values: sql`contact_traits.values || ${JSON.stringify(input.traits)}::jsonb`,
        computedAt: new Date(),
      },
    }).catch(() => {});
  }

  return contactId;
}
