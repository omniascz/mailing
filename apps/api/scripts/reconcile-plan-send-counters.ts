/**
 * Compare every organisation's plan send counter with email_events and name
 * each one that differs (Z136). See services/billing/plan-send-reconcile.ts
 * for what is compared and why this is run on demand rather than as a job.
 *
 *   pnpm --filter @forgemsg/api reconcile:plan-sends [--org <uuid>]
 *
 * Exits 0 when every counter matches, 1 when any differs, so it can gate a
 * billing run or be put on a cron by whoever decides to.
 */
import { reconcilePlanSendCounters } from '../src/services/billing/plan-send-reconcile.js';

const orgArg = process.argv.indexOf('--org');
const orgId = orgArg >= 0 ? process.argv[orgArg + 1] : undefined;

const { checked, drift } = await reconcilePlanSendCounters({ orgId });
console.log(`[reconcile:plan-sends] ${checked} organisation(s) checked, ${drift.length} differ`);
for (const d of drift) {
  console.log(
    `  DIFF org=${d.orgId} slug=${d.slug} period_start=${d.periodStart.toISOString()} ` +
      `counter=${d.counter} truth=${d.truth} diff=${d.diff > 0 ? '+' : ''}${d.diff}` +
      (d.mayBeArchived
        ? ' (period reaches past the archive cutoff: sends may have been archived)'
        : ''),
  );
}
process.exit(drift.length === 0 ? 0 : 1);
