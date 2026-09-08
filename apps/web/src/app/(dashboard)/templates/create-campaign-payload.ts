/**
 * The body the "Create campaign" button POSTs, and the destination it goes to.
 *
 * Pure functions rather than literals inside the click handler, for the reason
 * buildCreatePayload and buildSavePayload are: a literal inside a handler
 * cannot be read by anything, so the only way to find out what the product can
 * actually send is to grep for field names — and grepping is what let a shipped
 * feature be reported as missing.
 *
 * It is also what makes this testable in apps/web, whose vitest environment is
 * `node` with no DOM. The decision worth pinning is not that a button renders;
 * it is what the request says and where the user lands afterwards.
 */

export interface CreateFromTemplateFields {
  /** Optional override for the campaign name. Blank means "use the template's". */
  name: string;
}

/**
 * Blank name is OMITTED, not sent as ''.
 *
 * The route falls back to the template's own name when the field is absent,
 * and its zod schema is `.min(1)` — an empty string is a validation error, not
 * a way of saying "you choose". Sending one would turn an untouched input into
 * a 400.
 */
export function buildCreateFromTemplatePayload(
  f: CreateFromTemplateFields,
): Record<string, unknown> {
  const name = f.name.trim();
  return name ? { name } : {};
}

/** Every key this builder can produce, for the campaign-field guard. */
export function createFromTemplatePayloadKeys(): string[] {
  return Object.keys(buildCreateFromTemplatePayload({ name: 'x' }));
}

/**
 * Where the user goes once the campaign exists.
 *
 * The editor, not the campaign list: they picked a design, so the next thing
 * they want is to see it and change the words. Landing on a list would make
 * them find the campaign they just created.
 */
export function createdCampaignHref(campaignId: string): string {
  return `/editor/campaigns/${campaignId}`;
}
