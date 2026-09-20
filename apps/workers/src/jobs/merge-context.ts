/**
 * The merge-tag context a send is rendered with.
 *
 * Lifted out of batch-sender.ts so it can be read on its own: the file it came
 * from imports half the sending pipeline, and what goes into the context — and
 * in which order — is a decision worth being able to test and argue with
 * separately. batch-sender.ts is the only caller in production.
 */
import { expandContactScope, type MergeTagContext } from '@forgemsg/editor/render';

export interface MergeContactRow {
  email: string;
  firstName: string | null;
  lastName: string | null;
  customFields: Record<string, unknown>;
}

/**
 * Build the context from the contact, the system values, and — for a triggered
 * send — what the workflow run's trigger event carried.
 *
 * Precedence, from weakest to strongest:
 *
 *   1. the run's merge data (the shop's own payload: order, shipment, pickup…)
 *   2. the contact's own fields and custom fields
 *   3. the system values (unsubscribe_url, current_year, …)
 *
 * The system values are not in this object's contact scope at all —
 * parseMergeTags resolves SYSTEM_KEYS from `system` before it ever looks here —
 * so nothing in a payload can shadow an unsubscribe link.
 *
 * The contact is NOT protected by spread order alone, which is what this code
 * did first and what a test caught: the renderer looks a tag up by its literal
 * name before trying the other convention (resolvePath, merge-tags.ts), so an
 * event carrying `first_name` beat the contact's `firstName` and the email
 * greeted whoever the payload said. Every name the contact scope answers to —
 * both conventions, custom fields included — is therefore taken out of the
 * payload first. expandContactScope is the renderer's own expansion, so the
 * set cannot drift from what it will look up.
 */
export function buildMergeContext(
  contact: MergeContactRow,
  systemContext?: MergeTagContext['system'],
  newsletterTierName?: string | null,
  runMergeData?: Record<string, unknown>,
): MergeTagContext {
  const own = {
    email: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    ...contact.customFields,
    // Newsletter tier — allows DynamicBlock conditions like newsletter_tier_name == "Pro"
    ...(newsletterTierName ? { newsletter_tier_name: newsletterTierName } : {}),
  };

  let fromEvent = runMergeData;
  if (fromEvent) {
    const reserved = new Set(Object.keys(expandContactScope(own)));
    fromEvent = Object.fromEntries(Object.entries(fromEvent).filter(([key]) => !reserved.has(key)));
  }

  return { contact: { ...fromEvent, ...own }, system: systemContext };
}
