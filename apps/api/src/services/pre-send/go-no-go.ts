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

import { and, countDistinct, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  campaigns,
  sendingDomains,
  emailEvents,
  suppressions,
  contactLists,
  contacts,
  dedicatedIps,
  type Campaign,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { checkSpam } from '../editor/spam-checker.js';
import { validateOrgContent } from '../editor/merge-tag-validation.js';
import {
  aggregateVerdict,
  classifyAudienceSize,
  classifyBounceRate,
  classifyComplaintRate,
  classifyDomainAuth,
  classifyFrequencyCap,
  classifyPlainText,
  classifyPreferenceCenter,
  classifyScheduledTime,
  classifySpamScore,
  classifySubject,
  classifyMergeTags,
  classifyUnsubscribeLink,
  classifySuppression,
  classifyWarmupCapacity,
  countBySeverity,
  prioritise,
  computeScore,
  classifyBlacklist,
  type CheckResult,
  type SeverityCounts,
  type Verdict,
  type DeliverabilityGrade,
} from './go-no-go-pure.js';
import { checkFrequencyCap } from '../frequency-capping/index.js';
import { deliveryDenominators, MIN_OUTCOME_SAMPLE } from '../deliverability/pure.js';
import { countAudience } from '../campaigns/auto-resend.js';
import { renderEmail as renderBlocks } from '@forgemsg/editor/render';
import { readCampaignContent } from '@forgemsg/editor/schema';
import { listWarmupStatuses } from '../sending/ip-warmup.js';

export interface GoNoGoReport {
  campaignId: string;
  verdict: Verdict;
  /** Numeric deliverability score 0-100 (100 = perfect). */
  score: number;
  /** Letter grade derived from score: A ≥90, B ≥75, C ≥60, D ≥40, F <40. */
  grade: DeliverabilityGrade;
  counts: SeverityCounts;
  checks: CheckResult[];
  computedAt: string;
}

/**
 * Run the full check battery against a single campaign. Never throws on
 * individual check failures — a failed check becomes a `fail`-severity
 * row, not an exception, so the UI always renders the panel.
 */
export async function runPreSendChecks(orgId: string, campaignId: string): Promise<GoNoGoReport> {
  // Fetch campaign — only real precondition. If it's missing, 404.
  const campaign = await fetchCampaign(orgId, campaignId);

  const html = extractHtml(campaign);
  // The audience the splitter would resolve, counted now. Not
  // campaigns.estimated_recipients: nothing writes that column, so it read 0
  // and 'audience-empty' failed every campaign there is.
  const recipientCount = await countAudience(orgId, campaignId);

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

  // Frequency cap — sample up to 200 contacts and extrapolate how many would
  // be silently skipped due to frequency rules.
  if (recipientCount > 0) {
    const cappedCount = await fetchFrequencyCappedCount(orgId, campaignId, recipientCount).catch(
      () => null,
    );
    if (cappedCount !== null) {
      checks.push(classifyFrequencyCap({ recipientCount, cappedCount }));
    }
  }

  // ─── Content ─────────────────────────────────────────────────────────────
  checks.push(classifySubject({ subject: campaign.subject ?? '' }));

  // ─── Compliance ──────────────────────────────────────────────────────────
  checks.push(
    classifyUnsubscribeLink({ hasUnsubscribe: detectUnsubscribe(renderedHtml(campaign)) }),
  );
  checks.push(
    classifyPreferenceCenter({
      hasPreferenceCenterTag: html.includes('{{preference_center_url}}'),
    }),
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

  // 15th check — merge tags that will render empty. Validated against the same
  // expanded context the renderer builds, so this cannot disagree with what
  // the send actually produces.
  checks.push(
    classifyMergeTags({
      warnings: await validateOrgContent(orgId, [campaign.subject, campaign.preheader, html]),
    }),
  );

  // IP warmup — sum remainingToday across all non-warm IPs. If the pool is
  // fully warm (-1 = unlimited), pass. Only emitted when org has tracked IPs.
  const warmupStatuses = await listWarmupStatuses(orgId).catch(() => []);
  if (warmupStatuses.length > 0) {
    const allWarm = warmupStatuses.every((s) => s.isWarm);
    const totalDailyCapacity = allWarm
      ? -1
      : warmupStatuses.filter((s) => !s.isWarm).reduce((sum, s) => sum + s.remainingToday, 0);
    checks.push(classifyWarmupCapacity({ totalDailyCapacity, recipientCount }));
  }

  // ─── Reputation ──────────────────────────────────────────────────────────
  // Each rate carries the sample it was computed over; below the auto-pause's
  // minimum it is reported and does not count towards the verdict.
  const recent = await fetchRecentRates(orgId);
  checks.push(
    classifyBounceRate({
      recent7dBounceRatePct: recent.bounceRatePct,
      sampleSize: recent.attempted7d,
      minSample: MIN_OUTCOME_SAMPLE,
    }),
  );
  checks.push(
    classifyComplaintRate({
      recent7dComplaintRatePct: recent.complaintRatePct,
      recent24hComplaintRatePct: recent.complaint24hRatePct,
      sample7d: recent.delivered7d,
      sample24h: recent.delivered24h,
      minSample: MIN_OUTCOME_SAMPLE,
    }),
  );

  // ─── Timing ──────────────────────────────────────────────────────────────
  checks.push(classifyScheduledTime({ scheduledAt: campaign.scheduledAt ?? null }));

  // ─── Blacklist ───────────────────────────────────────────────────────────
  const blRows = await db
    .select({ blacklistCount: dedicatedIps.blacklistCount })
    .from(dedicatedIps)
    .where(
      and(eq(dedicatedIps.orgId, orgId), sql`${dedicatedIps.status} IN ('active', 'warming')`),
    );
  const totalIps = blRows.length;
  const listedIps = blRows.filter((r) => (r.blacklistCount ?? 0) > 0).length;
  checks.push(classifyBlacklist({ blacklistCount: listedIps, totalIps }));

  const sorted = prioritise(checks);
  const { score, grade } = computeScore(sorted);
  return {
    campaignId,
    verdict: aggregateVerdict(sorted),
    score,
    grade,
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

async function fetchDomainAuth(orgId: string, fromEmail: string | null): Promise<DomainAuthFacts> {
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
  complaint24hRatePct: number | null;
  /** Delivery outcomes (delivered + bounced) in the last 7 days. */
  attempted7d: number;
  delivered7d: number;
  delivered24h: number;
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  const oneDayAgo = new Date(Date.now() - 86_400_000);

  // Interpolated as an ISO string with an explicit cast, not as a Date. A raw
  // sql`` fragment bypasses the column's type mapper, so the driver received a
  // Date it could not encode and the whole endpoint answered 500 — every
  // pre-send panel request, not an edge case. Found by the first integration
  // test to call this route.
  const oneDayAgoSql = sql`${oneDayAgo.toISOString()}::timestamptz`;

  // Two windows in one query using conditional counts — cheaper than two passes.
  //
  // The rates are fractions of delivery outcomes ('deliver' and 'bounce' rows,
  // see deliveryDenominators), not of 'send' rows. A 'send' row is a billing
  // record: mta-sender writes none for a campaign message that bounced, and
  // nothing writes one for a password reset. Divided by it, one bounce and one
  // delivery in a campaign read 100 %, and an org sending only resets had no
  // history at any bounce rate.
  const [row] = (await db
    .select({
      delivered7d: sql<string>`count(*) filter (where ${emailEvents.eventType} = 'deliver')::text`,
      bounces7d: sql<string>`count(*) filter (where ${emailEvents.eventType} = 'bounce')::text`,
      complaints7d: sql<string>`count(*) filter (where ${emailEvents.eventType} = 'complaint')::text`,
      delivered24h: sql<string>`count(*) filter (where ${emailEvents.eventType} = 'deliver' AND ${emailEvents.createdAt} >= ${oneDayAgoSql})::text`,
      complaints24h: sql<string>`count(*) filter (where ${emailEvents.eventType} = 'complaint' AND ${emailEvents.createdAt} >= ${oneDayAgoSql})::text`,
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), gte(emailEvents.createdAt, sevenDaysAgo)))) as Array<{
    delivered7d: string;
    bounces7d: string;
    complaints7d: string;
    delivered24h: string;
    complaints24h: string;
  }>;

  const bounces7d = Number(row?.bounces7d ?? 0);
  const week = deliveryDenominators({
    delivered: Number(row?.delivered7d ?? 0),
    bounces: bounces7d,
  });
  const delivered24h = deliveryDenominators({
    delivered: Number(row?.delivered24h ?? 0),
    bounces: 0,
  }).delivered;

  // No outcome in the window is no history, reported as null — never a block.
  // A thin window is judged by the classifiers against MIN_OUTCOME_SAMPLE.
  return {
    bounceRatePct: week.attempted > 0 ? (bounces7d / week.attempted) * 100 : null,
    complaintRatePct:
      week.delivered > 0 ? (Number(row?.complaints7d ?? 0) / week.delivered) * 100 : null,
    complaint24hRatePct:
      delivered24h >= MIN_OUTCOME_SAMPLE
        ? (Number(row?.complaints24h ?? 0) / delivered24h) * 100
        : null,
    attempted7d: week.attempted,
    delivered7d: week.delivered,
    delivered24h,
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

/**
 * The HTML the opt-out check reads: what the send renders, not what the
 * campaign stores. Block content goes through the renderer, which attaches the
 * opt-out footer to every marketing message whether the blocks carry a link or
 * not (editor compliance-footer); checking the stored blocks reported "no
 * unsubscribe link" for mail that left with one. Raw HTML is sent as written,
 * so it is read as written. Content that is neither renders nothing — the
 * batch-sender refuses it — and reads as empty here.
 */
function renderedHtml(campaign: Campaign): string {
  const parsed = readCampaignContent(campaign.content, campaign.preheader ?? undefined);
  if (parsed.schema) {
    // No context: the opt-out renders as the {{unsubscribe_url}} merge tag.
    return renderBlocks(parsed.schema, { stream: 'broadcast' }).html;
  }
  const raw = (campaign.content as { html?: unknown } | null)?.html;
  return typeof raw === 'string' ? raw : '';
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

  // Count how many of those emails appear in the suppression table — once
  // each, as an address can hold a row per reason.
  const [result] = await db
    .select({ n: countDistinct(suppressions.email) })
    .from(suppressions)
    .where(and(eq(suppressions.orgId, orgId), inArray(suppressions.email, emails)));

  return result?.n ?? 0;
}

/**
 * Estimates how many contacts in this campaign's list would be skipped due to
 * frequency cap rules. Samples up to 200 contacts to keep pre-send checks fast.
 *
 * Uses logSuppression: false — we're only checking, not recording.
 */
async function fetchFrequencyCappedCount(
  orgId: string,
  campaignId: string,
  recipientCount: number,
): Promise<number | null> {
  const SAMPLE = 200;

  const [camp] = await db
    .select({ listId: campaigns.listId })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .limit(1);
  if (!camp?.listId) return null;

  const sampleRows = await db
    .select({ contactId: contactLists.contactId })
    .from(contactLists)
    .where(eq(contactLists.listId, camp.listId))
    .limit(SAMPLE);

  if (sampleRows.length === 0) return null;

  const results = await Promise.all(
    sampleRows.map((r) =>
      checkFrequencyCap({ orgId, contactId: r.contactId, channel: 'email', logSuppression: false }),
    ),
  );

  const cappedInSample = results.filter((r) => !r.allowed).length;

  // If we sampled fewer rows than SAMPLE, we got the full list — exact count.
  if (sampleRows.length < SAMPLE) return cappedInSample;

  // Otherwise extrapolate to full recipient count.
  return Math.round((cappedInSample / sampleRows.length) * recipientCount);
}
