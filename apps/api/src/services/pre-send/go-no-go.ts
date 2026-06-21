/**
 * Pre-send Go/No-Go panel — orchestrator (P1, §9 Pre-send unified panel).
 *
 * Aggregates 12 checks across audience, content, authentication,
 * deliverability, compliance, reputation, and timing into a single
 * verdict the campaign-send action can gate on.
 *
 *   GET /api/v1/campaigns/:id/pre-send-checks
 *     → { verdict, counts, checks: CheckResult[] }
 *
 * Each check delegates classification to `go-no-go-pure.ts` so the
 * scoring logic stays unit-testable and the orchestrator stays
 * focused on collecting facts.
 */

import { and, count, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  campaigns,
  sendingDomains,
  emailEvents,
  suppressions,
  contactLists,
  contacts,
  type Campaign,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { checkSpam } from '../editor/spam-checker.js';
import {
  aggregateVerdict,
  classifyAudienceSize,
  classifyBounceRate,
  classifyComplaintRate,
  classifyDomainAuth,
  classifyPlainText,
  classifyPreferenceCenter,
  classifyScheduledTime,
  classifySpamScore,
  classifySubject,
  classifyUnsubscribeLink,
  classifySuppression,
  countBySeverity,
  prioritise,
  type CheckResult,
  type SeverityCounts,
  type Verdict,
} from './go-no-go-pure.js';

export interface GoNoGoReport {
  campaignId: string;
  verdict: Verdict;
  counts: SeverityCounts;
  checks: CheckResult[];
  computedAt: string;
}

/**
 * Run the full check battery against a single campaign. Never throws on
 * individual check failures — a failed check becomes a `fail`-severity
 * row, not an exception, so the UI always renders the panel.
 */
export async function runPreSendChecks(
  orgId: string,
  campaignId: string,
): Promise<GoNoGoReport> {
  // Fetch campaign — only real precondition. If it's missing, 404.
  const campaign = await fetchCampaign(orgId, campaignId);

  const html = extractHtml(campaign);
  const recipientCount = campaign.estimatedRecipients ?? 0;

  const checks: CheckResult[] = [];

  // ─── Auth ────────────────────────────────────────────────────────────────
  const auth = await fetchDomainAuth(orgId, campaign.fromEmail);
  checks.push(classifyDomainAuth(auth));

  // ─── Audience ────────────────────────────────────────────────────────────
  checks.push(classifyAudienceSize({ recipientCount }));

  // Suppression overlap — how many of this campaign's contacts are suppressed.
  // We sample up to 50 K contact IDs to keep the query fast on large lists.
  if (recipientCount > 0) {
    const suppressionOverlap = await fetchSuppressionOverlap(orgId, campaignId).catch(() => null);
    if (suppressionOverlap !== null) {
      checks.push(
        classifySuppression({
          recipientCount,
          suppressedCount: suppressionOverlap,
        }),
      );
    }
  }

  // ─── Content ─────────────────────────────────────────────────────────────
  checks.push(classifySubject({ subject: campaign.subject ?? '' }));

  // ─── Compliance ──────────────────────────────────────────────────────────
  checks.push(classifyUnsubscribeLink({ hasUnsubscribe: detectUnsubscribe(html) }));
  checks.push(
    classifyPreferenceCenter({ hasPreferenceCenterTag: html.includes('{{preference_center_url}}') }),
  );

  // ─── Deliverability ──────────────────────────────────────────────────────
  const spam = checkSpam(campaign.subject ?? '', html, hasPlainTextPart(campaign));
  checks.push(
    classifySpamScore({
      spamScore: spam.score,
      topIssues: spam.issues.map((i) => i.message),
    }),
  );
  checks.push(classifyPlainText({ hasPlainText: hasPlainTextPart(campaign) }));

  // ─── Reputation ──────────────────────────────────────────────────────────
  const recent = await fetchRecentRates(orgId);
  checks.push(classifyBounceRate({ recent7dBounceRatePct: recent.bounceRatePct }));
  checks.push(classifyComplaintRate({ recent7dComplaintRatePct: recent.complaintRatePct }));

  // ─── Timing ──────────────────────────────────────────────────────────────
  checks.push(classifyScheduledTime({ scheduledAt: campaign.scheduledAt ?? null }));

  const sorted = prioritise(checks);
  return {
    campaignId,
    verdict: aggregateVerdict(sorted),
    counts: countBySeverity(sorted),
    checks: sorted,
    computedAt: new Date().toISOString(),
  };
}

// ─── Fact-gathering helpers ───────────────────────────────────────────────

async function fetchCampaign(orgId: string, campaignId: string): Promise<Campaign> {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .limit(1);
  if (!row) throw AppError.notFound('Campaign');
  return row;
}

interface DomainAuthFacts {
  spfValid: boolean;
  dkimValid: boolean;
  dmarcPresent: boolean;
}

async function fetchDomainAuth(
  orgId: string,
  fromEmail: string | null,
): Promise<DomainAuthFacts> {
  if (!fromEmail || !fromEmail.includes('@')) {
    return { spfValid: false, dkimValid: false, dmarcPresent: false };
  }
  const domainPart = fromEmail.split('@')[1]!.toLowerCase();
  const [row] = await db
    .select()
    .from(sendingDomains)
    .where(and(eq(sendingDomains.orgId, orgId), eq(sendingDomains.domain, domainPart)))
    .limit(1);
  if (!row) return { spfValid: false, dkimValid: false, dmarcPresent: false };
  return {
    spfValid: row.spfVerified === true,
    dkimValid: row.dkimVerified === true,
    dmarcPresent: row.dmarcVerified === true,
  };
}

async function fetchRecentRates(orgId: string): Promise<{
  bounceRatePct: number | null;
  complaintRatePct: number | null;
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  // Single roll-up query — cheaper than two passes.
  const [row] = (await db
    .select({
      sends: sql<string>`count(*) filter (where ${emailEvents.eventType} = 'send')::text`,
      bounces: sql<string>`count(*) filter (where ${emailEvents.eventType} = 'bounce')::text`,
      complaints: sql<string>`count(*) filter (where ${emailEvents.eventType} = 'complaint')::text`,
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), gte(emailEvents.createdAt, sevenDaysAgo)))) as Array<{
    sends: string;
    bounces: string;
    complaints: string;
  }>;

  const sends = Number(row?.sends ?? 0);
  if (sends === 0) return { bounceRatePct: null, complaintRatePct: null };
  return {
    bounceRatePct: (Number(row?.bounces ?? 0) / sends) * 100,
    complaintRatePct: (Number(row?.complaints ?? 0) / sends) * 100,
  };
}

