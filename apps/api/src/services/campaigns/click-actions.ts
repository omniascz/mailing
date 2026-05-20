/**
 * Click actions (#216)
 *
 * Allows campaign links and image buttons to trigger CRM/automation actions
 * when clicked: add a tag, update a contact field, or fire a workflow trigger.
 *
 * Flow:
 *   1. At send-time, links with a `data-click-action` are wrapped with a
 *      tracking URL: /t/click/:linkId?action=<encoded>
 *   2. On click, the tracking endpoint resolves the action and runs it for
 *      the identified contact.
 *   3. The original destination URL is then 302-redirected.
 *
 * Action spec (stored as base64url JSON in the tracking link):
 *   { type: 'add_tag', tag: string }
 *   { type: 'remove_tag', tag: string }
 *   { type: 'update_field', field: string, value: string }
 *   { type: 'fire_event', eventName: string, properties?: Record<string,unknown> }
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts, contactTags, tags } from '../../db/schema/index.js';

export type ClickAction =
  | { type: 'add_tag'; tag: string }
  | { type: 'remove_tag'; tag: string }
  | { type: 'update_field'; field: string; value: string }
  | { type: 'fire_event'; eventName: string; properties?: Record<string, unknown> };

/**
 * Encode a click action into a URL-safe base64 string for embedding in links.
 */
export function encodeClickAction(action: ClickAction): string {
  return Buffer.from(JSON.stringify(action)).toString('base64url');
}

/**
 * Decode a click action from the base64 string.
 * Returns null if the string is invalid.
 */
export function decodeClickAction(encoded: string): ClickAction | null {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf-8');
    const parsed = JSON.parse(json) as ClickAction;
    if (!parsed.type) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Wraps a destination URL with a click-action tracking URL.
 *
 * @param baseTrackingUrl - e.g. 'https://api.forgemsg.io'
 * @param linkId - unique link ID for the tracking record
 * @param destination - the actual href
 * @param action - the action to fire on click
 */
export function wrapLinkWithAction(
  baseTrackingUrl: string,
  linkId: string,
  destination: string,
  action: ClickAction,
): string {
  const encoded = encodeClickAction(action);
  return `${baseTrackingUrl}/t/click/${linkId}?action=${encoded}&dest=${encodeURIComponent(destination)}`;
}

/**
 * Execute a click action for a contact.
 * Called from the click tracking endpoint after link resolution.
 */
export async function executeClickAction(
  orgId: string,
  contactId: string,
  action: ClickAction,
): Promise<void> {
  switch (action.type) {
    case 'add_tag':
      await addTagToContact(orgId, contactId, action.tag);
      break;

    case 'remove_tag':
      await removeTagFromContact(orgId, contactId, action.tag);
      break;

    case 'update_field':
      await updateContactField(orgId, contactId, action.field, action.value);
      break;

    case 'fire_event': {
      const { onApiEvent } = await import('../workflows/triggers.js');
      await onApiEvent(orgId, contactId, action.eventName, action.properties ?? {});
      break;
    }

    default:
      break;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function addTagToContact(orgId: string, contactId: string, tagName: string): Promise<void> {
  // Find or create the tag
  let [tag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.orgId, orgId), eq(tags.name, tagName)))
    .limit(1);

  if (!tag) {
    [tag] = await db.insert(tags).values({ orgId, name: tagName }).returning({ id: tags.id });
  }
  if (!tag) return;

  // Upsert contact_tag (ignore duplicate)
  await db.insert(contactTags).values({ contactId, tagId: tag.id }).onConflictDoNothing();
}

async function removeTagFromContact(
  orgId: string,
  contactId: string,
  tagName: string,
): Promise<void> {
  const [tag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.orgId, orgId), eq(tags.name, tagName)))
    .limit(1);
  if (!tag) return;

  // Remove from contact_tags by querying contact first to confirm org ownership
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .limit(1);
  if (!contact) return;

  await db
    .delete(contactTags)
    .where(and(eq(contactTags.contactId, contactId), eq(contactTags.tagId, tag.id)));
}

async function updateContactField(
  orgId: string,
  contactId: string,
  field: string,
  value: string,
): Promise<void> {
  // Only allow updating known safe fields or custom fields
  const ALLOWED_COLUMNS = new Set([
    'firstName',
    'lastName',
    'phone',
    'company',
    'city',
    'country',
    'address',
  ]);

  if (ALLOWED_COLUMNS.has(field)) {
    await db
      .update(contacts)
      .set({ [field]: value, updatedAt: new Date() })
      .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)));
  } else {
    // Custom field — update JSONB via raw merge
    const [contact] = await db
      .select({ customFields: contacts.customFields })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
      .limit(1);
    if (!contact) return;

    const existing = (contact.customFields ?? {}) as Record<string, unknown>;
    await db
      .update(contacts)
      .set({ customFields: { ...existing, [field]: value }, updatedAt: new Date() })
      .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)));
  }
}
