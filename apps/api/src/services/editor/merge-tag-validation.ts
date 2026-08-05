/**
 * Org-scoped merge-tag validation.
 *
 * The renderer resolves an unknown tag to an empty string on purpose (see
 * apps/editor/src/render/validate-merge-tags.ts). This is where that decision
 * gets paid for: we tell the customer about the typo when they save, and again
 * in the pre-send panel, instead of letting "Vítejte, !" reach an inbox.
 *
 * The key set is not a list kept here. It is produced by feeding a probe
 * contact through expandContactScope — the same function that builds the real
 * render context — so a field that renders is never reported as a typo. The
 * probe's own keys come from the two places that define what a contact has:
 * the `contacts` table columns, and the org's custom_field_definitions rows.
 */

import { eq } from 'drizzle-orm';
import { getTableColumns } from 'drizzle-orm';
// Import the render entrypoint, not the package root — the root re-exports the
// canvas, which pulls React into the API process.
import {
  availableMergeKeys,
  validateMergeTags,
  type MergeTagWarning,
  type MergeTagContext,
} from '@forgemsg/editor/render';
import { db } from '../../db/client.js';
import { contacts, customFieldDefinitions } from '../../db/schema/index.js';

export type { MergeTagWarning };

/** Columns a contact never exposes to a template. */
const INTERNAL_COLUMNS = new Set([
  'id',
  'orgId',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'customFields',
]);

/**
 * A contact carrying every field this org can merge, with placeholder values.
 * Values are irrelevant — only the key set is read — but they must be
 * non-empty so expandContactScope treats them as present.
 */
async function buildProbeContext(orgId: string): Promise<MergeTagContext> {
  const columns = Object.keys(getTableColumns(contacts)).filter((c) => !INTERNAL_COLUMNS.has(c));

  const defs = await db
    .select({ key: customFieldDefinitions.key })
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.orgId, orgId));

  const contact: Record<string, unknown> = {};
  for (const c of columns) contact[c] = '·';
  contact['custom_fields'] = Object.fromEntries(defs.map((d) => [d.key, '·']));

  return {
    contact,
    // Every system value is always available at render time, so an empty
    // object here would wrongly mark {{unsubscribe_url}} as unknown.
    system: {
      unsubscribeUrl: '·',
      viewInBrowserUrl: '·',
      preferenceCenterUrl: '·',
      currentDate: '·',
      currentYear: '·',
      companyName: '·',
      companyAddress: '·',
      footerHtml: '·',
      footerText: '·',
    },
  };
}

/** Cache the key set per org for a request burst — a save is 1 DB round-trip. */
const cache = new Map<string, { keys: Set<string>; at: number }>();
const CACHE_TTL_MS = 60_000;

export async function orgMergeKeys(orgId: string): Promise<Set<string>> {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.keys;
  const keys = availableMergeKeys(await buildProbeContext(orgId));
  cache.set(orgId, { keys, at: Date.now() });
  return keys;
}

/** Drop cached keys for an org — call when its custom fields change. */
export function invalidateMergeKeys(orgId: string): void {
  cache.delete(orgId);
}

/**
 * Validate every text fragment of a campaign or template in one pass.
 * Fragments are joined rather than validated separately so a tag repeated
 * across subject and body is reported once.
 */
export async function validateOrgContent(
  orgId: string,
  fragments: Array<string | null | undefined>,
): Promise<MergeTagWarning[]> {
  const text = fragments.filter((f): f is string => typeof f === 'string' && f !== '').join('\n');
  if (!text) return [];
  return validateMergeTags(text, await orgMergeKeys(orgId));
}

/**
 * Pull renderable text out of a campaign/template `content` blob.
 * Mirrors extractHtml in the pre-send panel: the blob is free-form, so fall
 * back to the serialised JSON — a merge tag inside a block's props is still a
 * merge tag, and missing it would be worse than scanning some structural keys
 * that cannot look like `{{contact.…}}`.
 */
export function extractTemplateText(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object') {
    const obj = content as Record<string, unknown>;
    if (typeof obj['html'] === 'string') return obj['html'];
    if (typeof obj['body'] === 'string') return obj['body'];
    return JSON.stringify(content);
  }
  return '';
}
