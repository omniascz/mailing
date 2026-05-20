/**
 * Consolidated billing for parent-child org accounts (#275).
 *
 * The parent org (organizations.parent_org_id IS NULL) owns the Stripe subscription.
 * Child orgs inherit billing and their usage is aggregated under the parent.
 *
 * Note: organizations.parent_org_id column is added in migration 0043.
 */

import { eq, sql, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { organizations } from '../../db/schema/organizations.js';
import { billingSubscriptions } from '../../db/schema/billing.js';

import { organizationMembers } from '../../db/schema/organization-members.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChildUsageReport {
  orgId: string;
  orgName: string;
  emailsSent: number;
  emailsDelivered: number;
  aiTokensUsed: number;
  aiCostUsd: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface ConsolidatedReport {
  parentOrgId: string;
  periodStart: Date;
  periodEnd: Date;
  children: ChildUsageReport[];
  totals: {
    emailsSent: number;
    emailsDelivered: number;
    aiTokensUsed: number;
    aiCostUsd: number;
  };
}

// ─── Get child orgs ───────────────────────────────────────────────────────────

export async function getChildOrgs(
  parentOrgId: string,
): Promise<Array<{ id: string; name: string }>> {
  const children = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(
      and(eq(organizations.parentOrgId, parentOrgId), sql`${organizations.deletedAt} IS NULL`),
    );
  return children;
}

/**
 * Permission inheritance: a user who has a role on the parent org
 * implicitly has the same role on every descendant org (#273).
 *
 * Returns the effective role ('owner'|'admin'|'editor'|'viewer') or null.
 */
export async function getEffectiveRole(userId: string, orgId: string): Promise<string | null> {
  // 1. Direct membership on this org
  const direct = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.orgId, orgId),
        eq(organizationMembers.status, 'active'),
      ),
    )
    .limit(1);
  if (direct[0]) return direct[0].role;

  // 2. Walk up parent chain (max 5 hops to avoid cycles)
  let currentOrgId: string = orgId;
  for (let i = 0; i < 5; i++) {
    const parentRow: { parentOrgId: string | null }[] = await db
      .select({ parentOrgId: organizations.parentOrgId })
      .from(organizations)
      .where(eq(organizations.id, currentOrgId))
      .limit(1);
    const parentId: string | null = parentRow[0]?.parentOrgId ?? null;
    if (!parentId) return null;

    const inherited = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.orgId, parentId),
          eq(organizationMembers.status, 'active'),
        ),
      )
      .limit(1);
    if (inherited[0]) return inherited[0].role;

    currentOrgId = parentId;
  }
  return null;
}

/** Resolve the ultimate ancestor (billing root) for a given org. */
export async function getBillingRootOrgId(orgId: string): Promise<string> {
  let currentOrgId = orgId;
  for (let i = 0; i < 5; i++) {
    const row = await db
      .select({ parentOrgId: organizations.parentOrgId })
      .from(organizations)
      .where(eq(organizations.id, currentOrgId))
      .limit(1);
    const parentId = row[0]?.parentOrgId;
    if (!parentId) return currentOrgId;
    currentOrgId = parentId;
  }
  return currentOrgId;
}

// ─── Per-child usage report ───────────────────────────────────────────────────

export async function getConsolidatedReport(
  parentOrgId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<ConsolidatedReport> {
  const children = await getChildOrgs(parentOrgId);
  const childOrgIds = children.map((c) => c.id);

  // Include parent itself
  const allOrgIds = [parentOrgId, ...childOrgIds];

  const reports: ChildUsageReport[] = [];

  for (const orgId of allOrgIds) {
    const org = children.find((c) => c.id === orgId) ?? { id: orgId, name: 'Parent' };

    // Email stats
    const emailStats = await db.execute<{ sent: string; delivered: string }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE event_type = 'sent') AS sent,
        COUNT(*) FILTER (WHERE event_type = 'delivered') AS delivered
      FROM email_events
      WHERE org_id = ${orgId}
        AND created_at >= ${periodStart.toISOString()}
        AND created_at <= ${periodEnd.toISOString()}
    `);
    const stats = emailStats[0] ?? { sent: '0', delivered: '0' };

    // AI token usage
    const aiStats = await db.execute<{ tokens: string; cost: string }>(sql`
      SELECT
        COALESCE(SUM(tokens_used), 0) AS tokens,
        COALESCE(SUM(cost_usd), 0)    AS cost
      FROM ai_usage
      WHERE org_id = ${orgId}
        AND created_at >= ${periodStart.toISOString()}
        AND created_at <= ${periodEnd.toISOString()}
    `);
    const ai = aiStats[0] ?? { tokens: '0', cost: '0' };

    reports.push({
      orgId,
      orgName: org.name,
      emailsSent: Number(stats.sent),
      emailsDelivered: Number(stats.delivered),
      aiTokensUsed: Number(ai.tokens),
      aiCostUsd: Number(ai.cost),
      periodStart,
      periodEnd,
    });
  }

  const totals = reports.reduce(
    (acc, r) => ({
      emailsSent: acc.emailsSent + r.emailsSent,
      emailsDelivered: acc.emailsDelivered + r.emailsDelivered,
      aiTokensUsed: acc.aiTokensUsed + r.aiTokensUsed,
      aiCostUsd: acc.aiCostUsd + r.aiCostUsd,
    }),
    { emailsSent: 0, emailsDelivered: 0, aiTokensUsed: 0, aiCostUsd: 0 },
  );

  return { parentOrgId, periodStart, periodEnd, children: reports, totals };
}

// ─── Get parent subscription (children inherit) ───────────────────────────────

export async function getEffectiveSubscription(orgId: string) {
  // Try own subscription first
  const [own] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.orgId, orgId))
    .limit(1);
  if (own) return own;

  // Fall back to parent's subscription
  const parentRows = await db.execute<{ parent_org_id: string | null }>(
    sql`SELECT parent_org_id FROM organizations WHERE id = ${orgId} LIMIT 1`,
  );
  const parentOrgId = parentRows[0]?.parent_org_id;
  if (!parentOrgId) return null;

  const [parent] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.orgId, parentOrgId))
    .limit(1);
  return parent ?? null;
}

// ─── Consolidated invoice line items ─────────────────────────────────────────

export async function buildInvoiceLineItems(
  parentOrgId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<Array<{ description: string; quantity: number; unitAmount: number }>> {
  const report = await getConsolidatedReport(parentOrgId, periodStart, periodEnd);

  return report.children.map((child) => ({
    description: `${child.orgName} — ${child.emailsSent.toLocaleString()} emails sent`,
    quantity: child.emailsSent,
    unitAmount: 0, // priced by plan tier; actual amount from Stripe metered billing
  }));
}
