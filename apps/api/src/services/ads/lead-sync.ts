/**
 * Lead sync: Ads → CRM (#304).
 * Handles incoming lead form submissions from Facebook Lead Ads and LinkedIn Lead Gen Forms.
 * Creates/updates contacts, fires workflow trigger.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// Workflow trigger helper (same pattern used throughout the codebase)
async function fireLeadTrigger(orgId: string, contactId: string, source: string, formData: Record<string, unknown>) {
  const { onApiEvent } = await import('../workflows/triggers.js');
  await onApiEvent(orgId, contactId, 'ad_lead_form_submit', { source, ...formData });
}

// ── Facebook Lead Ads ─────────────────────────────────────────────────────────

export interface FacebookLeadPayload {
  leadgenId: string;
  pageId: string;
  adId?: string;
  formId?: string;
  fieldData: Array<{ name: string; values: string[] }>;
  createdTime: number;
}

export async function handleFacebookLead(orgId: string, payload: FacebookLeadPayload) {
  const fields = Object.fromEntries(payload.fieldData.map(f => [f.name, f.values[0] ?? '']));
  const email = (fields['email'] ?? fields['EMAIL'] ?? '').toLowerCase().trim();
  const firstName = fields['first_name'] ?? fields['FIRST_NAME'] ?? '';
  const lastName = fields['last_name'] ?? fields['LAST_NAME'] ?? '';
  const phone = fields['phone_number'] ?? fields['PHONE'] ?? '';

  if (!email) throw AppError.badRequest('Lead has no email field');

  const contact = await upsertLeadContact(orgId, { email, firstName, lastName, phone, source: 'facebook_lead_ads' });
  await fireLeadTrigger(orgId, contact.id, 'facebook_lead_ads', { ...fields, leadgenId: payload.leadgenId });
  return contact;
}

// ── LinkedIn Lead Gen Forms ───────────────────────────────────────────────────

export interface LinkedInLeadPayload {
  leadId: string;
  campaignId: string;
  formId: string;
  fields: Array<{ name: string; value: string }>;
}

export async function handleLinkedInLead(orgId: string, payload: LinkedInLeadPayload) {
  const fields = Object.fromEntries(payload.fields.map(f => [f.name.toLowerCase(), f.value]));
  const email = (fields['email'] ?? fields['email_address'] ?? '').toLowerCase().trim();
  const firstName = fields['first_name'] ?? fields['firstname'] ?? '';
  const lastName = fields['last_name'] ?? fields['lastname'] ?? '';
  const phone = fields['phone'] ?? fields['phone_number'] ?? '';

  if (!email) throw AppError.badRequest('Lead has no email field');

  const contact = await upsertLeadContact(orgId, { email, firstName, lastName, phone, source: 'linkedin_lead_gen' });
  await fireLeadTrigger(orgId, contact.id, 'linkedin_lead_gen', { ...fields, leadId: payload.leadId });
  return contact;
}

// ── Shared contact upsert ─────────────────────────────────────────────────────

async function upsertLeadContact(orgId: string, data: {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  source: string;
}) {
  const existing = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.email, data.email)))
    .then(r => r[0]);

  if (existing) {
    const [updated] = await db
      .update(contacts)
      .set({
        firstName: data.firstName || existing.firstName,
        lastName: data.lastName || existing.lastName,
        phone: data.phone || existing.phone,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, existing.id))
      .returning();
    if (!updated) throw AppError.internal('Failed to update lead contact');
    return updated;
  }

  const [created] = await db
    .insert(contacts)
    .values({
      orgId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      source: data.source,
      status: 'active',
    })
    .returning();
  if (!created) throw AppError.internal('Failed to create lead contact');
  return created;
}
