/**
 * Anomaly detection service (task 4.4).
 *
 * Runs hourly (via BullMQ cron or a simple setInterval in dev).
 * Compares the last-hour metrics to a 30-day rolling average and fires
 * alerts when thresholds are breached.
 *
 * Thresholds:
 *   - Bounce rate   > 2× 30-day average  (or > 5% absolute)
 *   - Complaint rate > 0.1% absolute
 *   - Open rate drop > 50% from 30-day average
 *   - Unsubscribe spike > 3× 30-day average  (or > 2% absolute)
 */

import { isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { organizations, campaignAlerts } from '../../db/schema/index.js';
import { redis } from '../../lib/redis.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnomalyCheckResult {
  orgId: string;
  alerts: Array<{
    type: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    details: Record<string, unknown>;
  }>;
}

// ─── Rolling baseline ─────────────────────────────────────────────────────────

interface OrgMetrics {
  sends: number;
  bounces: number;
  complaints: number;
  opens: number;
  unsubs: number;
}

async function getMetricsForWindow(
  orgId: string,
  fromDate: Date,
  toDate: Date,
): Promise<OrgMetrics> {
  const rows = await db.execute(sql`
    SELECT event_type, COUNT(*) AS cnt
    FROM email_events
    WHERE org_id = ${orgId}
      AND created_at >= ${fromDate.toISOString()}
      AND created_at < ${toDate.toISOString()}
    GROUP BY event_type
  `);

  const get = (type: string) =>
    (rows as unknown as Array<Record<string, unknown>>).find((r) => r.event_type === type)?.cnt
      ? Number(
          (rows as unknown as Array<Record<string, unknown>>).find((r) => r.event_type === type)!
            .cnt,
        )
      : 0;

  return {
    sends: get('send'),
    bounces: get('bounce'),
    complaints: get('complaint'),
    opens: get('open'),
    unsubs: get('unsubscribe'),
  };
}

function safeRate(num: number, denom: number): number {
  return denom > 0 ? num / denom : 0;
}

// ─── Alert creation ───────────────────────────────────────────────────────────

async function createAlert(
  orgId: string,
  type: 'bounce_rate_spike' | 'complaint_rate_spike' | 'open_rate_drop' | 'unsub_spike',
  severity: 'info' | 'warning' | 'critical',
  message: string,
  details: Record<string, unknown>,
) {
  // Dedupe: don't create the same alert type twice within 4 hours
  const dedupeKey = `anomaly:${orgId}:${type}`;
  const existing = await redis.get(dedupeKey);
  if (existing) return;

  await db.insert(campaignAlerts).values({ orgId, alertType: type, severity, message, details });

  // Mark as recently alerted (4h TTL)
  await redis.setex(dedupeKey, 4 * 60 * 60, '1');
}

// ─── Main check ───────────────────────────────────────────────────────────────

export async function runAnomalyCheckForOrg(orgId: string): Promise<AnomalyCheckResult> {
  const now = new Date();

  // Last hour window
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  // 30-day window for baseline
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [current, baseline] = await Promise.all([
    getMetricsForWindow(orgId, hourAgo, now),
    getMetricsForWindow(orgId, thirtyDaysAgo, now),
  ]);

  // Daily average from 30 days → per-hour baseline
  const hoursInWindow = 30 * 24;
  const baselinePerHour: OrgMetrics = {
    sends: baseline.sends / hoursInWindow,
    bounces: baseline.bounces / hoursInWindow,
    complaints: baseline.complaints / hoursInWindow,
    opens: baseline.opens / hoursInWindow,
    unsubs: baseline.unsubs / hoursInWindow,
  };

  const alerts: AnomalyCheckResult['alerts'] = [];

  // Not enough traffic → skip checks
  if (current.sends < 10) {
    return { orgId, alerts };
  }

  // ── Bounce rate ──────────────────────────────────────────────────────────
  const currentBounceRate = safeRate(current.bounces, current.sends);
  const baselineBounceRate = safeRate(baselinePerHour.bounces, baselinePerHour.sends);
  const bounceThresholdBreached =
    currentBounceRate > 0.05 || // absolute > 5%
    (baselineBounceRate > 0 && currentBounceRate > baselineBounceRate * 2);

  if (bounceThresholdBreached) {
    const severity = currentBounceRate > 0.1 ? 'critical' : 'warning';
    const msg = `Bounce rate spiked to ${(currentBounceRate * 100).toFixed(2)}% (baseline: ${(baselineBounceRate * 100).toFixed(2)}%)`;
    alerts.push({
      type: 'bounce_rate_spike',
      severity,
      message: msg,
      details: {
        currentBounceRate,
        baselineBounceRate,
        currentSends: current.sends,
        currentBounces: current.bounces,
      },
    });
    await createAlert(orgId, 'bounce_rate_spike', severity, msg, {
      currentBounceRate,
      baselineBounceRate,
    });
  }

  // ── Complaint rate ───────────────────────────────────────────────────────
  const complaintRate = safeRate(current.complaints, current.sends);
  if (complaintRate > 0.001) {
    const severity = complaintRate > 0.003 ? 'critical' : 'warning';
    const msg = `Complaint rate is ${(complaintRate * 100).toFixed(3)}%, which exceeds the 0.1% threshold`;
    alerts.push({
      type: 'complaint_rate_spike',
      severity,
      message: msg,
      details: {
        complaintRate,
        currentComplaints: current.complaints,
        currentSends: current.sends,
      },
    });
    await createAlert(orgId, 'complaint_rate_spike', severity, msg, { complaintRate });
  }

  // ── Open rate drop ───────────────────────────────────────────────────────
  const currentOpenRate = safeRate(current.opens, current.sends);
  const baselineOpenRate = safeRate(baselinePerHour.opens, baselinePerHour.sends);
  if (baselineOpenRate > 0 && currentOpenRate < baselineOpenRate * 0.5) {
    const msg = `Open rate dropped to ${(currentOpenRate * 100).toFixed(2)}% (baseline: ${(baselineOpenRate * 100).toFixed(2)}%)`;
    alerts.push({
      type: 'open_rate_drop',
      severity: 'warning',
      message: msg,
      details: { currentOpenRate, baselineOpenRate },
    });
    await createAlert(orgId, 'open_rate_drop', 'warning', msg, {
      currentOpenRate,
      baselineOpenRate,
    });
  }

  // ── Unsubscribe spike ────────────────────────────────────────────────────
  const currentUnsubRate = safeRate(current.unsubs, current.sends);
  const baselineUnsubRate = safeRate(baselinePerHour.unsubs, baselinePerHour.sends);
  const unsubThresholdBreached =
    currentUnsubRate > 0.02 || // absolute > 2%
    (baselineUnsubRate > 0 && currentUnsubRate > baselineUnsubRate * 3);

  if (unsubThresholdBreached) {
    const msg = `Unsubscribe rate spiked to ${(currentUnsubRate * 100).toFixed(2)}% (baseline: ${(baselineUnsubRate * 100).toFixed(2)}%)`;
    alerts.push({
      type: 'unsub_spike',
      severity: 'warning',
      message: msg,
      details: { currentUnsubRate, baselineUnsubRate },
    });
    await createAlert(orgId, 'unsub_spike', 'warning', msg, {
      currentUnsubRate,
      baselineUnsubRate,
    });
  }

  return { orgId, alerts };
}

// ─── Run for all active orgs ──────────────────────────────────────────────────

export async function runAnomalyCheckAllOrgs(): Promise<void> {
  const orgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(isNull(organizations.deletedAt));

  await Promise.allSettled(orgs.map((org) => runAnomalyCheckForOrg(org.id)));
}
