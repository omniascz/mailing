/**
 * Pre-send Go/No-Go panel — pure scoring logic (P1, §9 Pre-send unified panel).
 *
 * The orchestrator (`go-no-go.ts`) collects per-check facts from the
 * domain, audience, content, and deliverability services. This file
 * converts those facts into normalised CheckResult rows and aggregates
 * the whole set into a single `verdict` the campaign-send action can
 * gate on.
 */

export type CheckSeverity = 'pass' | 'info' | 'warn' | 'fail';

export type CheckCategory =
  | 'audience'
  | 'content'
  | 'authentication'
  | 'deliverability'
  | 'compliance'
  | 'reputation'
  | 'timing';

export interface CheckResult {
  /** Stable identifier, used by UI to map to fix CTAs. */
  id: string;
  category: CheckCategory;
  severity: CheckSeverity;
  title: string;
  /** Optional short detail (≤ 240 chars). */
  detail?: string;
  /** Optional canonical fix link inside the dashboard. */
  fixHref?: string;
  /** Free-form metric snapshot for tooltips. */
  metrics?: Record<string, string | number>;
}

export type Verdict = 'go' | 'caution' | 'no-go';

/**
 * Aggregate per-check results into a single send-gate verdict.
 *
 * Rules:
 *   any `fail` → 'no-go'
 *   else any `warn` → 'caution'
 *   else            → 'go'
 *
 * Info-only checks never affect the verdict — they are nudges, not
 * blockers. Pass-tier checks never affect the verdict either.
 */
export function aggregateVerdict(results: CheckResult[]): Verdict {
  if (results.some((r) => r.severity === 'fail')) return 'no-go';
  if (results.some((r) => r.severity === 'warn')) return 'caution';
  return 'go';
}

/**
 * Sort checks by importance for UI display:
 *   1. fails first (group by category)
 *   2. warns next
 *   3. info next
 *   4. passes last
 * Within a severity, deterministic by category order + id.
 */
const SEVERITY_ORDER: Record<CheckSeverity, number> = {
  fail: 0,
  warn: 1,
  info: 2,
  pass: 3,
};

const CATEGORY_ORDER: Record<CheckCategory, number> = {
  authentication: 0,
  audience: 1,
  compliance: 2,
  content: 3,
  deliverability: 4,
  reputation: 5,
  timing: 6,
};

export function prioritise(results: CheckResult[]): CheckResult[] {
  return [...results].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const catDiff = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (catDiff !== 0) return catDiff;
    return a.id.localeCompare(b.id);
  });
}

/** Severity counts for the panel summary chip. */
export interface SeverityCounts {
  pass: number;
  info: number;
  warn: number;
  fail: number;
}

export function countBySeverity(results: CheckResult[]): SeverityCounts {
  const counts: SeverityCounts = { pass: 0, info: 0, warn: 0, fail: 0 };
  for (const r of results) counts[r.severity]++;
  return counts;
}

// ─── Individual check classifiers ──────────────────────────────────────────
// Each classify*() function takes raw facts and returns a CheckResult. Pure
// so the orchestrator can build the result list incrementally + test each
// check in isolation.

export function classifyDomainAuth(input: {
  spfValid: boolean;
  dkimValid: boolean;
  dmarcPresent: boolean;
}): CheckResult {
  const missing: string[] = [];
  if (!input.spfValid) missing.push('SPF');
  if (!input.dkimValid) missing.push('DKIM');
  if (!input.dmarcPresent) missing.push('DMARC');

  if (missing.length === 0) {
    return {
      id: 'domain-auth',
      category: 'authentication',
      severity: 'pass',
      title: 'Sending domain fully authenticated',
    };
  }

  // DKIM/SPF missing is a hard fail — Gmail/Yahoo bulk-sender rules
  // reject unauthenticated bulk mail outright since Feb 2024.
  if (!input.dkimValid || !input.spfValid) {
    return {
      id: 'domain-auth',
      category: 'authentication',
      severity: 'fail',
      title: `Missing ${missing.join(' + ')} on sending domain`,
      detail:
        'Gmail and Yahoo bulk-sender rules reject mail without SPF + DKIM. Authenticate before sending.',
      fixHref: '/settings/domains',
    };
  }
  // Only DMARC missing — warn rather than fail; deliverability hit is
  // softer than outright rejection.
  return {
    id: 'domain-auth',
    category: 'authentication',
    severity: 'warn',
    title: 'DMARC record missing',
    detail: 'Without DMARC the recipient can\'t verify alignment. Add a p=none record to start.',
    fixHref: '/settings/domains',
  };
}

