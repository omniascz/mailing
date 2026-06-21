/**
 * Deliverability pure helpers (#351/#352/#397).
 *
 * Graymail detection + email health scoring as pure functions. Keeps
 * signals-in, decision-out boundaries clean and testable.
 */

export type GraymailTier = 'engaged' | 'at_risk' | 'graymail' | 'dormant';

export interface GraymailSignals {
  /** Total messages sent to this contact during the scoring window. */
  sendsInWindow: number;
  /** Opens + clicks during the window. */
  engagementsInWindow: number;
  /** Days since the last open OR click (null = never). */
  daysSinceLastEngagement: number | null;
  /** Days since the contact was added to the org. */
  ageInDays: number;
}

export interface GraymailDecision {
  tier: GraymailTier;
  engagementRate: number; // engagements / sends; 0 when sends==0
  /** Should we keep sending broadcast campaigns to this contact? */
  suppressBroadcast: boolean;
  /** Why we made this call — for the contact-detail UI + logs. */
  reason: string;
}

/**
 * Classify a contact into one of four graymail tiers. Transactional sending
 * is never affected; only the `suppressBroadcast` flag gates bulk campaigns.
 *
 * Tiers:
 *   - `engaged`  — recent opens/clicks → keep sending.
 *   - `at_risk`  — sent a lot but engagement rate dropped → reduce frequency.
 *   - `graymail` — no engagement in 90+ days despite recent sends → suppress.
 *   - `dormant`  — long-inactive contact (180+ days or never engaged) → suppress.
 */
export function classifyGraymail(
  signals: GraymailSignals,
  thresholds: {
    staleDays?: number; // days without engagement → graymail
    dormantDays?: number; // days without engagement → dormant
    minSendsBeforeSuppress?: number; // don't suppress brand-new contacts
    minEngagementRate?: number; // engagement rate floor
    newContactGraceDays?: number; // skip classification for fresh contacts
  } = {},
): GraymailDecision {
  const staleDays = thresholds.staleDays ?? 90;
  const dormantDays = thresholds.dormantDays ?? 180;
  const minSends = thresholds.minSendsBeforeSuppress ?? 5;
  const minRate = thresholds.minEngagementRate ?? 0.02; // 2%
  const graceDays = thresholds.newContactGraceDays ?? 14;

  const rate = signals.sendsInWindow > 0 ? signals.engagementsInWindow / signals.sendsInWindow : 0;

  // Never penalise contacts we haven't tried hard enough to engage yet.
  if (signals.ageInDays < graceDays || signals.sendsInWindow < minSends) {
    return {
      tier: 'engaged',
      engagementRate: rate,
      suppressBroadcast: false,
      reason: 'new contact — insufficient history to classify',
    };
  }

  // Dormant: long-inactive OR never engaged despite very high send volume
  // where we truly have no signal (null days + lots of sends).
  const veryHighSendNeverEngaged =
    signals.daysSinceLastEngagement === null &&
    signals.engagementsInWindow === 0 &&
    signals.sendsInWindow >= Math.max(minSends * 5, 20);
  if ((signals.daysSinceLastEngagement ?? -1) >= dormantDays || veryHighSendNeverEngaged) {
    return {
      tier: 'dormant',
      engagementRate: rate,
      suppressBroadcast: true,
      reason: `no engagement in ${signals.daysSinceLastEngagement ?? 'N/A'} days`,
    };
  }

  // Graymail: stale window + still receiving campaigns. Null
  // `daysSinceLastEngagement` (never engaged at all) counts as stale when
  // sends cross the minSends threshold.
  const effectiveStale =
    signals.daysSinceLastEngagement ?? (signals.engagementsInWindow === 0 ? staleDays : 0);
  if (effectiveStale >= staleDays) {
    return {
      tier: 'graymail',
      engagementRate: rate,
      suppressBroadcast: true,
      reason: `${signals.daysSinceLastEngagement ?? '?'} days since last open/click — below ${staleDays}d threshold`,
    };
  }

  // At risk: engagement rate below floor, but recently active.
  if (rate < minRate) {
    return {
      tier: 'at_risk',
      engagementRate: rate,
      suppressBroadcast: false,
      reason: `engagement rate ${(rate * 100).toFixed(2)}% below ${(minRate * 100).toFixed(2)}% floor`,
    };
  }

  return {
    tier: 'engaged',
    engagementRate: rate,
    suppressBroadcast: false,
    reason: 'active engagement',
  };
}

