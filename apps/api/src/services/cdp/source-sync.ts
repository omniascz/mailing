/**
 * Shared upsert helper for CDP source connectors (#263).
 * Resolves or creates the contact, then merges trait data into contact_traits.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts } from '../../db/schema/contacts.js';
import { contactTraits } from '../../db/schema/cdp-events.js';
import { findOrCreateContact } from '../contacts/by-email.js';

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

export async function upsertContactFromCdp(orgId: string, input: CdpContactInput): Promise<string> {
  let contactId: string | null = null;

  // 1. Find by email — or 2. create. One address, one contact
  // (../contacts/by-email.ts): an existing contact keeps its status; its name
  // and phone are refreshed from the source as before. Without an address the
  // source's own id makes a placeholder one.
  const { contact, created } = await findOrCreateContact(
    orgId,
    input.email ?? `${input.source}:${input.externalId}@noemail.invalid`,
    {
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      phone: input.phone ?? null,
      source: input.source,
    },
  );
  contactId = contact.id;
  if (!created && input.email) {
    await db
      .update(contacts)
      .set({
        firstName: input.firstName ?? undefined,
        lastName: input.lastName ?? undefined,
        phone: input.phone ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, contactId));
  }

  // 3. Merge traits
  if (input.traits && Object.keys(input.traits).length > 0) {
    await db
      .insert(contactTraits)
      .values({
        contactId,
        orgId,
        values: input.traits,
      })
      .onConflictDoUpdate({
        target: contactTraits.contactId,
        set: {
          values: sql`contact_traits.values || ${JSON.stringify(input.traits)}::jsonb`,
          computedAt: new Date(),
        },
      })
      .catch(() => {});
  }

  return contactId;
}
