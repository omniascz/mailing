/**
 * Encrypt every DKIM private key that is still stored in plaintext, and empty
 * the plaintext copy on sending_domains.
 *
 * Run once after migration 0015, with DKIM_MASTER_KEY set to the same value the
 * API will run with:
 *
 *   DKIM_MASTER_KEY=... pnpm --filter @forgemsg/api tsx scripts/backfill-dkim-encryption.ts
 *
 * ─── Why this is a script and not part of the migration ───────────────────────
 *
 * The envelope format is an application concern: AES-256-GCM under a per-row
 * DEK, the DEK wrapped by a key that must never reach the database. Doing it in
 * SQL would mean handing the master key to Postgres — into the session, the
 * statement log, and possibly the WAL — which defeats the exercise on its first
 * step. The migration adds two columns and nothing else.
 *
 * ─── Idempotence ──────────────────────────────────────────────────────────────
 *
 * Selects only rows with `dek_wrapped IS NULL`, so a second run has nothing to
 * do. Running it twice must not double-encrypt: a doubly-sealed key decrypts to
 * a `dk1:` string instead of a PEM, mail gets signed with garbage, and DKIM
 * fails closed on every receiver — worse than the plaintext it replaced.
 *
 * ─── The mirror ───────────────────────────────────────────────────────────────
 *
 * sending_domains.dkim_private_key holds the same PEM, written by syncMirror
 * before this branch. Encrypting one copy and leaving the other readable would
 * be pure ceremony: the same `pg_dump` contains both. Nothing reads the mirror
 * column — the only reference in the codebase strips it from an API response —
 * so it is set to NULL for every row, not only the ones this script converts.
 */
import postgres from 'postgres';
import {
  encryptWithDek,
  generateDek,
  getMasterKey,
  wrapDek,
  DATA_PREFIX,
} from '../src/lib/crypto/envelope.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const MASTER_KEY_ENV = 'DKIM_MASTER_KEY';
const VERSION = 1;

// Fail before touching a single row if the environment cannot encrypt. A
// partial backfill is recoverable; one that ran halfway and then discovered it
// had no key is a database in two formats at once.
const masterKey = getMasterKey(MASTER_KEY_ENV, VERSION);

const sql = postgres(DATABASE_URL, { max: 1, prepare: false });

type Row = { id: string; domain_id: string; selector: string; private_key: string };

async function main(): Promise<void> {
  const rows = await sql<Row[]>`
    SELECT id, domain_id, selector, private_key
    FROM dkim_keys
    WHERE dek_wrapped IS NULL
  `;

  let encrypted = 0;
  let alreadyCiphertext = 0;

  for (const row of rows) {
    // Belt and braces against the double-encryption failure above: a row with
    // no wrapped DEK should hold a PEM, but if it somehow already holds a
    // dk1: blob then its DEK is gone and re-sealing it would bury the key for
    // good. Leave it and say so.
    if (row.private_key.startsWith(DATA_PREFIX)) {
      alreadyCiphertext++;
      console.warn(
        `[backfill] key ${row.id} (selector ${row.selector}) is already ciphertext but has ` +
          `no dek_wrapped — its DEK is unrecoverable. Skipped; this key must be rotated.`,
      );
      continue;
    }

    const aad = `${row.domain_id}:${row.selector}`;
    const dek = generateDek();
    const privateKey = encryptWithDek(row.private_key, dek, aad);
    const dekWrapped = wrapDek(dek, masterKey, aad);

    // One statement per row, and it re-checks `dek_wrapped IS NULL`. Two
    // operators running this at once would otherwise each seal the row with
    // their own DEK, and the second write would strand the first.
    const updated = await sql`
      UPDATE dkim_keys
      SET private_key = ${privateKey},
          dek_wrapped = ${dekWrapped},
          master_key_version = ${VERSION},
          updated_at = now()
      WHERE id = ${row.id} AND dek_wrapped IS NULL
    `;
    if (updated.count === 1) encrypted++;
  }

  // Unconditional, and not restricted to the rows above: the mirror is a copy
  // of a key that is now encrypted elsewhere, and every plaintext byte of it
  // has to go regardless of which rows this run converted.
  const mirror = await sql`
    UPDATE sending_domains
    SET dkim_private_key = NULL, updated_at = now()
    WHERE dkim_private_key IS NOT NULL
  `;

  console.log(
    `[backfill] ${rows.length} unencrypted key row(s) found; ` +
      `${encrypted} encrypted, ${alreadyCiphertext} skipped. ` +
      `${mirror.count} sending_domains mirror(s) cleared.`,
  );

  const [remaining] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM dkim_keys WHERE dek_wrapped IS NULL
  `;
  const [mirrorLeft] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM sending_domains WHERE dkim_private_key IS NOT NULL
  `;
  console.log(
    `[backfill] remaining unencrypted: ${remaining?.n ?? 0} key row(s), ` +
      `${mirrorLeft?.n ?? 0} mirror(s).`,
  );

  // A non-zero exit if anything is still readable, so a deploy pipeline that
  // runs this notices rather than logging a warning into a stream nobody tails.
  if ((remaining?.n ?? 0) > 0 || (mirrorLeft?.n ?? 0) > 0) {
    console.error('[backfill] plaintext remains — see the skipped rows above.');
    await sql.end();
    process.exit(1);
  }
}

await main();
await sql.end();