export function classifyAudienceSize(input: { recipientCount: number }): CheckResult {
  if (input.recipientCount === 0) {
    return {
      id: 'audience-empty',
      category: 'audience',
      severity: 'fail',
      title: 'No recipients in selected audience',
      detail: 'Pick a list or segment with at least one active contact.',
    };
  }
  if (input.recipientCount > 100_000) {
    return {
      id: 'audience-size',
      category: 'audience',
      severity: 'warn',
      title: 'Large audience — enable batch delivery',
      detail: 'For 100K+ sends, batch delivery smooths ISP throughput and protects reputation.',
      metrics: { recipientCount: input.recipientCount },
      fixHref: '/campaigns/settings/batch-delivery',
    };
  }
  return {
    id: 'audience-size',
    category: 'audience',
    severity: 'pass',
    title: `${input.recipientCount.toLocaleString('en-US')} recipients`,
  };
}

export function classifySuppression(input: {
  recipientCount: number;
  suppressedCount: number;
}): CheckResult {
  if (input.recipientCount === 0) {
    return {
      id: 'suppression-match',
      category: 'audience',
      severity: 'info',
      title: 'Suppression check skipped (empty audience)',
    };
  }
  const pct = (input.suppressedCount / input.recipientCount) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (pct >= 10) {
    return {
      id: 'suppression-match',
      category: 'audience',
      severity: 'warn',
      title: `${rounded}% of audience is suppressed`,
      detail: 'High suppression overlap shrinks effective reach. Review your segment rules.',
      metrics: { suppressedPct: rounded, suppressedCount: input.suppressedCount },
    };
  }
  return {
    id: 'suppression-match',
    category: 'audience',
    severity: 'pass',
    title: `${rounded}% suppression overlap`,
  };
}

export function classifyUnsubscribeLink(input: { hasUnsubscribe: boolean }): CheckResult {
  if (!input.hasUnsubscribe) {
    return {
      id: 'unsubscribe-link',
      category: 'compliance',
      severity: 'fail',
      title: 'Email body has no unsubscribe link',
      detail:
        'GDPR + CAN-SPAM + ePrivacy require a working unsubscribe in every marketing email.',
      fixHref: '/editor/preferences',
    };
  }
  return {
    id: 'unsubscribe-link',
    category: 'compliance',
    severity: 'pass',
    title: 'Unsubscribe link present',
  };
}

export function classifyPreferenceCenter(input: {
  hasPreferenceCenterTag: boolean;
}): CheckResult {
  if (input.hasPreferenceCenterTag) {
    return {
      id: 'preference-center-tag',
      category: 'compliance',
      severity: 'pass',
      title: '{{preference_center_url}} merge tag present',
    };
  }
  return {
    id: 'preference-center-tag',
    category: 'compliance',
    severity: 'info',
    title: 'Consider adding {{preference_center_url}} merge tag',
    detail:
      'Per-purpose preference center reduces full unsubscribes by ~30%. Insert near the footer.',
  };
}

export function classifySubject(input: { subject: string }): CheckResult {
  const len = input.subject.trim().length;
  if (len === 0) {
    return {
      id: 'subject',
      category: 'content',
      severity: 'fail',
      title: 'Subject line is empty',
    };
  }
  if (len < 5) {
    return {
      id: 'subject',
      category: 'content',
      severity: 'fail',
      title: 'Subject line too short',
      detail: 'A 5+ character subject is required.',
    };
  }
  if (len > 80) {
    return {
      id: 'subject',
      category: 'content',
      severity: 'warn',
      title: `Subject ${len} chars — may truncate on mobile`,
      metrics: { subjectLength: len },
    };
  }
  return {
    id: 'subject',
    category: 'content',
    severity: 'pass',
    title: `Subject ${len} chars — fits inbox preview`,
  };
}

