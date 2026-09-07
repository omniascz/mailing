import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * One row per (address, blocklist zone) listing, for as long as it stands.
 *
 * The sweep already knew when an address was listed and wrote the count to
 * `dedicated_ips.blacklist_count`. What it had nowhere to put was the fact that
 * somebody had been told — so an alert built on the sweep alone would have
 * repeated itself every six hours for as long as the listing lasted, which is
 * how an alert channel becomes something people filter out.
 *
 * ─── Why a row per zone, not per address ─────────────────────────────────────
 *
 * Being on Spamhaus and being on UCEPROTECT are different problems with
 * different remedies and different urgency. Collapsing them to one row per
 * address would mean the second listing arriving while the first is open never
 * gets mentioned.
 *
 * ─── notified_at is the whole point, and it is nullable ──────────────────────
 *
 * NULL means "this finding has not been successfully announced yet", and it is
 * set only after the send returns. Setting it before, or alongside the insert,
 * would make a failed send indistinguishable from a delivered one: the next
 * sweep would see a notified finding and stay quiet, and the listing would sit
 * there unreported. That is #133 exactly — a function that marks the state and
 * sends nothing is worse than one that does not exist.
 *
 * ─── cleared_at, and what does NOT set it ────────────────────────────────────
 *
 * Set when a later sweep read the zone and it no longer lists the address. A
 * sweep that could not read the zone — refused query, timeout, SERVFAIL —
 * leaves the row alone. An outage at Spamhaus must not look like a delisting;
 * `BlacklistCheckResult.inconclusive` is what tells the two apart.
 *
 * The unique index is partial, over open rows only, so the same address can be
 * listed, cleared and listed again on the same zone and each episode is its own
 * row with its own alert.
 */
export const ipBlacklistEvents = pgTable(
  'ip_blacklist_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** IPv4 or IPv6, matching dedicated_ips.ip_address. */
    ipAddress: varchar('ip_address', { length: 45 }).notNull(),
    /** The DNSBL zone that listed it, e.g. zen.spamhaus.org. */
    zone: varchar('zone', { length: 253 }).notNull(),
    /** The 127.0.0.x code the zone answered with, when it gave one. */
    returnCode: varchar('return_code', { length: 45 }),

    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** Set ONLY after an alert for this finding has actually been sent. */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    /** Set when a zone we could read no longer lists the address. */
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('ip_blacklist_events_open_idx')
      .on(t.ipAddress, t.zone)
      .where(sql`cleared_at IS NULL`),
    index('ip_blacklist_events_unnotified_idx')
      .on(t.notifiedAt)
      .where(sql`notified_at IS NULL AND cleared_at IS NULL`),
  ],
);

export type IpBlacklistEvent = typeof ipBlacklistEvents.$inferSelect;
export type NewIpBlacklistEvent = typeof ipBlacklistEvents.$inferInsert;
