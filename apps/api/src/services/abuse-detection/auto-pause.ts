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
import { deliveryDenominators, MIN_OUTCOME_SAMPLE } from '../deliverability/pure.js';
import { evaluateSignal } from './index.js';

/** Minimum messages in the window before a rate is statistically actionable. */
const MIN_SAMPLE = MIN_OUTCOME_SAMPLE;
/** Rolling window for the rate computation. */
const WINDOW_HOURS = 24;

/**
 * Compute recent bounce or complaint rate (as a percentage 0..100) over the
 * rolling window, plus the sample it was computed over.
 *
 * Numerator and denominator come from the same set: the outcome mta-sender
 * records for every message it attempts — one 'deliver' or one 'bounce'.
 *
 * The denominator used to be the 'send' rows, and those are a billing record,
 * not a delivery one. The routes that bill a message write one (/emails once
 * per call, whatever its recipient count); the other callers of
 * sendTransactionalEmail — password resets, DOI confirmations, alerts — write
 * none; mta-sender writes one for campaign mail it delivered and none for a
 * campaign message that bounced. Measured on that basis:
 * - an org sending only resets had no sample, so its rule never fired, even
 *   at 15 %;
 * - a campaign with 10 bounces in 100 had a sample of 90 and did not fire;
 * - an org mixing billed receipts with resets read 10 % where 5 % bounced.
 * Billing still counts 'send' rows (billing/plan-enforcement.ts) and is
 * untouched: a reset is not billed, and its bounce still counts here.
 *
 * Complaints can only follow delivered mail, so their denominator is
 * 'deliver' alone. Both denominators come from `deliveryDenominators`, the
 * one definition every deliverability rate shares.
 */
export async function computeRecentRate(
  orgId: string,
  kind: 'bounce' | 'complaint',
): Promise<{ rate: number; sampleSize: number }> {
  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000);
  const [row] = await db
    .select({
      delivered: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'deliver')::int`,
      bounced: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'bounce')::int`,
      complained: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'complaint')::int`,
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), gte(emailEvents.createdAt, since)));

  const bounced = row?.bounced ?? 0;
  const { delivered, attempted } = deliveryDenominators({
    delivered: row?.delivered ?? 0,
    bounces: bounced,
  });
  const hits = kind === 'bounce' ? bounced : (row?.complained ?? 0);
  const sample = kind === 'bounce' ? attempted : delivered;
  const rate = sample > 0 ? (hits / sample) * 100 : 0;
  return { rate: Math.round(rate * 100) / 100, sampleSize: sample };
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