export function classifySpamScore(input: { spamScore: number; topIssues: string[] }): CheckResult {
  if (input.spamScore >= 8) {
    return {
      id: 'spam-score',
      category: 'deliverability',
      severity: 'fail',
      title: `Spam score ${input.spamScore}/10 — likely to be filtered`,
      detail: input.topIssues.slice(0, 2).join('; ') || undefined,
      metrics: { spamScore: input.spamScore },
    };
  }
  if (input.spamScore >= 5) {
    return {
      id: 'spam-score',
      category: 'deliverability',
      severity: 'warn',
      title: `Spam score ${input.spamScore}/10 — review flagged phrases`,
      detail: input.topIssues.slice(0, 2).join('; ') || undefined,
      metrics: { spamScore: input.spamScore },
    };
  }
  return {
    id: 'spam-score',
    category: 'deliverability',
    severity: 'pass',
    title: `Spam score ${input.spamScore}/10 — low risk`,
  };
}

export function classifyPlainText(input: { hasPlainText: boolean }): CheckResult {
  if (input.hasPlainText) {
    return {
      id: 'plain-text-alt',
      category: 'deliverability',
      severity: 'pass',
      title: 'Plain-text alternative attached',
    };
  }
  return {
    id: 'plain-text-alt',
    category: 'deliverability',
    severity: 'warn',
    title: 'No plain-text alternative',
    detail:
      'multipart/alternative improves deliverability on text-first clients. Auto-derived if you leave it blank.',
  };
}

export function classifyBounceRate(input: { recent7dBounceRatePct: number | null }): CheckResult {
  if (input.recent7dBounceRatePct === null) {
    return {
      id: 'bounce-rate',
      category: 'reputation',
      severity: 'info',
      title: 'No recent send history to compare',
    };
  }
  const pct = input.recent7dBounceRatePct;
  if (pct >= 5) {
    return {
      id: 'bounce-rate',
      category: 'reputation',
      severity: 'fail',
      title: `Recent 7-day bounce rate ${pct.toFixed(1)}% — over ISP threshold`,
      detail: 'Sending while bounce rate is above 5% risks suspension. Clean your list first.',
      metrics: { bounceRatePct: pct },
    };
  }
  if (pct >= 2) {
    return {
      id: 'bounce-rate',
      category: 'reputation',
      severity: 'warn',
      title: `Recent 7-day bounce rate ${pct.toFixed(1)}%`,
      metrics: { bounceRatePct: pct },
    };
  }
  return {
    id: 'bounce-rate',
    category: 'reputation',
    severity: 'pass',
    title: `Recent 7-day bounce rate ${pct.toFixed(1)}%`,
  };
}

export function classifyComplaintRate(input: {
  recent7dComplaintRatePct: number | null;
  /** 24-hour complaint rate, used for Gmail's rolling 24h cap check. Null if < 100 sends in window. */
  recent24hComplaintRatePct?: number | null;
}): CheckResult {
  const pct7d = input.recent7dComplaintRatePct;
  const pct24h = input.recent24hComplaintRatePct ?? null;

  if (pct7d === null && pct24h === null) {
    return {
      id: 'complaint-rate',
      category: 'reputation',
      severity: 'info',
      title: 'No recent send history to compare',
    };
  }

  // Gmail's hard cap is 0.3% on a rolling 24h window. Use the 24h rate when
  // we have sufficient volume (≥ 100 sends); fall back to 7d for the check.
  const gmailCheckPct = pct24h ?? pct7d ?? 0;
  if (gmailCheckPct >= 0.3) {
    return {
      id: 'complaint-rate',
      category: 'reputation',
      severity: 'fail',
      title: `Complaint rate ${gmailCheckPct.toFixed(2)}% (24h) — above Gmail 0.3% cap`,
      detail:
        'Gmail blocks senders above 0.3% on a rolling 24h basis. Pause sending and audit list quality.',
      metrics: { complaintRatePct: gmailCheckPct, window: pct24h !== null ? '24h' : '7d' },
    };
  }

  // 7-day trend warning at 0.1%
  const trendPct = pct7d ?? 0;
  if (trendPct >= 0.1) {
    return {
      id: 'complaint-rate',
      category: 'reputation',
      severity: 'warn',
      title: `Complaint rate ${trendPct.toFixed(2)}% (7d)`,
      detail: 'Approaching Gmail warning threshold. Consider cleaning list or tightening targeting.',
      metrics:
        pct24h !== null
          ? { complaintRatePct: trendPct, complaintRate24hPct: pct24h }
          : { complaintRatePct: trendPct },
    };
  }

  return {
    id: 'complaint-rate',
    category: 'reputation',
    severity: 'pass',
    title: `Complaint rate ${trendPct.toFixed(2)}% (7d)${pct24h !== null ? `, ${pct24h.toFixed(2)}% (24h)` : ''}`,
  };
}

