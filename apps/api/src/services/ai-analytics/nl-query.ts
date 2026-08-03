/**
 * Natural-language → analytics query (#269).
 *
 * A user asks "which campaigns last month had the best click-through rate?";
 * Claude returns a structured query plan (JSON) that the sandbox (#270)
 * validates and executes. We also return a chart suggestion.
 *
 * The planner is given a whitelisted schema description so it cannot
 * invent tables or columns; every reference goes through the sandbox.
 * The orgId filter is injected server-side after parse — the model never
 * sees it.
 */

import { callClaude, cacheKey, parseJsonSafe } from '../../lib/ai-client.js';
import { redis } from '@forgemsg/shared/redis';
import { AppError } from '../../lib/app-error.js';
import {
  describeSchemaForPrompt,
  executeSandboxedQuery,
  injectOrgFilter,
  ALLOWED_TABLES,
  type ExecuteResult,
} from './sandbox.js';

export type ChartType = 'bar' | 'line' | 'pie' | 'area' | 'table' | 'scalar';

export interface NlQueryPlan {
  /** Short one-sentence summary of what the query answers. */
  summary: string;
  /** Primary table — used to inject the org_id filter. */
  primaryTable: string;
  /** SQL SELECT (sandbox-validated). */
  sql: string;
  /** Suggested visualisation for the result set. */
  chart: {
    type: ChartType;
    /** Column name to plot on the X axis (or category for pie). */
    xColumn?: string;
    /** Column names for the Y axis (series). */
    yColumns?: string[];
    /** Human-readable title. */
    title?: string;
  };
}

export interface NlAskInput {
  /** User's natural-language question. */
  question: string;
  /** Optional hint from recent follow-up: previous plan summary. */
  previousSummary?: string;
  /** Override timeouts for slow / fast callers. */
  timeoutMs?: number;
  /** Cap on the number of rows returned to the client. */
  maxRows?: number;
}

export interface NlAskResult {
  plan: NlQueryPlan;
  result: ExecuteResult;
  cached: boolean;
}

function systemPrompt(): string {
  const schema = describeSchemaForPrompt();
  return `You are an analytics assistant for ForgeMsg, a marketing platform. Convert the user's question into a Postgres SELECT query and a chart suggestion.

SCHEMA (these are the ONLY tables and columns you may reference):

${schema}

Rules:
1. Output ONLY valid JSON (no markdown, no explanation).
2. Use standard Postgres dialect; use EXTRACT, date_trunc, COALESCE freely.
3. Do NOT write INSERT/UPDATE/DELETE/TRUNCATE/DROP/ALTER or any DDL/DML.
4. Do NOT write multi-statement queries; no semicolons inside the SQL.
5. Do NOT filter on org_id — the platform will inject the filter. You may project org_id in SELECT if it helps, but every query MUST be written as if it operated on a single org's data.
6. Prefer relative date ranges: now() - interval '30 days'.
7. Pick a chart type:
   - 'scalar' for a single number (e.g. "How many contacts do I have?").
   - 'line' / 'area' for time series (x = date bucket, y = metric).
   - 'bar' for categorical comparisons (x = category, y = metric).
   - 'pie' for share-of-whole over a small set of categories.
   - 'table' for rows that aren't obvious to chart.
8. Cap rows at 1000 (add LIMIT 1000) unless the user asks for more.
9. For "last month" / "this week" use date_trunc('month', occurred_at) = date_trunc('month', now() - interval '1 month') or similar unambiguous expressions.

Output schema:
{
  "summary": "one-sentence summary of what the query answers",
  "primaryTable": "<one of the tables above>",
  "sql": "<the SELECT query>",
  "chart": {
    "type": "bar|line|pie|area|table|scalar",
    "xColumn": "<column name from the projection, optional for 'scalar'>",
    "yColumns": ["<projected metric column(s)>"],
    "title": "short human-readable title"
  }
}`;
}

function cacheKeyFor(orgId: string, question: string, previousSummary?: string): string {
  return cacheKey('nl-query', orgId, previousSummary ?? '', question);
}

export async function plan(
  orgId: string,
  input: NlAskInput,
): Promise<{ plan: NlQueryPlan; cached: boolean }> {
  const key = cacheKeyFor(orgId, input.question, input.previousSummary);
  const cached = await redis.get(key);
  if (cached) {
    return { plan: JSON.parse(cached) as NlQueryPlan, cached: true };
  }

  const userMessage = input.previousSummary
    ? `Previous context: ${input.previousSummary}\n\nNew question: ${input.question}`
    : input.question;

  const { text } = await callClaude({
    model: 'claude-sonnet-4-6',
    system: systemPrompt(),
    user: userMessage,
    feature: 'other',
    tenantId: orgId,
    maxTokens: 1024,
    noCache: true,
  });

  let parsed: unknown;
  try {
    parsed = parseJsonSafe(text);
  } catch {
    throw AppError.badRequest('Failed to parse query plan from AI response');
  }

  const p = parsed as Partial<NlQueryPlan>;
  if (!p.sql || !p.primaryTable || !p.chart || !p.summary) {
    throw AppError.badRequest('Incomplete query plan from AI');
  }
  if (!ALLOWED_TABLES[p.primaryTable]) {
    throw AppError.badRequest(`Unknown primary table in plan: ${p.primaryTable}`);
  }

  const validated: NlQueryPlan = {
    summary: p.summary,
    primaryTable: p.primaryTable,
    sql: p.sql,
    chart: {
      type: p.chart.type ?? 'table',
      xColumn: p.chart.xColumn,
      yColumns: p.chart.yColumns,
      title: p.chart.title,
    },
  };

  // Cache the plan (cheap reuse of the Claude call) for 5 minutes.
  await redis.setex(key, 300, JSON.stringify(validated));
  return { plan: validated, cached: false };
}

export async function ask(orgId: string, input: NlAskInput): Promise<NlAskResult> {
  const { plan: p, cached } = await plan(orgId, input);
  const safeSql = injectOrgFilter(p.sql, p.primaryTable, orgId);
  const result = await executeSandboxedQuery(orgId, safeSql, {
    timeoutMs: input.timeoutMs ?? 5_000,
    maxRows: input.maxRows ?? 1_000,
  });
  return { plan: p, result, cached };
}
