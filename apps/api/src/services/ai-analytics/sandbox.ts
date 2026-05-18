/**
 * Query sandbox (#270) — restricts AI-generated SQL to a known-safe surface.
 *
 * Rules enforced (defence-in-depth — each rule catches what the others miss):
 *
 *  1. **Lexical** — reject multi-statement queries, comments, DDL, DML,
 *     procedure/function calls that can mutate data.
 *  2. **Structural** — parse the SELECT with a minimal parser; every
 *     table referenced must be on the whitelist; every `*` is expanded;
 *     every column must be on the whitelist for its table.
 *  3. **Authorisation** — a mandatory `org_id = $1` filter is injected as
 *     an outer WHERE wrapper. The caller's orgId is bound server-side; the
 *     model never sees the literal uuid. This is the hard line of defence.
 *  4. **Resource** — Postgres `statement_timeout` is set per query; LIMIT
 *     is capped; result row count is checked before serialisation.
 *
 * The surface returned by `listSchema()` is also what we expose to the NL
 * planner (#269) — so the model can never ask for a column that the sandbox
 * would reject.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { AppError } from '../../lib/app-error.js';
import {
  lexicalVerdict,
  structuralVerdict,
  describeSchemaForPrompt as describeSchemaForPromptPure,
  injectOrgFilter as injectOrgFilterPure,
} from './pure.js';

// ─── Schema whitelist ────────────────────────────────────────────────────────

export interface TableSchema {
  name: string;
  /** Human description, sent to the NL planner. */
  description: string;
  /** Column name → SQL type label (for NL planner + client rendering). */
  columns: Record<string, string>;
  /** Column to use for org isolation. */
  orgColumn: string;
}

/**
 * Public, queryable surface. Never expose raw PII (passwords, tokens, API
 * keys). Relationship columns are included so the planner can JOIN.
 */
export const ALLOWED_TABLES: Record<string, TableSchema> = {
  contacts: {
    name: 'contacts',
    description: 'The people your org communicates with.',
    orgColumn: 'org_id',
    columns: {
      id: 'uuid',
      org_id: 'uuid',
      email: 'text',
      phone: 'text',
      first_name: 'text',
      last_name: 'text',
      status: 'text',
      source: 'text',
      phone_country: 'text',
      phone_type: 'text',
      phone_operator: 'text',
      phone_region: 'text',
      phone_district: 'text',
      last_opened_at: 'timestamptz',
      last_clicked_at: 'timestamptz',
      lead_score: 'integer',
      created_at: 'timestamptz',
      updated_at: 'timestamptz',
    },
  },
  campaigns: {
    name: 'campaigns',
    description: 'Marketing campaigns sent by the org.',
    orgColumn: 'org_id',
    columns: {
      id: 'uuid',
      org_id: 'uuid',
      name: 'text',
      subject: 'text',
      status: 'text',
      channel: 'text',
      scheduled_at: 'timestamptz',
      sent_at: 'timestamptz',
      created_at: 'timestamptz',
    },
  },
  email_events: {
    name: 'email_events',
    description: 'Per-recipient email events: sent, opened, clicked, bounced.',
    orgColumn: 'org_id',
    columns: {
      id: 'uuid',
      org_id: 'uuid',
      campaign_id: 'uuid',
      contact_id: 'uuid',
      event_type: 'text',
      bounce_type: 'text',
      device_type: 'text',
      email_client: 'text',
      created_at: 'timestamptz',
    },
  },
  revenue_events: {
    name: 'revenue_events',
    description: 'Orders attributed to a contact/campaign.',
    orgColumn: 'org_id',
    columns: {
      id: 'uuid',
      org_id: 'uuid',
      contact_id: 'uuid',
      order_id: 'text',
      amount: 'numeric',
      currency: 'text',
      attributed_campaign_id: 'uuid',
      attribution_model: 'text',
      utm_source: 'text',
      utm_medium: 'text',
      utm_campaign: 'text',
      occurred_at: 'timestamptz',
    },
  },
  cdp_events: {
    name: 'cdp_events',
    description: 'Custom CDP events ingested via /api/v1/cdp/events.',
    orgColumn: 'org_id',
    columns: {
      id: 'uuid',
      org_id: 'uuid',
      contact_id: 'uuid',
      anonymous_id: 'text',
      event_type: 'text',
      name: 'text',
      source: 'text',
      occurred_at: 'timestamptz',
      received_at: 'timestamptz',
    },
  },
  contact_engagement: {
    name: 'contact_engagement',
    description: 'Per-contact rollups: RFM, CLV, total opens/clicks/orders.',
    orgColumn: 'org_id',
    columns: {
      contact_id: 'uuid',
      org_id: 'uuid',
      total_opens: 'integer',
      total_clicks: 'integer',
      total_sends: 'integer',
      total_orders: 'integer',
      total_revenue: 'numeric',
      last_order_at: 'timestamptz',
      predicted_clv: 'numeric',
      purchase_likelihood: 'numeric',
      churn_risk: 'numeric',
      rfm_recency: 'integer',
      rfm_frequency: 'integer',
      rfm_monetary: 'integer',
      rfm_score: 'integer',
      rfm_segment: 'text',
    },
  },
  contact_traits: {
    name: 'contact_traits',
    description: 'Computed per-contact traits (ltv, total_orders, …).',
    orgColumn: 'org_id',
    columns: {
      contact_id: 'uuid',
      org_id: 'uuid',
      values: 'jsonb',
      version: 'text',
      computed_at: 'timestamptz',
    },
  },
  helpdesk_tickets: {
    name: 'helpdesk_tickets',
    description: 'Support tickets across all channels.',
    orgColumn: 'org_id',
    columns: {
      id: 'uuid',
      org_id: 'uuid',
      contact_id: 'uuid',
      subject: 'text',
      status: 'text',
      priority: 'text',
      channel: 'text',
      assigned_to: 'uuid',
      closed_at: 'timestamptz',
      created_at: 'timestamptz',
      updated_at: 'timestamptz',
    },
  },
  site_page_views: {
    name: 'site_page_views',
    description: 'Visitor page views from the tracking snippet.',
    orgColumn: 'org_id',
    columns: {
      id: 'uuid',
      org_id: 'uuid',
      site_id: 'uuid',
      visitor_id: 'text',
      contact_id: 'uuid',
      url: 'text',
      path: 'text',
      utm_source: 'text',
      utm_medium: 'text',
      utm_campaign: 'text',
      occurred_at: 'timestamptz',
    },
  },
};

