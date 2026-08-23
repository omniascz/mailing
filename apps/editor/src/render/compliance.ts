/**
 * What every outgoing email owes its recipient, decided once.
 *
 * Marketing mail carries an opt-out link and the sender's postal address.
 * Transactional mail carries neither — a receipt or a password reset is a
 * different legal category, and offering to unsubscribe from one is wrong.
 *
 * This module holds the DECISION. The two renderers hold the FORMATTING: the
 * HTML one wraps it in a table row, the plain-text one writes it as two lines.
 * They were about to hold a decision each, which is how the HTML half came to
 * be compliant while the text half of the very same multipart message was not.
 */

import type { MergeTagContext } from './merge-tags.js';

export type MessageStream = 'broadcast' | 'triggered' | 'transactional';
export type RenderLocale = 'en' | 'cs' | 'sk';

/** Unsubscribe label per language. English is the fallback, not a translation gap. */
const UNSUBSCRIBE_LABEL: Record<RenderLocale, string> = {
  en: 'Unsubscribe',
  cs: 'Odhlásit z odběru',
  sk: 'Odhlásiť z odberu',
};

export function unsubscribeLabel(locale: RenderLocale | undefined): string {
  return UNSUBSCRIBE_LABEL[locale ?? 'en'] ?? UNSUBSCRIBE_LABEL.en;
}

/**
 * Marketing mail must carry an opt-out. Transactional mail must not offer one.
 *
 * Undefined means marketing on purpose: a caller that forgets gets the
 * compliant outcome rather than the silent one.
 */
export function isMarketingStream(stream: MessageStream | undefined): boolean {
  return (stream ?? 'broadcast') !== 'transactional';
}

/**
 * Whether this render must emit an opt-out.
 *
 * `templateAsked` is the footer block's own `showUnsubscribe`. It is honoured
 * for transactional mail, where the opt-out is optional, and overridden for
 * marketing, where a template must not be able to switch off the one thing the
 * law requires.
 */
export function mustShowOptOut(marketing: boolean, templateAsked: boolean): boolean {
  return marketing || templateAsked;
}

/** The per-recipient opt-out URL, or the merge tag when the caller supplied none. */
export function optOutUrl(ctx: MergeTagContext): string {
  return ctx.system?.unsubscribeUrl ?? '{{unsubscribe_url}}';
}

/**
 * Sender identity as plain lines — company name then postal address, either of
 * which may be absent. Returned unformatted so each renderer can present it in
 * its own medium.
 */
export function postalAddressLines(ctx: MergeTagContext): string[] {
  const address = ctx.system?.companyAddress?.trim();
  if (!address) return [];
  const name = ctx.system?.companyName?.trim();
  return name ? [name, address] : [address];
}