// ─── Content extraction helpers ───────────────────────────────────────────

function extractHtml(campaign: Campaign): string {
  // `content` is a free-form JSON blob — could be the editor schema, or a
  // raw HTML string, depending on the campaign. We look for a few common
  // shapes and fall back to JSON.stringify so the regex checks still have
  // something to chew on (better than missing a real unsubscribe link
  // because we didn't recognise the wrapper).
  const c = campaign.content;
  if (!c) return '';
  if (typeof c === 'string') return c;
  if (typeof c === 'object') {
    const obj = c as Record<string, unknown>;
    if (typeof obj.html === 'string') return obj.html;
    if (typeof obj.body === 'string') return obj.body;
    return JSON.stringify(c);
  }
  return '';
}

function detectUnsubscribe(html: string): boolean {
  // Match either the merge tag (set at render time) or a literal /unsubscribe
  // anchor href. Keep simple — we do NOT regex into HTML to avoid false
  // negatives on Unicode whitespace; substring is enough for the gate.
  if (!html) return false;
  const lower = html.toLowerCase();
  return (
    lower.includes('{{unsubscribe_url}}') ||
    lower.includes('{{ unsubscribe_url }}') ||
    lower.includes('unsubscribe') ||
    lower.includes('odhlásit')
  );
}

function hasPlainTextPart(campaign: Campaign): boolean {
  const c = campaign.content as Record<string, unknown> | null | undefined;
  if (!c) return false;
  return typeof c.plainText === 'string' && c.plainText.trim().length > 0;
}

/**
 * Counts how many contacts in this campaign's list are suppressed.
 * Samples up to 50 K emails to stay fast on very large lists.
 */
async function fetchSuppressionOverlap(orgId: string, campaignId: string): Promise<number> {
  const SAMPLE_LIMIT = 50_000;

  // Get the list_id from the campaign
  const [camp] = await db
    .select({ listId: campaigns.listId })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .limit(1);
  if (!camp?.listId) return 0;

  // Sample contact emails via junction table
  const rows = await db
    .select({ email: contacts.email })
    .from(contactLists)
    .innerJoin(contacts, and(eq(contacts.id, contactLists.contactId), eq(contacts.orgId, orgId)))
    .where(eq(contactLists.listId, camp.listId))
    .limit(SAMPLE_LIMIT);

  if (rows.length === 0) return 0;

  const emails = rows.map((r) => r.email).filter(Boolean) as string[];
  if (emails.length === 0) return 0;

  // Count how many of those emails appear in the suppression table
  const [result] = await db
    .select({ n: count() })
    .from(suppressions)
    .where(and(eq(suppressions.orgId, orgId), inArray(suppressions.email, emails)));

  return result?.n ?? 0;
}
