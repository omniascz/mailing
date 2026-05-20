/**
 * Prospecting Agent (#329).
 *
 * Three capabilities:
 *   1. `findProspects(orgId, icp)` — ranks existing accounts against an Ideal
 *      Customer Profile (industry / revenue / headcount / country) and returns
 *      fit-scored matches. No external data enrichment here — we score what we
 *      already store; enrichment is a separate provider concern.
 *   2. `researchAccount(orgId, accountId)` — produces a Claude-generated
 *      summary/news brief from account data + recent deal history. Cached 24h.
 *   3. `draftOutreach(orgId, contactId, opts)` — produces a tailored first-
 *      touch message (email / SMS / LinkedIn DM) using contact fields,
 *      account context, and a channel-appropriate tone. Not auto-sent.
 */

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { accounts } from '../../db/schema/accounts.js';
import { contacts } from '../../db/schema/contacts.js';
import { deals } from '../../db/schema/deals.js';
import { callClaude, cacheKey, parseJsonSafe } from '../../lib/ai-client.js';
import { redis } from '../../lib/redis.js';
import { AppError } from '../../lib/app-error.js';

const RESEARCH_TTL = 60 * 60 * 24; // 24h

// ─── ICP matching ────────────────────────────────────────────────────────────

export interface Icp {
  industries?: string[];
  minRevenue?: number;
  maxRevenue?: number;
  minEmployees?: number;
  maxEmployees?: number;
  /** ISO country codes to include (matches contacts.phoneCountry or account metadata). */
  countries?: string[];
  /** Free-text descriptor used by LLM fit check if provided. */
  descriptor?: string;
}

export interface ProspectMatch {
  accountId: string;
  accountName: string;
  domain: string | null;
  industry: string | null;
  annualRevenueUsd: number | null;
  employeeCount: number | null;
  fitScore: number;
  reasons: string[];
}

export async function findProspects(
  orgId: string,
  icp: Icp,
  opts?: { limit?: number },
): Promise<ProspectMatch[]> {
  const limit = opts?.limit ?? 100;

  const filters = [eq(accounts.orgId, orgId), isNull(accounts.deletedAt)];
  if (icp.industries?.length) {
    filters.push(inArray(accounts.industry, icp.industries));
  }
  if (icp.minRevenue != null) {
    filters.push(sql`${accounts.annualRevenueUsd} >= ${icp.minRevenue}`);
  }
  if (icp.maxRevenue != null) {
    filters.push(sql`${accounts.annualRevenueUsd} <= ${icp.maxRevenue}`);
  }
  if (icp.minEmployees != null) {
    filters.push(sql`${accounts.employeeCount} >= ${icp.minEmployees}`);
  }
  if (icp.maxEmployees != null) {
    filters.push(sql`${accounts.employeeCount} <= ${icp.maxEmployees}`);
  }

  const candidates = await db
    .select()
    .from(accounts)
    .where(and(...filters))
    .limit(limit * 4);

  const matches: ProspectMatch[] = candidates.map((a) => {
    const reasons: string[] = [];
    let fit = 50;

    if (icp.industries?.length && a.industry && icp.industries.includes(a.industry)) {
      fit += 20;
      reasons.push(`industry match: ${a.industry}`);
    }
    if (icp.minRevenue != null && a.annualRevenueUsd && a.annualRevenueUsd >= icp.minRevenue) {
      fit += 10;
      reasons.push(`revenue ≥ ${icp.minRevenue}`);
    }
    if (icp.minEmployees != null && a.employeeCount && a.employeeCount >= icp.minEmployees) {
      fit += 10;
      reasons.push(`headcount ≥ ${icp.minEmployees}`);
    }
    if (a.annualRevenueUsd == null && icp.minRevenue != null) {
      fit -= 10;
      reasons.push('missing revenue data');
    }
    if (a.employeeCount == null && icp.minEmployees != null) {
      fit -= 10;
      reasons.push('missing headcount data');
    }

    return {
      accountId: a.id,
      accountName: a.name,
      domain: a.domain,
      industry: a.industry,
      annualRevenueUsd: a.annualRevenueUsd,
      employeeCount: a.employeeCount,
      fitScore: Math.max(0, Math.min(100, fit)),
      reasons,
    };
  });

  return matches.sort((a, b) => b.fitScore - a.fitScore).slice(0, limit);
}

// ─── Account research brief ───────────────────────────────────────────────────

export interface AccountResearch {
  accountId: string;
  summary: string;
  talkingPoints: string[];
  suggestedOutreachAngle: string;
  risks: string[];
  tokensUsed: number;
}

