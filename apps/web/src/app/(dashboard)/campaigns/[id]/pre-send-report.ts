/**
 * The pre-send verdict, read for a person about to press Send.
 *
 * GET /api/v1/campaigns/:id/pre-send-checks returns every criterion the
 * server's gate (apps/api/src/services/pre-send/send-gate.ts) decides on, and
 * POST /send and /schedule refuse a no-go campaign with 422 unless the request
 * carries `acknowledgeDeliverabilityRisk: true`. This module turns both into
 * what the panel shows: each criterion named, with what was measured against
 * which threshold — including the sample and its minimum where the gate gives
 * them — and, for a blocking one, what to do about it and where.
 *
 * Pure: no fetch and no React, so it is tested directly.
 */

export type Severity = 'pass' | 'info' | 'warn' | 'fail';
export type Verdict = 'go' | 'caution' | 'no-go';

export interface Check {
  id: string;
  category?: string;
  severity: Severity;
  title: string;
  detail?: string;
  fixHref?: string;
  metrics?: Record<string, string | number>;
}

export interface PreSendReport {
  verdict: Verdict;
  score?: number;
  grade?: string;
  checks: Check[];
}

/** A blocking criterion as the 422 names it (details.blocking). */
export interface RefusedCriterion {
  id: string;
  title: string;
  metrics?: Record<string, string | number>;
}

/** The body field that sends a no-go campaign anyway. Server contract, #245. */
export const ACKNOWLEDGE_FIELD = 'acknowledgeDeliverabilityRisk';

const LABELS: Record<string, string> = {
  'domain-auth': 'Sending domain authentication (SPF, DKIM, DMARC)',
  'audience-empty': 'Campaign recipients',
  'audience-size': 'Audience size',
  'suppression-match': 'Suppressed addresses in the audience',
  'frequency-cap': 'Frequency cap',
  subject: 'Subject',
  'merge-tags': 'Merge tags',
  'unsubscribe-link': 'Unsubscribe link',
  'preference-center-tag': 'Preference centre link',
  'spam-score': 'Spam score',
  'plain-text-alt': 'Plain-text version',
  'ip-warmup': 'IP warm-up',
  'bounce-rate': 'Bounce rate (7 days)',
  'complaint-rate': 'Spam complaint rate',
  'schedule-time': 'Send time',
  blacklist: 'IP blacklists',
};

export function criterionLabel(id: string): string {
  return LABELS[id] ?? id;
}

const pct = (v: number) => `${round(v)}%`;
const round = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

/**
 * Every metric the gate reports, in words. Known keys get a label and a
 * unit; a key this list does not know is still shown, as `key: value`, so a
 * criterion the server adds later is never silently dropped from the panel.
 */
export function describeMetrics(metrics: Record<string, string | number> | undefined): string[] {
  if (!metrics) return [];
  const m = { ...metrics };
  const out: string[] = [];
  const take = (k: string) => {
    const v = m[k];
    delete m[k];
    return v;
  };
  const num = (k: string) => {
    const v = take(k);
    return typeof v === 'number' ? v : v === undefined ? undefined : Number(v);
  };

  const bounce = num('bounceRatePct');
  const complaint = num('complaintRatePct');
  const complaint24 = num('complaintRate24hPct');
  const threshold = num('thresholdPct');
  const window = take('window');
  if (bounce !== undefined) out.push(`Measured: ${pct(bounce)} of messages bounced`);
  if (complaint !== undefined)
    out.push(
      `Measured: ${pct(complaint)} complaints${window ? ` (${window === '24h' ? '24-hour' : '7-day'} window)` : ''}`,
    );
  if (complaint24 !== undefined) out.push(`Last 24 hours: ${pct(complaint24)}`);
  if (threshold !== undefined) out.push(`Threshold: ${pct(threshold)}`);

  const sample = num('sampleSize');
  const sample7d = num('sample7d');
  const sample24h = num('sample24h');
  const minSample = num('minSample');
  if (sample !== undefined)
    out.push(
      `Sample: ${sample}${minSample !== undefined ? ` (minimum ${minSample})` : ''}` +
        (minSample !== undefined && sample < minSample ? ' — not counted towards the verdict' : ''),
    );
  if (sample7d !== undefined)
    out.push(
      `7-day sample: ${sample7d} delivered${minSample !== undefined ? ` (minimum ${minSample})` : ''}` +
        (minSample !== undefined && sample7d < minSample
          ? ' — not counted towards the verdict'
          : ''),
    );
  if (sample24h !== undefined) out.push(`24-hour sample: ${sample24h} delivered`);
  if (sample === undefined && sample7d === undefined && minSample !== undefined)
    out.push(`Minimum sample: ${minSample}`);

  const pairs: Array<[string, (v: number | string) => string]> = [
    ['recipientCount', (v) => `Recipients: ${v}`],
    ['suppressedPct', (v) => `Suppressed: ${pct(Number(v))}`],
    ['suppressedCount', (v) => `Suppressed addresses: ${v}`],
    ['cappedPct', (v) => `Stopped by the frequency cap: ${pct(Number(v))}`],
    ['subjectLength', (v) => `Subject length: ${v} characters`],
    ['spamScore', (v) => `Score: ${v}/10`],
    ['unknownTags', (v) => `Unknown merge tags: ${v}`],
    ['unknownFilters', (v) => `Unknown filters: ${v}`],
    ['remainingCapacity', (v) => `Can still be sent today: ${v}`],
    ['overflow', (v) => `Waits until tomorrow: ${v}`],
    ['blacklisted', (v) => `Blacklisted IPs: ${v}`],
    ['total', (v) => `IP addresses in total: ${v}`],
    ['checkedIps', (v) => `IPs checked: ${v}`],
    ['scheduledHourUtc', (v) => `Send hour (UTC): ${v}`],
  ];
  for (const [k, fmt] of pairs) {
    const v = take(k);
    if (v !== undefined) out.push(fmt(v));
  }
  for (const [k, v] of Object.entries(m)) out.push(`${k}: ${v}`);
  return out;
}

