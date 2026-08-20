import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { sendingDomains } from './domains.js';

/**
 * DKIM keys — the source of truth for a domain's signing keys and their
 * rotation lifecycle. A domain owns MANY keys over time; at most one is
 * `active` (the key mail is signed with).
 *
 * Why this exists: rotation used to overwrite the single key columns on
 * sending_domains in place, so the moment a customer rotated, mail was signed
 * with the new key whose public half was not yet in DNS — a broken DKIM
 * signature (worse than unsigned) until the customer published + DNS propagated.
 * With SPF unaligned (VERP return-path is on ForgeMsg's bounce domain), DMARC
 * rests solely on DKIM, so on a p=reject domain that window meant *rejected*
 * mail. Keeping every key with its own selector and state lets the old key keep
 * signing until the new one is verified in DNS.
 *
 * ─── Encryption readiness (NOT implemented here, by instruction) ─────────────
 *
 * The eventual plan is envelope encryption: a master key in the environment,
 * a per-domain DEK, `private_key` holding ciphertext. This table is shaped so
 * that lands as pure ADD COLUMNs, never a rebuild:
 *   - `private_key` stays `text` (it holds PEM today, ciphertext later).
 *   - the future `dek_wrapped text` and `key_version integer` columns attach
 *     to this row with no change to the lifecycle columns or indexes.
 * Nothing here assumes the key is plaintext beyond reading it back for signing.
 */

/** pending → active → retiring → retired. */
export type DkimKeyStatus = 'pending' | 'active' | 'retiring' | 'retired';

export const dkimKeys = pgTable(
  'dkim_keys',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // Denormalized org_id for cheap tenant-scoped queries and cascade.
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => sendingDomains.id, { onDelete: 'cascade' }),
    /** DKIM selector — time-based (e.g. fmk20260820...) so it never collides
     *  with a still-retiring selector and no receiver reuses a cached record. */
    selector: varchar('selector', { length: 63 }).notNull(),
    /** PEM private key today; ciphertext once envelope encryption lands. */
    privateKey: text('private_key').notNull(),
    /** Base64 public key for the DNS p= tag. */
    publicKey: text('public_key').notNull(),
    keyType: varchar('key_type', { length: 16 }).notNull().default('rsa'),
    status: varchar('status', { length: 16 }).notNull().$type<DkimKeyStatus>(),
    /** Customer-supplied (BYODKIM) — generated=false. */
    isByo: varchar('is_byo', { length: 5 }).notNull().default('false'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    /** When the key entered `retiring` — starts the grace clock for the cron. */
    retiringAt: timestamp('retiring_at', { withTimezone: true }),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    /** When this key's DNS record was confirmed present. */
    dnsVerifiedAt: timestamp('dns_verified_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    // A selector is unique per domain — a retiring key still owns its selector,
    // which is exactly why new keys must not reuse fm1..fm9.
    uniqueIndex('dkim_keys_domain_selector_uq').on(t.domainId, t.selector),
    // At most one active key per domain — the signing identity is singular.
    uniqueIndex('dkim_keys_one_active_uq')
      .on(t.domainId)
      .where(sql`status = 'active'`),
    // At most one pending key per domain — repeated "Rotate" clicks return the
    // existing pending rather than piling up selectors the customer can't tell
    // apart.
    uniqueIndex('dkim_keys_one_pending_uq')
      .on(t.domainId)
      .where(sql`status = 'pending'`),
    index('dkim_keys_domain_status_idx').on(t.domainId, t.status),
    index('dkim_keys_org_idx').on(t.orgId),
  ],
);

export type DkimKey = typeof dkimKeys.$inferSelect;
export type NewDkimKey = typeof dkimKeys.$inferInsert;