// ─── Email health score ─────────────────────────────────────────────────────

export interface EmailHealthMetrics {
  sends: number;
  delivered: number;
  bounces: number;
  hardBounces: number;
  softBounces: number;
  complaints: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
  blocks?: number; // optional — SMTP 5xx blocks
}

export interface EmailHealthScore {
  /** Composite score 0-100 — higher is better. */
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Labelled sub-scores for diagnostics. */
  components: {
    deliveryRate: number;
    bounceRate: number;
    hardBounceRate: number;
    complaintRate: number;
    engagementRate: number;
    unsubRate: number;
    blockRate: number;
  };
  /** Concrete concerns a user can act on. */
  issues: string[];
}

/**
 * Composite email-health score per domain/IP for a given time window.
 * Weights and thresholds follow common ESP guidance:
 *
 *   - Delivery rate (sends → delivered): +25 pts when ≥ 98%
 *   - Bounce rate (bounces / delivered): -20 pts when > 5%
 *   - Hard bounce rate: -25 pts when > 2%
 *   - Complaint rate (complaints / delivered): -30 pts when > 0.1%
 *   - Engagement rate ((opens+clicks) / delivered): up to +20 pts at ≥ 30%
 *   - Unsub rate: -10 pts when > 0.5%
 *   - Block rate: -20 pts when > 1%
 *
 * Each metric is clamped to sensible bounds so a single blip doesn't pin the
 * score at 0. The grade mapping mirrors school-grade conventions.
 */
