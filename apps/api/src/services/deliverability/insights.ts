/**
 * Deliverability insights (#353).
 *
 * Rules engine that aggregates recent email_events for an org and emits
 * warnings + actionable suggestions. Intended to be run on a schedule (worker)
 * and also on-demand from an admin-only API endpoint.
 *
 * Rules have thresholds defined in code (not per-org) — if an org wants
 * different thresholds, the rule is muted via `ignoredRules` on the
 * organization. The goal is to flag the 80% of deliverability problems that
 * we see across the customer base, not to replicate the full mail-ops
 * playbook.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/email-events.js';

export type InsightSeverity = 'info' | 'warn' | 'critical';

export interface Insight {
  ruleId: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  metrics: Record<string, number>;
  suggestions: string[];
}

export interface InsightInput {
  orgId: string;
  windowDays?: number; // default 7
  ignoredRules?: string[];
}

interface Totals {
  send: number;
  deliver: number;
  open: number;
  click: number;
  hardBounce: number;
  softBounce: number;
  complaint: number;
  unsubscribe: number;
}

async function gatherTotals(orgId: string, sinceDays: number): Promise<Totals> {
  const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);

  const rows = await db
    .select({
      eventType: emailEvents.eventType,
      bounceType: emailEvents.bounceType,
      count: sql<number>`count(*)::int`,
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), gte(emailEvents.createdAt, since)))
    .groupBy(emailEvents.eventType, emailEvents.bounceType);

  const t: Totals = {
    send: 0, deliver: 0, open: 0, click: 0,
    hardBounce: 0, softBounce: 0, complaint: 0, unsubscribe: 0,
  };
  for (const r of rows) {
    const n = Number(r.count) || 0;
    switch (r.eventType) {
      case 'send':        t.send += n; break;
      case 'deliver':     t.deliver += n; break;
      case 'open':        t.open += n; break;
      case 'click':       t.click += n; break;
      case 'bounce':
        if (r.bounceType === 'hard') t.hardBounce += n;
        else t.softBounce += n;
        break;
      case 'complaint':   t.complaint += n; break;
      case 'unsubscribe': t.unsubscribe += n; break;
    }
  }
  return t;
}

export async function computeInsights(input: InsightInput): Promise<Insight[]> {
  const window = input.windowDays ?? 7;
  const t = await gatherTotals(input.orgId, window);
  const ignored = new Set(input.ignoredRules ?? []);
  const out: Insight[] = [];

  const sentOrDelivered = t.deliver || t.send;
  if (sentOrDelivered === 0) return out;

  const hardRate = t.hardBounce / sentOrDelivered;
  const complaintRate = t.complaint / sentOrDelivered;
  const unsubRate = t.unsubscribe / sentOrDelivered;
  const openRate = t.deliver > 0 ? t.open / t.deliver : 0;
  const clickRate = t.open > 0 ? t.click / t.open : 0;

  const rule = (
    id: string,
    cond: boolean,
    factory: () => Omit<Insight, 'ruleId'>,
  ): void => {
    if (cond && !ignored.has(id)) out.push({ ruleId: id, ...factory() });
  };

  rule('hard-bounce-rate', hardRate > 0.02, () => ({
    severity: hardRate > 0.05 ? 'critical' : 'warn',
    title: `Hard bounce rate ${(hardRate * 100).toFixed(2)}% (last ${window}d)`,
    detail: 'Hard bounces above 2% will hurt your sender reputation and may trigger ISP rate-limiting.',
    metrics: { hardRate, hardCount: t.hardBounce, sent: sentOrDelivered },
    suggestions: [
      'Enable double opt-in for new signups.',
      'Remove addresses that hard-bounced more than once.',
      'Re-check import sources for typos / scraped lists.',
    ],
  }));

  rule('complaint-rate', complaintRate > 0.001, () => ({
    severity: complaintRate > 0.005 ? 'critical' : 'warn',
    title: `Complaint rate ${(complaintRate * 100).toFixed(3)}% (last ${window}d)`,
    detail: 'Complaint rate above 0.1% is the threshold Gmail/Yahoo use to throttle senders.',
    metrics: { complaintRate, complaints: t.complaint, sent: sentOrDelivered },
    suggestions: [
      'Double-check your unsubscribe link is visible in every template.',
      'Audit recent campaigns — were recipients re-engaged or long-cold?',
      'Consider a sunset policy for contacts who haven\'t opened in 6+ months.',
    ],
  }));

  rule('unsubscribe-rate', unsubRate > 0.01, () => ({
    severity: unsubRate > 0.03 ? 'warn' : 'info',
    title: `Unsubscribe rate ${(unsubRate * 100).toFixed(2)}% (last ${window}d)`,
    detail: 'A high unsubscribe rate often correlates with irrelevant content or over-sending.',
    metrics: { unsubRate, unsubs: t.unsubscribe, sent: sentOrDelivered },
    suggestions: [
      'Reduce send frequency to once a week on average.',
      'Segment your list — send the right content to the right people.',
    ],
  }));

  rule('low-open-rate', t.deliver > 500 && openRate < 0.1, () => ({
    severity: 'warn',
    title: `Open rate ${(openRate * 100).toFixed(1)}%`,
    detail: 'Below 10% suggests inbox placement, subject lines, or list hygiene issues.',
    metrics: { openRate, opens: t.open, delivered: t.deliver },
    suggestions: [
      'Run a domain warm-up if you recently switched sending domains.',
      'A/B test subject lines — emoji, personalisation, length.',
      'Check DMARC reports for authentication failures.',
    ],
  }));

  rule('low-click-rate', t.open > 200 && clickRate < 0.02, () => ({
    severity: 'info',
    title: `Click-through rate ${(clickRate * 100).toFixed(1)}% (of opens)`,
    detail: 'People are opening but not engaging — either the CTA is unclear or the content does not match the subject line.',
    metrics: { clickRate, clicks: t.click, opens: t.open },
    suggestions: [
      'Make the primary CTA a button, not just a link.',
      'Re-read the subject line + preheader as a promise; does the body deliver on it?',
    ],
  }));

  return out;
}