export interface Remedy {
  text: string;
  /** Only where a page in the app lets the customer make the fix. Never a dead link. */
  href?: string;
  linkLabel?: string;
}

/** Where the customer reaches support when the fix is not theirs to make. */
export const SUPPORT_EMAIL = 'support@mailforge.cz';

/**
 * What to do about a blocking criterion, and the page in the app where it is
 * done. A link is given only when that page exists and lets the customer make
 * the fix; when the fix is not in the customer's hands (the sending IPs are
 * the platform's), there is no link — the text says what to do and who to ask.
 */
export function remedyFor(id: string, campaignId: string): Remedy {
  const edit = `/campaigns/${campaignId}/edit`;
  switch (id) {
    case 'domain-auth':
      return {
        text:
          'At your DNS provider, add the SPF, DKIM and DMARC records (the values are on the domain page). ' +
          'Then click “Re-verify DNS” on the domain page.',
        href: '/domains',
        linkLabel: 'Open domains',
      };
    case 'audience-empty':
      return {
        text: 'Choose a list for the campaign that has at least one active contact.',
        href: edit,
        linkLabel: 'Edit campaign',
      };
    case 'unsubscribe-link':
      return {
        text: 'Add an unsubscribe link ({{unsubscribe_url}}) to the HTML content, or build the content in the visual editor, which adds it for you.',
        href: edit,
        linkLabel: 'Edit campaign',
      };
    case 'subject':
      return { text: 'Fill in the campaign subject.', href: edit, linkLabel: 'Edit campaign' };
    case 'spam-score':
      return {
        text: 'Reword what the spam filter flags (see the details above).',
        href: edit,
        linkLabel: 'Edit campaign',
      };
    case 'bounce-rate':
      return {
        text:
          'Bounced addresses are already suppressed and are not sent to again; the rate falls as those messages leave the 7-day window. ' +
          'In the meantime, remove old and unconfirmed addresses from the list.',
        href: '/lists',
        linkLabel: 'Open lists',
      };
    case 'complaint-rate':
      return {
        text: 'Send only to contacts who want your emails: remove addresses without clear consent from the list.',
        href: '/lists',
        linkLabel: 'Open lists',
      };
    case 'ip-warmup':
      return {
        text: 'Today’s limit for the warming-up IP addresses is used up. Schedule the campaign for tomorrow with “Schedule for later”.',
      };
    case 'blacklist':
      return {
        text:
          `Your sending IP addresses are on a blacklist. Delisting cannot be done in the app — ` +
          `email support at ${SUPPORT_EMAIL}; until the IPs are delisted, messages will not be delivered.`,
      };
    default:
      return {
        text: 'Fix the campaign using the details above.',
        href: edit,
        linkLabel: 'Edit campaign',
      };
  }
}

export interface GroupedChecks {
  blocking: Check[];
  warnings: Check[];
  info: Check[];
  passed: Check[];
}

export function groupChecks(checks: Check[]): GroupedChecks {
  return {
    blocking: checks.filter((c) => c.severity === 'fail'),
    warnings: checks.filter((c) => c.severity === 'warn'),
    info: checks.filter((c) => c.severity === 'info'),
    passed: checks.filter((c) => c.severity === 'pass'),
  };
}

export const VERDICT_TEXT: Record<Verdict, string> = {
  go: 'The campaign is ready to send.',
  caution: 'The campaign can be sent, but it has warnings.',
  'no-go': 'The campaign cannot be sent as it is.',
};

/**
 * The body a confirmation sends. The acknowledgement is added only when it
 * was ticked — and never as `false`: an absent field is the server's default.
 */
export function confirmBody(
  base: Record<string, unknown> | undefined,
  acknowledged: boolean,
): Record<string, unknown> | undefined {
  if (!acknowledged) return base;
  return { ...(base ?? {}), [ACKNOWLEDGE_FIELD]: true };
}

/** Whether the confirm button may be pressed. */
export function canConfirm(verdict: Verdict, acknowledged: boolean): boolean {
  return verdict !== 'no-go' || acknowledged;
}

export interface ApiFailure {
  status: number;
  code?: string;
  message: string;
  /** Present when the gate refused: each blocking criterion with its numbers. */
  blocking?: RefusedCriterion[];
}

/** Read an error response whole — never a truncated slice of it. */
export function readFailure(status: number, text: string): ApiFailure {
  try {
    const body = JSON.parse(text) as {
      code?: string;
      message?: string;
      details?: { blocking?: RefusedCriterion[] };
    };
    return {
      status,
      code: body.code,
      message: body.message ?? text,
      ...(body.code === 'DELIVERABILITY_NO_GO' && Array.isArray(body.details?.blocking)
        ? { blocking: body.details!.blocking }
        : {}),
    };
  } catch {
    return { status, message: text || `HTTP ${status}` };
  }
}
