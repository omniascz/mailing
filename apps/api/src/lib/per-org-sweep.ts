/**
 * One organisation failing must not stop the sweep, and must not be silent.
 *
 * Three internal endpoints walk every organisation and call one function per
 * org: ads/sync-performance, seo/rank-poll and social/monitor-poll. All three
 * wrapped that call in `catch { /* skip *\/ }`. The sweep finished, the cron
 * went green, and an organisation whose credentials had expired simply stopped
 * producing data — with nothing anywhere saying so.
 *
 * Two of the three lose data permanently when that happens. `syncAdPerformance`
 * writes a snapshot for `new Date().toISOString().slice(0, 10)`, so a failure
 * today is a hole in today's row that tomorrow's run does not fill — tomorrow
 * targets tomorrow. The SEO rank poll has the same shape. The social monitor
 * re-polls a rolling window every fifteen minutes and does recover from a
 * transient failure — but not from a permanent one, and a permanently broken
 * org is exactly what none of the three could report.
 *
 * The goal here is visibility, not failure. Throwing would abandon the
 * organisations behind the broken one, which is worse than what it replaces;
 * these crons retry (`sparse`, since #98) and a retry would hit the same
 * broken org and stop at the same place. So the error is logged with the
 * organisation's id, the run reports how many succeeded and how many did not,
 * and the caller can put that number in its response.
 *
 * Shape follows the invoice-reminder sweep from #114: log the identifier, keep
 * going, summarise at the end.
 */

export interface SweepFailure {
  orgId: string;
  error: string;
}

export interface SweepOutcome<T> {
  /** Organisations attempted. */
  attempted: number;
  /** Values returned by the ones that succeeded, in order. */
  succeeded: T[];
  /** One entry per organisation that threw. */
  failures: SweepFailure[];
}

/**
 * Run `fn` for every organisation, surviving individual failures.
 *
 * `label` prefixes the log lines and should name the sweep, not the endpoint —
 * it is what somebody greps for when an organisation reports missing data.
 */
export async function sweepOrgs<T>(
  orgIds: readonly string[],
  label: string,
  fn: (orgId: string) => Promise<T>,
  log: Pick<Console, 'error'> = console,
): Promise<SweepOutcome<T>> {
  const succeeded: T[] = [];
  const failures: SweepFailure[] = [];

  for (const orgId of orgIds) {
    try {
      succeeded.push(await fn(orgId));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      failures.push({ orgId, error });
      log.error(`[${label}] org ${orgId} failed and was skipped: ${error}`);
    }
  }

  if (failures.length > 0) {
    log.error(
      `[${label}] ${succeeded.length}/${orgIds.length} organisations processed, ` +
        `${failures.length} failed: ${failures.map((f) => f.orgId).join(', ')}`,
    );
  }

  return { attempted: orgIds.length, succeeded, failures };
}
