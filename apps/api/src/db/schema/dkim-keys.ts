import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
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
 * ─── Encryption at rest ───────────────────────────────────────────────────────
 *
 * The plan this table was shaped for has landed, and it cost exactly the two
 * ADD COLUMNs it promised — no rebuild, no change to the lifecycle columns or
 * the partial unique indexes.
 *
 *   DKIM_MASTER_KEY (environment)  --wraps-->  dek_wrapped  --encrypts-->  private_key
 *
 * `private_key` now holds `dk1:base64(iv|ciphertext|tag)` rather than PEM, and
 * `dek_wrapped` holds `dw1:...` — the row's own DEK, sealed with the master key
 * that lives only in the environment. Both layers are AES-256-GCM bound to
 * `${domainId}:${selector}` as associated data, so a ciphertext copied onto
 * another domain's row will not decrypt. See lib/crypto/envelope.ts.
 *
 * Exactly one place in the repository decrypts: `resolveActiveKey` in
 * services/domains/dkim-rotation.ts. Everything else selects around this
 * column rather than through it.
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
    /**
     * `dk1:base64(iv|ciphertext|tag)` — the PEM private key sealed under this
     * row's DEK. Never plaintext after the backfill; a value without the prefix
     * is a legacy row and decryption refuses it rather than passing it through.
     */
    privateKey: text('private_key').notNull(),
    /**
     * `dw1:base64(iv|ciphertext|tag)` — this row's DEK, wrapped by the master
     * key from the environment. One DEK per row, not per domain: a rotation
     * writes a new key with a new DEK, so compromising one never widens.
     *
     * Nullable only so the ADD COLUMN could run against existing rows. A null
     * here means "not yet backfilled", and reading such a row throws.
     */
    dekWrapped: text('dek_wrapped'),
    /**
     * Which master key sealed `dek_wrapped`. Rotation is not implemented — this
     * exists so that when it is, the re-wrap can find the rows it still owes
     * without touching `private_key` at all. Only version 1 resolves today.
     */
    masterKeyVersion: integer('master_key_version').notNull().default(1),
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