export function classifyFrequencyCap(input: {
  recipientCount: number;
  cappedCount: number;
}): CheckResult {
  if (input.recipientCount === 0) {
    return {
      id: 'frequency-cap',
      category: 'audience',
      severity: 'info',
      title: 'Frequency cap check skipped (empty audience)',
    };
  }
  const pct = (input.cappedCount / input.recipientCount) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (pct >= 25) {
    return {
      id: 'frequency-cap',
      category: 'audience',
      severity: 'warn',
      title: `${rounded}% of audience hit frequency cap`,
      detail: 'Many recipients will be silently skipped. Consider lowering send volume.',
      metrics: { cappedPct: rounded },
    };
  }
  return {
    id: 'frequency-cap',
    category: 'audience',
    severity: 'pass',
    title: `${rounded}% will be capped`,
  };
}

export function classifyScheduledTime(input: {
  scheduledAt: Date | null;
  recipientTimezone?: string;
}): CheckResult {
  if (!input.scheduledAt) {
    return {
      id: 'schedule-time',
      category: 'timing',
      severity: 'info',
      title: 'Send will go out immediately',
    };
  }
  const hour = input.scheduledAt.getUTCHours();
  // Recommend business hours in the recipient TZ; fall back to UTC.
  // Roughly 06:00–22:00 UTC covers reasonable EU windows.
  if (hour < 5 || hour > 22) {
    return {
      id: 'schedule-time',
      category: 'timing',
      severity: 'info',
      title: 'Scheduled outside typical engagement window',
      detail: 'Engagement drops off after 22:00 local time. Consider STO per-contact scheduling.',
      metrics: { scheduledHourUtc: hour },
    };
  }
  return {
    id: 'schedule-time',
    category: 'timing',
    severity: 'pass',
    title: 'Scheduled within engagement window',
  };
}

/**
 * Classify IP warmup capacity vs. campaign size.
 *
 * @param totalDailyCapacity  Sum of remainingToday across all warming IPs (-1 = fully warm pool)
 * @param recipientCount      Estimated recipients this campaign will reach
 */
export function classifyWarmupCapacity(input: {
  totalDailyCapacity: number;
  recipientCount: number;
}): CheckResult {
  if (input.totalDailyCapacity < 0) {
    return {
      id: 'ip-warmup',
      category: 'deliverability',
      severity: 'pass',
      title: 'Sending pool fully warmed',
    };
  }
  if (input.totalDailyCapacity === 0) {
    return {
      id: 'ip-warmup',
      category: 'deliverability',
      severity: 'fail',
      title: 'IP warmup daily limit reached',
      detail: 'All sending IPs have hit their daily cap. Remaining emails will queue until tomorrow.',
      metrics: { remainingCapacity: 0 },
    };
  }
  if (input.recipientCount > input.totalDailyCapacity) {
    const overflow = input.recipientCount - input.totalDailyCapacity;
    return {
      id: 'ip-warmup',
      category: 'deliverability',
      severity: 'warn',
      title: `IP warmup: only ${input.totalDailyCapacity.toLocaleString()} of ${input.recipientCount.toLocaleString()} can send today`,
      detail: `${overflow.toLocaleString()} emails will queue until tomorrow due to IP warmup limits.`,
      metrics: { remainingCapacity: input.totalDailyCapacity, overflow },
    };
  }
  return {
    id: 'ip-warmup',
    category: 'deliverability',
    severity: 'pass',
    title: `IP warmup: capacity for ${input.totalDailyCapacity.toLocaleString()} emails today`,
    metrics: { remainingCapacity: input.totalDailyCapacity },
  };
}