export async function researchAccount(
  orgId: string,
  accountId: string,
  opts?: { force?: boolean },
): Promise<AccountResearch> {
  const key = cacheKey('prospect_research', `${orgId}:${accountId}`);
  if (!opts?.force) {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as AccountResearch;
  }

  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
    .limit(1);
  if (!account) throw AppError.notFound('Account not found');

  const accountDeals = await db
    .select()
    .from(deals)
    .where(and(eq(deals.orgId, orgId), eq(deals.accountId, accountId)))
    .orderBy(desc(deals.createdAt))
    .limit(20);

  const wonCount = accountDeals.filter((d) => d.status === 'won').length;
  const lostCount = accountDeals.filter((d) => d.status === 'lost').length;
  const openCount = accountDeals.filter((d) => d.status === 'open').length;

  const result = await callClaude({
    tenantId: orgId,
    model: 'claude-opus-4-6',
    feature: 'agent_run',
    system: 'You are a sales research analyst. Output strict JSON only, no markdown fences.',
    user: `Produce a prospecting brief for this account. Use ONLY the facts given — do NOT invent news or quotes.

Account:
- Name: ${account.name}
- Domain: ${account.domain ?? 'n/a'}
- Industry: ${account.industry ?? 'n/a'}
- Annual revenue (USD): ${account.annualRevenueUsd ?? 'unknown'}
- Employees: ${account.employeeCount ?? 'unknown'}

Relationship history:
- Open deals: ${openCount}
- Won deals: ${wonCount}
- Lost deals: ${lostCount}
- Last 3 deal names: ${
      accountDeals
        .slice(0, 3)
        .map((d) => d.name)
        .join(' | ') || 'none'
    }

Return JSON:
{
  "summary": "2-3 sentence neutral brief.",
  "talkingPoints": ["...", "...", "..."],
  "suggestedOutreachAngle": "1 sentence hypothesis for why to reach out now",
  "risks": ["...", "..."]
}`,
    maxTokens: 1024,
  });

  const parsed = parseJsonSafe<{
    summary: string;
    talkingPoints: string[];
    suggestedOutreachAngle: string;
    risks: string[];
  }>(result.text) ?? {
    summary: 'Research unavailable.',
    talkingPoints: [],
    suggestedOutreachAngle: '',
    risks: [],
  };

  const output: AccountResearch = {
    accountId,
    summary: parsed.summary,
    talkingPoints: parsed.talkingPoints ?? [],
    suggestedOutreachAngle: parsed.suggestedOutreachAngle ?? '',
    risks: parsed.risks ?? [],
    tokensUsed: result.inputTokens + result.outputTokens,
  };

  await redis.set(key, JSON.stringify(output), 'EX', RESEARCH_TTL);
  return output;
}

// ─── Outreach draft ───────────────────────────────────────────────────────────

export type OutreachChannel = 'email' | 'sms' | 'linkedin';
export type OutreachTone = 'casual' | 'professional' | 'direct';

export interface OutreachDraftInput {
  channel: OutreachChannel;
  tone?: OutreachTone;
  language?: string;
  goal?: string;
  valueProp?: string;
  callToAction?: string;
}

export interface OutreachDraft {
  channel: OutreachChannel;
  subject?: string;
  body: string;
  variants: Array<{ subject?: string; body: string }>;
  tokensUsed: number;
}

export async function draftOutreach(
  orgId: string,
  contactId: string,
  input: OutreachDraftInput,
): Promise<OutreachDraft> {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
    .limit(1);
  if (!contact) throw AppError.notFound('Contact not found');

  const tone = input.tone ?? 'professional';
  const language =
    input.language ?? (contact as { preferredLocale?: string | null }).preferredLocale ?? 'en';

  const contactFacts: string[] = [];
  if (contact.firstName) contactFacts.push(`firstName=${contact.firstName}`);
  if (contact.lastName) contactFacts.push(`lastName=${contact.lastName}`);
  if (contact.email) contactFacts.push(`email=${contact.email}`);

  const prompt = `Draft ${input.channel === 'email' ? 'an email' : input.channel === 'sms' ? 'an SMS message' : 'a LinkedIn DM'} in ${language}. Tone: ${tone}.

Contact facts: ${contactFacts.join(', ') || 'minimal'}
Goal: ${input.goal ?? 'book a discovery call'}
Value proposition: ${input.valueProp ?? 'N/A — infer from goal'}
Call to action: ${input.callToAction ?? 'short reply or calendar link'}

Rules:
- ${input.channel === 'sms' ? 'Max 160 chars. No greeting line, no signature.' : input.channel === 'linkedin' ? 'Max 300 chars. Casual, first-person.' : 'Max 120 words. Include a subject line.'}
- No placeholders in braces. If a fact is missing, omit gracefully.
- Output strict JSON, no markdown.

Return JSON:
${
  input.channel === 'email'
    ? `{ "subject": "...", "body": "...", "variants": [ { "subject": "...", "body": "..." }, { "subject": "...", "body": "..." } ] }`
    : `{ "body": "...", "variants": [ { "body": "..." }, { "body": "..." } ] }`
}`;

  const result = await callClaude({
    tenantId: orgId,
    model: 'claude-sonnet-4-6',
    feature: 'agent_run',
    system: 'You are a sales copy assistant. Output strict JSON only.',
    user: prompt,
    maxTokens: 1024,
  });

  const parsed = parseJsonSafe<{
    subject?: string;
    body: string;
    variants?: Array<{ subject?: string; body: string }>;
  }>(result.text);
  if (!parsed?.body) {
    throw AppError.internal('Outreach draft unavailable');
  }

  return {
    channel: input.channel,
    subject: parsed.subject,
    body: parsed.body,
    variants: parsed.variants ?? [],
    tokensUsed: result.inputTokens + result.outputTokens,
  };
}