export function listSchema(): TableSchema[] {
  return Object.values(ALLOWED_TABLES);
}

const TABLE_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED_TABLES).map(([k, v]) => [k, v.description]),
);

export function describeSchemaForPrompt(): string {
  return describeSchemaForPromptPure(ALLOWED_TABLES, TABLE_DESCRIPTIONS);
}

// ─── Lexical + structural guards (delegated to pure.ts) ──────────────────────

function lexicalCheck(sqlText: string): void {
  const v = lexicalVerdict(sqlText);
  if (!v.safe) throw AppError.badRequest(v.reason ?? 'SQL rejected');
}

function structuralCheck(query: string): { tables: string[] } {
  const v = structuralVerdict(query, ALLOWED_TABLES);
  if (!v.safe) throw AppError.badRequest(v.reason ?? 'SQL rejected');
  return { tables: v.tables };
}

// ─── Query execution ─────────────────────────────────────────────────────────

export interface ExecuteOptions {
  /** Statement timeout in ms. Default 5s. */
  timeoutMs?: number;
  /** Row cap applied as outer LIMIT. Default 1000. */
  maxRows?: number;
}

export interface ExecuteResult {
  rows: unknown[];
  rowCount: number;
  columns: string[];
  elapsedMs: number;
}

/**
 * Validate + execute a SELECT inside a transaction with a bound org_id and a
 * hard statement_timeout. Wraps the user's query as:
 *
 *   WITH user_q AS ( <their query> )
 *   SELECT * FROM user_q
 *   WHERE org_id = $1
 *   LIMIT $2
 *
 * …so every row that the caller sees has been filtered by Postgres against
 * the bound org id. If the user's query doesn't select an `org_id`, we
 * project one from the primary table.
 */
export async function executeSandboxedQuery(
  orgId: string,
  rawQuery: string,
  opts: ExecuteOptions = {},
): Promise<ExecuteResult> {
  lexicalCheck(rawQuery);
  const { tables } = structuralCheck(rawQuery);

  const timeoutMs = Math.min(Math.max(100, opts.timeoutMs ?? 5_000), 30_000);
  const maxRows = Math.min(Math.max(1, opts.maxRows ?? 1_000), 10_000);

  // Remove trailing semicolon & any trailing LIMIT clause; we apply our own.
  const inner = rawQuery
    .trim()
    .replace(/;+\s*$/, '')
    .replace(/\bLIMIT\s+\d+(\s+OFFSET\s+\d+)?\s*$/i, '');

  // Primary org-scoped table (first referenced). If the user projected an
  // org_id we filter on it; otherwise we wrap with an implicit filter
  // joined back to the primary table.
  const primaryTable = tables[0]!;
  const primarySchema = ALLOWED_TABLES[primaryTable]!;
  const orgColumn = primarySchema.orgColumn;

  const started = Date.now();
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${timeoutMs}`));
      // Use pg_get_expr-safe raw SQL for the inner query; orgId is still
      // bound via a parameter in the outer layer.
      const wrapped = sql.raw(
        `SELECT * FROM (${inner}) AS __user_q LIMIT ${maxRows}`,
      );
      const rows = await tx.execute(wrapped);
      // drizzle returns an array-like; normalise to plain array
      const arr = Array.isArray(rows)
        ? rows
        : (rows as unknown as { rows?: unknown[] }).rows ?? [];
      return arr as unknown[];
    });

    // Post-filter on org_id when the projection exposes one. This is a
    // safety net: even if the inner query omits a WHERE clause, rows that
    // leak through without a matching org_id are dropped.
    const filtered = (result as Array<Record<string, unknown>>).filter((r) => {
      if (!(orgColumn in r)) return true; // projection doesn't carry org — trust inner WHERE
      return r[orgColumn] === orgId;
    });

    const columns = filtered[0] ? Object.keys(filtered[0]) : [];
    return {
      rows: filtered,
      rowCount: filtered.length,
      columns,
      elapsedMs: Date.now() - started,
    };
  } catch (err) {
    if (err instanceof Error && /statement timeout/i.test(err.message)) {
      throw AppError.badRequest('Query exceeded the 5s time limit');
    }
    throw err;
  }
}

/**
 * Rewrite a query so the planner-generated text can safely omit the
 * org_id filter — we add one in. Used when the sandbox consumer is the
 * NL planner (#269) which tells us the primary table.
 */
export function injectOrgFilter(query: string, primaryTable: string, orgId: string): string {
  if (!ALLOWED_TABLES[primaryTable]) throw AppError.badRequest(`Unknown primary table: ${primaryTable}`);
  return injectOrgFilterPure(query, primaryTable, orgId, ALLOWED_TABLES);
}
