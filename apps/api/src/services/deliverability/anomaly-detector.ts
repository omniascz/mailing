/**
 * Bounce / complaint anomaly detector (§9 P1).
 *
 * Watches in-flight email campaigns and auto-pauses any whose 1-hour
 * rolling rates cross deliverability danger thresholds:
 *
 *   • Bounce rate >= 5 %      → SOFT pause (Gmail will throttle anyway)
 *   • Complaint rate >= 0.3 % → HARD pause (Gmail's published cap)
 *
 * Only campaigns currently `sending` are considered. Once a pause fires
 * we also post an incident to the status page so the operator dashboard
 * surfaces the problem alongside other live incidents.
 *
 * Designed to run on a 5-minute cadence (BullMQ recurring job in
 * apps/workers). A POST /api/v1/anomaly-detector/scan endpoint exists
 * for ad-hoc invocation from the operator console.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { campaigns, emailEvents } from '../../db/schema/index.js';
import { reportIncident } from '../status-page/index.js';

export interface AnomalyThresholds {
  bounceRatePct: number;
  complaintRatePct: number;
  /** Minimum recipients before a percentage is statistically meaningful. */
  minRecipientsForRatio: number;
  /** Window over which rates are computed (ms). */
  windowMs: number;
}

export const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  bounceRatePct: 5,
  complaintRatePct: 0.3,
  minRecipientsForRatio: 100,
  windowMs: 60 * 60 * 1000,
};

export type AnomalyReason = 'high_bounce_rate' | 'high_complaint_rate';

export interface CampaignAnomaly {
  campaignId: string;
  orgId: string;
  reason: AnomalyReason;
  bounceRatePct: number;
  complaintRatePct: number;
  sampleSize: number;
}

/**
 * Examine one campaign's 1h send window. Returns a fault when either
 * threshold trips; returns null when the campaign is healthy or has
 * too small a sample to judge.
 */
export async function evaluateCampaign(
  campaignId: string,
  orgId: string,
  thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS,
): Promise<CampaignAnomaly | null> {
  const cutoff = new Date(Date.now() - thresholds.windowMs);

  const [row] = (await db
    .select({
      sends: sql<string>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'send')::text`,
      bounces: sql<string>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'bounce')::text`,
      complaints: sql<string>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'complaint')::text`,
    })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.campaignId, campaignId),
        sql`${emailEvents.createdAt} >= ${sql.param(cutoff, emailEvents.createdAt)}`,
      ),
    )) as unknown as Array<{
    sends: string;
    bounces: string;
    complaints: string;
  }>;

  const sends = Number(row?.sends ?? 0);
  if (sends < thresholds.minRecipientsForRatio) return null;

  const bounces = Number(row?.bounces ?? 0);
  const complaints = Number(row?.complaints ?? 0);
  const bounceRatePct = (bounces / sends) * 100;
  const complaintRatePct = (complaints / sends) * 100;

  if (complaintRatePct >= thresholds.complaintRatePct) {
    return {
      campaignId,
      orgId,
      reason: 'high_complaint_rate',
      bounceRatePct,
      complaintRatePct,
      sampleSize: sends,
    };
  }
  if (bounceRatePct >= thresholds.bounceRatePct) {
    return {
      campaignId,
      orgId,
      reason: 'high_bounce_rate',
      bounceRatePct,
      complaintRatePct,
      sampleSize: sends,
    };
  }
  return null;
}

/**
 * Pause a campaign + emit a status-page incident. Idempotent — running
 * twice doesn't double-pause and doesn't open a duplicate incident
 * because the status-page dedup key is rate-bound by reason.
 */
async function pauseAndAlert(anomaly: CampaignAnomaly): Promise<void> {
  await db
    .update(campaigns)
    .set({
      status: 'paused',
      updatedAt: new Date(),
    })
    .where(and(eq(campaigns.id, anomaly.campaignId), eq(campaigns.orgId, anomaly.orgId)));

  void reportIncident(anomaly.reason, {
    summary: `Campaign ${anomaly.campaignId.slice(0, 8)} auto-paused`,
    metrics: {
      bounceRatePct: Math.round(anomaly.bounceRatePct * 100) / 100,
      complaintRatePct: Math.round(anomaly.complaintRatePct * 100) / 100,
      sampleSize: anomaly.sampleSize,
    },
  });
}

export interface SweepResult {
  scanned: number;
  paused: number;
  anomalies: CampaignAnomaly[];
  errors: number;
}

/**
 * Single-pass sweep over every campaign in `sending` status. Used by
 * the BullMQ recurring job + the operator console "scan now" button.
 */
export async function scanForAnomalies(
  thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS,
): Promise<SweepResult> {
  // `sending` only, and deliberately not `queueing`.
  //
  // The instinct after splitting the states is to give this sweep back its old
  // narrow window, which is now `queueing`. That would make it useless: during
  // `queueing` the splitter is still turning the audience into batches, no
  // message has been handed to an MX, and there is not one event to evaluate a
  // bounce rate from. Every anomaly this detector exists to find happens in
  // `sending`.
  //
  // The honest consequence is that the sweep now covers a window measured in
  // hours instead of the minutes the splitter used to take, so it examines more
  // campaigns and does so for longer. That is not a regression — it is the
  // detector finally watching the part of the send where things go wrong.
  // Before the split it was very nearly inert, because campaigns left `sending`
  // within minutes of the splitter finishing and long before their bounces came
  // back. `campaigns_status_idx` covers the predicate.
  const rows = await db
    .select({ id: campaigns.id, orgId: campaigns.orgId })
    .from(campaigns)
    .where(eq(campaigns.status, 'sending'));

  let paused = 0;
  let errors = 0;
  const anomalies: CampaignAnomaly[] = [];
  for (const c of rows) {
    try {
      const a = await evaluateCampaign(c.id, c.orgId, thresholds);
      if (a) {
        anomalies.push(a);
        await pauseAndAlert(a);
        paused++;
      }
    } catch {
      errors++;
    }
  }
  return { scanned: rows.length, paused, anomalies, errors };
}

// Internal helper exposed for tests + the operator dashboard.
export { pauseAndAlert };
