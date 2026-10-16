/**
 * Event names a publishable key may not send: ticketing.* and, since Z165,
 * payment_pending, pickup_ready and order_shipped.
 *
 * Michal, 15. 10. 19:40, point 1c d) (Z161): `ticketing.*` belongs to the
 * ticketing ingest (POST /api/v1/ticketing/events, secret key or session) and
 * the ticketing cron, never to a page. The publishable key sits in the page
 * source, so anybody can read it; and a flow started by ticketing.order_paid,
 * ticketing.day_of_reminder, ticketing.day_of_sms or ticketing.event_changed
 * carries the transactional exception (transactional-exception.ts), which
 * reaches unsubscribed, complained, pending, archived and non_subscribed
 * contacts. With the key and a contact id, a stranger could send those
 * contacts a "transactional" message they opted out of. No code of ours
 * sends ticketing.* with a publishable key (probe Z161).
 *
 * Case-insensitive on purpose: a flow matches its event name exactly today,
 * but the rule is about who may speak for the ticketing system, not about
 * which spelling currently starts a run.
 *
 * Secret keys, sessions, the ingest, the cron and app-studio are not touched
 * by this; it is applied only where a publishable key chooses the name.
 */
const RESERVED_PREFIXES = ['ticketing.'] as const;

/**
 * Z165, Michal 15. 10. ~21:30, point 1d (variant a): the shop's own
 * payment_pending, pickup_ready and order_shipped are sent by the server only
 * (a secret key, the shop's webhook, the ingest), never by a page. They start
 * flows on the transactional list since Z165 (transactional-exception.ts), so
 * a publishable key with them would reach a contact who opted out, as
 * ticketing.* did. Whole names, not prefixes: `order_shipped_late` or
 * `payment_pending_reminder` stay a page's to send. No code of ours sends any
 * of the three (probe Z165).
 */
const RESERVED_NAMES: ReadonlySet<string> = new Set([
  'payment_pending',
  'pickup_ready',
  'order_shipped',
]);

export function isReservedEventName(name: string): boolean {
  const lower = name.toLowerCase();
  return RESERVED_NAMES.has(lower) || RESERVED_PREFIXES.some((p) => lower.startsWith(p));
}