export function computeEmailHealthScore(metrics: EmailHealthMetrics): EmailHealthScore {
  const delivered = Math.max(0, metrics.delivered);
  const sends = Math.max(0, metrics.sends);
  const safe = (numerator: number, denominator: number) =>
    denominator === 0 ? 0 : numerator / denominator;

  const deliveryRate = safe(delivered, sends);
  const bounceRate = safe(metrics.bounces, sends);
  const hardBounceRate = safe(metrics.hardBounces, sends);
  const complaintRate = safe(metrics.complaints, delivered);
  const engagementRate = safe(metrics.opens + metrics.clicks, delivered);
  const unsubRate = safe(metrics.unsubscribes, delivered);
  const blockRate = safe(metrics.blocks ?? 0, sends);

  // No data — return a neutral-positive score so empty domains don't show
  // red dashboards before they've sent anything.
  if (sends === 0) {
    return {
      score: 100,
      grade: 'A',
      components: {
        deliveryRate: 0,
        bounceRate: 0,
        hardBounceRate: 0,
        complaintRate: 0,
        engagementRate: 0,
        unsubRate: 0,
        blockRate: 0,
      },
      issues: [],
    };
  }

  let score = 100;
  const issues: string[] = [];

  // Delivery
  if (deliveryRate < 0.95) {
    const penalty = Math.min(25, (0.95 - deliveryRate) * 100);
    score -= penalty;
    issues.push(`Delivery rate ${(deliveryRate * 100).toFixed(2)}% below 95%`);
  }

  // Bounces (any)
  if (bounceRate > 0.02) {
    const penalty = Math.min(20, (bounceRate - 0.02) * 400);
    score -= penalty;
    issues.push(`Bounce rate ${(bounceRate * 100).toFixed(2)}% above 2%`);
  }

  // Hard bounces (worse than soft)
  if (hardBounceRate > 0.005) {
    const penalty = Math.min(25, (hardBounceRate - 0.005) * 2500);
    score -= penalty;
    issues.push(`Hard bounce rate ${(hardBounceRate * 100).toFixed(2)}% above 0.5%`);
  }

  // Complaints — strongest negative signal, lowest acceptable threshold
  if (complaintRate > 0.001) {
    const penalty = Math.min(30, (complaintRate - 0.001) * 30_000);
    score -= penalty;
    issues.push(`Complaint rate ${(complaintRate * 100).toFixed(3)}% above 0.1%`);
  }

  // Unsubscribes — mild signal
  if (unsubRate > 0.005) {
    const penalty = Math.min(10, (unsubRate - 0.005) * 1000);
    score -= penalty;
    issues.push(`Unsubscribe rate ${(unsubRate * 100).toFixed(2)}% above 0.5%`);
  }

  // SMTP blocks (e.g. 550 rejections)
  if (blockRate > 0.01) {
    const penalty = Math.min(20, (blockRate - 0.01) * 800);
    score -= penalty;
    issues.push(`SMTP block rate ${(blockRate * 100).toFixed(2)}% above 1%`);
  }

  // Engagement — reward high engagement (no penalty for low)
  if (engagementRate >= 0.3) {
    // keep at top grade, no bonus (bonuses produce perverse incentives)
  } else if (engagementRate < 0.05 && delivered >= 100) {
    score -= 10;
    issues.push(`Engagement rate ${(engagementRate * 100).toFixed(2)}% under 5%`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let grade: EmailHealthScore['grade'];
  if (score >= 90) grade = 'A';
  else if (score >= 75) grade = 'B';
  else if (score >= 60) grade = 'C';
  else if (score >= 40) grade = 'D';
  else grade = 'F';

  return {
    score,
    grade,
    components: {
      deliveryRate: round4(deliveryRate),
      bounceRate: round4(bounceRate),
      hardBounceRate: round4(hardBounceRate),
      complaintRate: round4(complaintRate),
      engagementRate: round4(engagementRate),
      unsubRate: round4(unsubRate),
      blockRate: round4(blockRate),
    },
    issues,
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

// ─── Reputation aggregation helpers (pure, no I/O) ────────────────────────────

export type ReputationTierPure = 'high' | 'medium' | 'low' | 'unknown';

export interface ReputationSummary {
  /** Worst tier across all providers with data. */
  overallTier: ReputationTierPure;
  /** Average score 0–100 across providers that reported a numeric score. */
  overallScore: number | null;
  /** Highest spam rate seen across providers. */
  maxSpamRate: number | null;
  /** Whether any provider flagged an alert-level issue. */
  hasAlert: boolean;
}

export interface ReputationProviderInput {
  tier: ReputationTierPure;
  score?: number;
  spamRate?: number;
  error?: string;
}

/**
 * Aggregate per-provider reputation signals into a single summary.
 * Pure function: no Redis, no HTTP — testable in isolation.
 */
export function aggregateReputation(
  providers: ReputationProviderInput[],
): ReputationSummary {
  const known = providers.filter((p) => p.tier !== 'unknown' && !p.error);
  const tiers = known.map((p) => p.tier);
  const scores = known.filter((p) => p.score !== undefined).map((p) => p.score as number);
  const spamRates = known.filter((p) => p.spamRate !== undefined).map((p) => p.spamRate as number);

  const overallTier: ReputationTierPure =
    tiers.length === 0
      ? 'unknown'
      : tiers.includes('low')
        ? 'low'
        : tiers.includes('medium')
          ? 'medium'
          : 'high';

  const overallScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;

  const maxSpamRate =
    spamRates.length > 0 ? Math.max(...spamRates) : null;

  const hasAlert =
    overallTier === 'low' ||
    (maxSpamRate !== null && maxSpamRate > 0.005); // > 0.5% spam rate

  return { overallTier, overallScore, maxSpamRate, hasAlert };
}
