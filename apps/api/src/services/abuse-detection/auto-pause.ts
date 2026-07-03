/**
 * Real-time reputation auto-pause. Previously the abuse-detection rules
 * (bounce > X%, complaint > Y% → pause/suspend) existed but were only reachable
 * via the admin route — never triggered by live bounce/complaint ingestion.
 *
 * This computes the org's recent bounce/complaint RATE and feeds it to
 * evaluateSignal (which raises events + creates sanctions + pauses running
 * campaigns). Called fire-and-forget from the bounce/complaint write paths.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/index.js';
import { evaluateSignal } from './index.js';

/** Minimum sends in the window before a rate is statistically actionable. */
const MIN_SAMPLE = 100;
/** Rolling window for the rate computation. */
const WINDOW_HOURS = 24;

/**
 * Compute recent bounce or complaint rate (as a percentage 0..100) over the
 * rolling window, plus the send sample size.
 */
export async function computeRecentRate(
  orgId: string,
  kind: 'bounce' | 'complaint',
): Promise<{ rate: number; sampleSize: number }> {
  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000);
  const eventType = kind === 'bounce' ? 'bounce' : 'complaint';
  const [row] = await db
    .select({
      sends: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'send')::int`,
      hits: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = ${eventType})::int`,
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), gte(emailEvents.createdAt, since)));

  const sends = row?.sends ?? 0;
  const hits = row?.hits ?? 0;
  const rate = sends > 0 ? (hits / sends) * 100 : 0;
  return { rate: Math.round(rate * 100) / 100, sampleSize: sends };
}

/**
 * On a bounce/complaint, recompute the rate and evaluate abuse rules. Rules
 * whose threshold is crossed create sanctions (pause_campaigns / suspend) via
 * evaluateSignal. No-op below the minimum sample size.
 */
export async function onBounceComplaintSignal(
  orgId: string,
  kind: 'bounce' | 'complaint',
): Promise<void> {
  const { rate, sampleSize } = await computeRecentRate(orgId, kind);
  if (sampleSize < MIN_SAMPLE) return;
  await evaluateSignal({
    orgId,
    signalType: kind === 'bounce' ? 'high_bounce_rate' : 'high_complaint_rate',
    observedValue: rate,
    sampleSize,
    metadata: { source: 'ingestion', windowHours: WINDOW_HOURS },
  });
}
