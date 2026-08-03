/**
 * Form autofill for identified visitors (#334).
 *
 * When a known visitor lands on a page with a ForgeMsg signup form, we can
 * pre-populate form fields using data already on their contact record.
 *
 * Identification strategy (priority order):
 *   1. `fmid` cookie — set by site-tracker JS after first form submission
 *   2. `fmcid` URL param — encrypted contact ID in links
 *   3. IP + email combination (heuristic, not used for pre-fill by default)
 *
 * The endpoint returns only the SAFE subset of contact fields: no sensitive
 * data (password hashes, internal notes, etc.). The frontend fills in the
 * form fields — the visitor can still edit everything before submit.
 *
 * Endpoint: GET /public/forms/:formId/autofill?fmid=<trackingId>
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts, signupForms } from '../../db/schema/index.js';
import { redis } from '@forgemsg/shared/redis';
import crypto from 'node:crypto';

export interface AutofillPayload {
  /** Which form fields can be pre-filled */
  fields: Record<string, string | null>;
  /** Opaque token the browser sends back on submission to link the response */
  sessionToken: string;
}

/**
 * Encrypt a contact ID into a URL-safe tracking token (for `fmcid` param).
 * Uses AES-256-GCM with a per-site secret so the contact ID is never exposed.
 */
export function encryptContactId(contactId: string): string {
  const secret = process.env['FORM_AUTOFILL_SECRET'] ?? 'changeme-32-byte-secret-key-here';
  const key = crypto.scryptSync(secret, 'fm-autofill-salt', 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(contactId, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

export function decryptContactId(token: string): string | null {
  try {
    const buf = Buffer.from(token, 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const secret = process.env['FORM_AUTOFILL_SECRET'] ?? 'changeme-32-byte-secret-key-here';
    const key = crypto.scryptSync(secret, 'fm-autofill-salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc).toString('utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

/**
 * Store a tracking ID → contactId mapping in Redis (30-day TTL).
 * Called by site-tracker after a successful form submission.
 */
export async function setTrackingMapping(trackingId: string, contactId: string): Promise<void> {
  await redis.set(`autofill:track:${trackingId}`, contactId, 'EX', 30 * 86400);
}

export async function resolveContactFromTracking(
  fmid?: string,
  fmcid?: string,
): Promise<string | null> {
  if (fmid) {
    const contactId = await redis.get(`autofill:track:${fmid}`);
    if (contactId) return contactId;
  }
  if (fmcid) {
    return decryptContactId(fmcid);
  }
  return null;
}

/**
 * Build the autofill payload for a given form + identified contact.
 * Only returns fields that exist on the form's field list.
 */
export async function buildAutofillPayload(
  orgId: string,
  formId: string,
  contactId: string,
): Promise<AutofillPayload | null> {
  const [form] = await db
    .select({ fields: signupForms.fields })
    .from(signupForms)
    .where(
      and(eq(signupForms.id, formId), eq(signupForms.orgId, orgId), eq(signupForms.active, true)),
    )
    .limit(1);

  if (!form) return null;

  const [contact] = await db
    .select({
      email: contacts.email,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      phone: contacts.phone,
    })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
    .limit(1);

  if (!contact) return null;

  // Map contact fields to form field names
  const safeValues: Record<string, string | null> = {
    email: contact.email,
    first_name: contact.firstName,
    last_name: contact.lastName,
    phone: contact.phone,
  };

  // Only pre-fill fields that the form declares
  const formFields = (form.fields as Array<{ name: string }> | undefined) ?? [];
  const fields: Record<string, string | null> = {};
  for (const ff of formFields) {
    if (ff.name in safeValues) {
      fields[ff.name] = safeValues[ff.name] ?? null;
    }
  }

  // Short-lived session token so the submit handler can trust the pre-fill
  const sessionToken = crypto.randomBytes(16).toString('hex');
  await redis.set(`autofill:session:${sessionToken}`, contactId, 'EX', 3600);

  return { fields, sessionToken };
}

/**
 * Resolve contactId from a session token submitted alongside the form.
 * Returns null if token is expired or unknown.
 */
export async function resolveSessionToken(token: string): Promise<string | null> {
  return redis.get(`autofill:session:${token}`);
}
