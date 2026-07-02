/**
 * Custom report builder — pure aggregation engine.
 *
 * Turns a stream of email events + a report definition (metrics × dimension)
 * into grouped rows + totals. No DB, no dates-of-today: fully deterministic and
 * unit-testable. The DB-pulling wrapper lives in index.ts.
 *
 * Rate metrics use the newsletter-analytics conventions:
 *   open_rate           = unique_opens  / delivered
 *   click_rate          = unique_clicks / delivered
 *   click_to_open_rate  = unique_clicks / unique_opens
 *   bounce_rate         = bounces       / sends
 *   unsubscribe_rate    = unsubscribes  / delivered
 *   complaint_rate      = complaints    / delivered
 * A rate with a zero denominator is 0. Rates are fractions (0..1) rounded 4dp.
 */

export type ReportEventType =
  | 'send'
  | 'deliver'
  | 'open'
  | 'click'
  | 'bounce'
  | 'unsubscribe'
  | 'complaint';

export type ReportMetric =
  | 'sends'
  | 'delivered'
  | 'opens'
  | 'clicks'
  | 'unique_opens'
  | 'unique_clicks'
  | 'bounces'
  | 'unsubscribes'
  | 'complaints'
  | 'open_rate'
  | 'click_rate'
  | 'click_to_open_rate'
  | 'bounce_rate'
  | 'unsubscribe_rate'
  | 'complaint_rate';

export type ReportDimension = 'none' | 'day' | 'week' | 'month' | 'campaign';

export const REPORT_METRICS: ReportMetric[] = [
  'sends',
  'delivered',
  'opens',
  'clicks',
  'unique_opens',
  'unique_clicks',
  'bounces',
  'unsubscribes',
  'complaints',
  'open_rate',
  'click_rate',
  'click_to_open_rate',
  'bounce_rate',
  'unsubscribe_rate',
  'complaint_rate',
];

export const REPORT_DIMENSIONS: ReportDimension[] = ['none', 'day', 'week', 'month', 'campaign'];

export interface ReportEvent {
  eventType: ReportEventType;
  createdAt: Date;
  campaignId?: string | null;
  contactId?: string | null;
}

export interface ReportDefinition {
  metrics: ReportMetric[];
  dimension: ReportDimension;
}

export interface ReportRow {
  group: string;
  values: Record<string, number>;
}

export interface ReportResult {
  rows: ReportRow[];
  totals: Record<string, number>;
}

interface Tally {
  sends: number;
  delivered: number;
  opens: number;
  clicks: number;
  bounces: number;
  unsubscribes: number;
  complaints: number;
  openContacts: Set<string>;
  clickContacts: Set<string>;
}

function newTally(): Tally {
  return {
    sends: 0,
    delivered: 0,
    opens: 0,
    clicks: 0,
    bounces: 0,
    unsubscribes: 0,
    complaints: 0,
    openContacts: new Set(),
    clickContacts: new Set(),
  };
}

function add(t: Tally, ev: ReportEvent): void {
  switch (ev.eventType) {
    case 'send':
      t.sends++;
      break;
    case 'deliver':
      t.delivered++;
      break;
    case 'open':
      t.opens++;
      if (ev.contactId) t.openContacts.add(ev.contactId);
      break;
    case 'click':
      t.clicks++;
      if (ev.contactId) t.clickContacts.add(ev.contactId);
      break;
    case 'bounce':
      t.bounces++;
      break;
    case 'unsubscribe':
      t.unsubscribes++;
      break;
    case 'complaint':
      t.complaints++;
      break;
  }
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

function metricValue(t: Tally, metric: ReportMetric): number {
  const uniqueOpens = t.openContacts.size;
  const uniqueClicks = t.clickContacts.size;
  switch (metric) {
    case 'sends':
      return t.sends;
    case 'delivered':
      return t.delivered;
    case 'opens':
      return t.opens;
    case 'clicks':
      return t.clicks;
    case 'unique_opens':
      return uniqueOpens;
    case 'unique_clicks':
      return uniqueClicks;
    case 'bounces':
      return t.bounces;
    case 'unsubscribes':
      return t.unsubscribes;
    case 'complaints':
      return t.complaints;
    case 'open_rate':
      return rate(uniqueOpens, t.delivered);
    case 'click_rate':
      return rate(uniqueClicks, t.delivered);
    case 'click_to_open_rate':
      return rate(uniqueClicks, uniqueOpens);
    case 'bounce_rate':
      return rate(t.bounces, t.sends);
    case 'unsubscribe_rate':
      return rate(t.unsubscribes, t.delivered);
    case 'complaint_rate':
      return rate(t.complaints, t.delivered);
  }
}

/** ISO date (UTC) of the Monday of the event's week. */
function weekBucket(d: Date): string {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = utc.getUTCDay(); // 0=Sun..6=Sat
  const diff = (dow + 6) % 7; // days since Monday
  utc.setUTCDate(utc.getUTCDate() - diff);
  return utc.toISOString().slice(0, 10);
}

function bucketOf(ev: ReportEvent, dim: ReportDimension): string {
  switch (dim) {
    case 'none':
      return 'all';
    case 'day':
      return ev.createdAt.toISOString().slice(0, 10);
    case 'week':
      return weekBucket(ev.createdAt);
    case 'month':
      return ev.createdAt.toISOString().slice(0, 7);
    case 'campaign':
      return ev.campaignId ?? 'none';
  }
}

function buildValues(t: Tally, metrics: ReportMetric[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of metrics) out[m] = metricValue(t, m);
  return out;
}

/**
 * Aggregate events into report rows (one per dimension bucket) + overall totals.
 * Rows are sorted by group key ascending. Rate totals are computed over ALL
 * events — NOT averaged across rows (which would be statistically wrong).
 */
export function computeReport(events: ReportEvent[], def: ReportDefinition): ReportResult {
  const metrics = def.metrics.length > 0 ? def.metrics : REPORT_METRICS;
  const groups = new Map<string, Tally>();
  const overall = newTally();

  for (const ev of events) {
    add(overall, ev);
    const key = bucketOf(ev, def.dimension);
    let t = groups.get(key);
    if (!t) {
      t = newTally();
      groups.set(key, t);
    }
    add(t, ev);
  }

  const rows: ReportRow[] = [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([group, t]) => ({ group, values: buildValues(t, metrics) }));

  return { rows, totals: buildValues(overall, metrics) };
}
