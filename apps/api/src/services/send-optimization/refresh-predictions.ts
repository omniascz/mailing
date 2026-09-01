/**
 * Keeping per-contact send-time predictions fresh.
 *
 * #116 made time-warp reachable and STO came with it: computeTimewarpSchedule
 * prefers a contact's own predicted best hour over the campaign's local hour
 * whenever a prediction exists with confidence >= 0.3. Nothing produced those
 * predictions. `computeContactSendTime` was only ever called from
 * /api/v1/contacts/:id/best-send-time/compute and its batch sibling — on
 * demand, by hand — so in practice the table stayed empty and STO never fired.
 * The same state time-warp itself was in before #116.
 *
 * ─── Who gets predictions ───────────────────────────────────────────────────
 *
 * Only organisations that have at least one campaign with time-warp switched
 * on. That is not a cost-saving guess: `contact_send_time_predictions` is read
 * on the send path in exactly one place — send-optimization/index.ts:198, the
 * SELECT inside computeTimewarpSchedule — and that function only runs for a
 * campaign whose splitter job carried a time-warp config. For every other org
 * a prediction is a row nothing will ever look at.
 *
 * The trade-off is a first-send delay: an org that switches time-warp on today
 * gets cohort local-hour scheduling on the first send and per-contact hours
 * from the next daily run. That is the right way round. The alternative —
 * computing for every org every night — spends the whole budget on orgs that
 * do not use the feature, and would push the orgs that DO past the cap below.
 *
 * ─── How many, and in what order ────────────────────────────────────────────
 *
 * Measured against a real database: computeContactSendTime costs ~8 ms per
 * contact (50 contacts in ~400 ms), so 10 000 contacts is about 80 seconds.
 * The cap is 10 000 per run, which is a daily job spending well under two
 * minutes.
 *
 * Order is stalest first: contacts with no prediction at all, then the oldest
 * `computed_at`. A cap without an order would recompute the same first N
 * contacts every night and never reach the rest.
 */
import { and, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { campaigns } from '../../db/schema/campaigns.js';
import { computeContactSendTime } from './per-contact-sto.js';

/**
 * Contacts refreshed per run.
 *
 * 10 000 x ~8 ms ~= 80 s, measured. Deliberately not derived from a
 * "how long may this take" budget: a wall-clock target would silently shrink
 * the number of contacts covered as the per-contact cost drifted, and the
 * thing that matters is that every contact is reached within a few days.
 */
export const STO_REFRESH_LIMIT = 10_000;

export interface StoRefreshOutcome {
  /** Organisations with at least one time-warp campaign. */
  orgs: number;
  /** Contacts whose prediction was recomputed. */
  refreshed: number;
  /** Contacts that threw; the run continues past them. */
  failed: number;
}

/** Organisations that actually read predictions: those using time-warp. */
export async function orgsUsingTimewarp(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ orgId: campaigns.orgId })
    .from(campaigns)
    .where(
      and(
        isNotNull(campaigns.timewarp),
        // The column is jsonb and `enabled` is what decides, not presence: a
        // campaign switched back off keeps `{ enabled: false }`.
        sql`${campaigns.timewarp}->>'enabled' = 'true'`,
        isNull(campaigns.deletedAt),
      ),
    );
  return rows.map((r) => r.orgId);
}

/**
 * Recompute the stalest predictions for the orgs that use time-warp.
 *
 * A contact that throws is logged with its id and skipped — one bad contact
 * must not cost the rest of the run, and the run is idempotent, so the next
 * night tries again. Same shape as the per-org sweeps in lib/per-org-sweep.ts.
 */
export async function refreshStalePredictions(
  limit = STO_REFRESH_LIMIT,
): Promise<StoRefreshOutcome> {
  const orgIds = await orgsUsingTimewarp();
  if (orgIds.length === 0) return { orgs: 0, refreshed: 0, failed: 0 };

  // Stalest first: never-computed contacts (NULL sorts last under DESC, so
  // NULLS FIRST is explicit), then the oldest computed_at.
  const rows = (await db.execute<{ org_id: string; contact_id: string }>(sql`
    SELECT c.org_id, c.id AS contact_id
    FROM contacts c
    LEFT JOIN contact_send_time_predictions p
      ON p.contact_id = c.id::text AND p.org_id = c.org_id::text
    WHERE c.org_id = ANY(${sql.param(orgIds)}::uuid[])
      AND c.deleted_at IS NULL
      AND c.status = 'active'
    ORDER BY p.computed_at ASC NULLS FIRST
    LIMIT ${limit}
  `)) as unknown as Array<{ org_id: string; contact_id: string }>;

  let refreshed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await computeContactSendTime(row.org_id, row.contact_id);
      refreshed += 1;
    } catch (err) {
      failed += 1;
      console.error(
        `[sto-refresh] contact ${row.contact_id} (org ${row.org_id}) failed: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (failed > 0) {
    console.error(
      `[sto-refresh] ${refreshed} predictions refreshed across ${orgIds.length} org(s), ` +
        `${failed} contacts failed`,
    );
  }

  return { orgs: orgIds.length, refreshed, failed };
}
