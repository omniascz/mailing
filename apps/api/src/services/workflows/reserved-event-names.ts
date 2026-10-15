/**
 * Event names a publishable key may not send.
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

export function isReservedEventName(name: string): boolean {
  const lower = name.toLowerCase();
  return RESERVED_PREFIXES.some((p) => lower.startsWith(p));
}
