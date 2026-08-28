/**
 * The seed organisation, read — never written.
 *
 * ─── What went wrong ─────────────────────────────────────────────────────────
 *
 * Three files needed the demo org to have a company name and a postal address,
 * because the renderer's compliance footer is built from them. None of the
 * three could assume the other two had run, so each filled the columns in:
 *
 *     UPDATE organizations
 *     SET company_name   = COALESCE(company_name, 'Obchod s.r.o.'),
 *         postal_address = COALESCE(postal_address, 'Nádražní 1, 110 00 Praha')
 *     WHERE id = <seed org>
 *
 * COALESCE means the FIRST file to run decides the value, and nothing ever put
 * it back. So a file that later asserted on the address was asserting on
 * whatever an earlier file happened to write. It surfaced when the RSS suite
 * arrived in #75 spelling the street without diacritics: campaign-content-shape
 * started failing on `expected … to contain 'Nádražní 1'`.
 *
 * ─── Why it looked like flakiness, and was not ───────────────────────────────
 *
 * Not a parallelism problem: both integration configs set
 * `fileParallelism: false`, so no two files ever run at the same time. The
 * dependency is on ORDER, plus a write that outlives the file that made it.
 *
 * And the order is neither alphabetical nor stable. vitest's BaseSequencer
 * sorts files it has no cached result for LARGEST FIRST, and files it does
 * have a result for by "failed first, then slowest first". So the order is a
 * function of file size and of what happened last time — which is why adding
 * one file re-ordered the others, and why the same suite passed locally and
 * failed in CI (where the cache is always cold).
 *
 * ─── The rule now ────────────────────────────────────────────────────────────
 *
 * The seed row is READ-ONLY for integration tests. Everything the footer needs
 * is set by apps/api/scripts/seed.ts, so there is nothing left to fill in. A
 * test that needs a DIFFERENT value must create its own organisation — which
 * is what ~20 files in apps/api/src/integration already do.
 *
 * Enforced by apps/workers/src/lib/seed-org-read-only.test.ts, which fails if
 * any integration file writes to `organizations` again.
 */
import type { Sql } from 'postgres';

export const SEED_ORG_SLUG = 'acme-demo';

export interface SeedOrg {
  id: string;
  /** Both halves of the compliance footer, guaranteed non-empty. */
  companyName: string;
  postalAddress: string;
  sendingMode: string;
}

/**
 * Read the seed org, and refuse to continue if it is not usable.
 *
 * Loud rather than helpful on purpose: a missing postal address used to mean a
 * campaign quietly went out with no address in the footer, and the test that
 * should have caught it passed because a neighbouring file had filled the
 * column in. If the seed is stale, the answer is `pnpm seed`, not a write from
 * here.
 */
export async function readSeedOrg(sql: Sql): Promise<SeedOrg> {
  const [row] = await sql<
    {
      id: string;
      company_name: string | null;
      postal_address: string | null;
      sending_mode: string;
    }[]
  >`
    SELECT id, company_name, postal_address, sending_mode
    FROM organizations
    WHERE slug = ${SEED_ORG_SLUG}
    LIMIT 1
  `;

  if (!row) {
    throw new Error(`[seed-org] no organisation with slug '${SEED_ORG_SLUG}'. Run \`pnpm seed\`.`);
  }

  const missing = (['company_name', 'postal_address'] as const).filter((c) => !row[c]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `[seed-org] the seed organisation has no ${missing.join(' and ')}. The compliance ` +
        `footer is built from those, so a send would produce marketing mail without an ` +
        `address. They are seed data now — run \`pnpm seed\` against this database rather ` +
        `than filling them in from a test. Note that \`pnpm seed\` is a no-op on a database ` +
        `that already has the org — use \`SEED_FORCE=1 pnpm seed\` to rebuild it.`,
    );
  }

  if (row.sending_mode !== 'production') {
    throw new Error(
      `[seed-org] the seed organisation is in sending_mode '${row.sending_mode}', not ` +
        `'production'. Sends are suppressed in any other mode, so the assertions below ` +
        `would pass on an empty queue. Something wrote to the shared row — run ` +
        `\`SEED_FORCE=1 pnpm seed\` to put it back.`,
    );
  }

  return {
    id: row.id,
    companyName: row.company_name!.trim(),
    postalAddress: row.postal_address!.trim(),
    sendingMode: row.sending_mode,
  };
}
