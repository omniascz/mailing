/**
 * Progressive profiling (#205)
 *
 * Returns only the form fields that a known contact hasn't filled yet.
 * On each visit, the contact sees different (new) fields, gradually building
 * a richer profile without overwhelming them on the first interaction.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { signupForms, contacts, type FormField } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

/**
 * Returns the subset of form fields that the contact hasn't filled yet.
 *
 * Fields are considered "filled" if the contact's record contains a non-empty
 * value for the corresponding contact property or custom field key.
 *
 * @param fieldsPerVisit - How many unfilled fields to return per visit (default: 2)
 */
export async function getProgressiveFields(input: {
  formId: string;
  contactId: string;
  orgId: string;
  fieldsPerVisit?: number;
}): Promise<{ fields: FormField[]; total: number; remaining: number }> {
  const fieldsPerVisit = input.fieldsPerVisit ?? 2;

  // Load form
  const [form] = await db
    .select()
    .from(signupForms)
    .where(and(eq(signupForms.id, input.formId), eq(signupForms.orgId, input.orgId)))
    .limit(1);
  if (!form || !form.active) throw AppError.notFound('Form not found or inactive');

  // Load contact
  const [contact] = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.id, input.contactId),
        eq(contacts.orgId, input.orgId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!contact) throw AppError.notFound('Contact not found');

  const formFields = (form.fields ?? []) as FormField[];
  const customFields = (contact.customFields ?? {}) as Record<string, unknown>;

  // Determine which fields already have values
  const unfilledFields = formFields.filter((field) => {
    // Skip email — always considered filled if contact exists
    if (field.name === 'email') return false;

    const value = getContactFieldValue(contact, customFields, field.name);
    return !value || value === '';
  });

  return {
    fields: unfilledFields.slice(0, fieldsPerVisit),
    total: formFields.length,
    remaining: unfilledFields.length,
  };
}

type ContactRow = typeof contacts.$inferSelect;

function getContactFieldValue(
  contact: ContactRow,
  customFields: Record<string, unknown>,
  key: string,
): string {
  // Map form field keys to contact columns (only columns that exist on the
  // contacts table — address/city/country/company live in customFields).
  const columnMap: Record<string, keyof ContactRow> = {
    first_name: 'firstName',
    last_name: 'lastName',
    phone: 'phone',
  };

  const col = columnMap[key];
  if (col) {
    return String(contact[col] ?? '');
  }

  // Check custom fields (address, city, country, company, etc.)
  return String(customFields[key] ?? '');
}
