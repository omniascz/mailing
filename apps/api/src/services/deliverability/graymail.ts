/**
 * Graymail suppression service (#351/#397).
 *
 * Periodically scans every contact's engagement signals, classifies them
 * via `classifyGraymail`, and tags or suppresses as appropriate. Runs from
 * a nightly BullMQ job (`graymail-sweeper`).
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { tags, contactTags, suppressions } from '../../db/schema/index.js';
import { classifyGraymail, type GraymailTier } from './pure.js';

export interface GraymailSweepResult {
  orgId: string;
  examined: number;
  graymailSuppressed: number;
  dormantSuppressed: number;
  atRisk: number;
  engaged: number;
}

const WINDOW_DAYS = 90;

/**
 * Run a graymail sweep for a single org. Writes a `graymail` / `dormant` /
 * `at_risk` tag onto each classified contact and inserts a suppression row
 * for tiers that suppress broadcast sending.
 */
export async function sweepOrg(orgId: string): Promise<GraymailSweepResult> {
  // Ensure tier tags exist
  const tierTags = await ensureTierTags(orgId);

  const rows = await db.execute<{
    contact_id: string;
    email: string | null;
    total_sends: number;
    total_opens: number;
    total_clicks: number;
    last_opened_at: Date | null;
    last_clicked_at: Date | null;
    created_at: Date;
  }>(sql`
    SELECT c.id AS contact_id,
           c.email,
           COALESCE(e.total_sends, 0)::int AS total_sends,
           COALESCE(e.total_opens, 0)::int AS total_opens,
           COALESCE(e.total_clicks, 0)::int AS total_clicks,
           c.last_opened_at,
           c.last_clicked_at,
           c.created_at
      FROM contacts c
      LEFT JOIN contact_engagement e ON e.contact_id = c.id
     WHERE c.org_id = ${orgId}
       AND c.deleted_at IS NULL
       AND c.status = 'active'
  `);

  const now = Date.now();
  let examined = 0;
  const counts = { engaged: 0, at_risk: 0, graymail: 0, dormant: 0 };

  for (const r of rows) {
    examined++;
    const lastEng = latestDate(r.last_opened_at, r.last_clicked_at);
    const ageDays = (now - new Date(r.created_at).getTime()) / 86_400_000;
    const daysSince = lastEng ? (now - lastEng.getTime()) / 86_400_000 : null;

    const decision = classifyGraymail({
      sendsInWindow: r.total_sends,
      engagementsInWindow: r.total_opens + r.total_clicks,
      daysSinceLastEngagement: daysSince,
      ageInDays: ageDays,
    });

    counts[decision.tier]++;
    await writeTierTag(orgId, r.contact_id, decision.tier, tierTags);

    if (decision.suppressBroadcast && r.email) {
      await db
        .insert(suppressions)
        .values({
          orgId,
          email: r.email,
          reason: 'manual' as const,
          notes: `graymail:${decision.tier} — ${decision.reason}`,
        })
        .onConflictDoNothing();
    }
  }

  return {
    orgId,
    examined,
    graymailSuppressed: counts.graymail,
    dormantSuppressed: counts.dormant,
    atRisk: counts.at_risk,
    engaged: counts.engaged,
  };
}

// ─── Tier tagging ───────────────────────────────────────────────────────────

async function ensureTierTags(orgId: string): Promise<Record<GraymailTier, string>> {
  const wanted: GraymailTier[] = ['engaged', 'at_risk', 'graymail', 'dormant'];
  const out: Record<string, string> = {};

  for (const tier of wanted) {
    const tagName = `deliverability:${tier}`;
    const [existing] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.orgId, orgId), eq(tags.name, tagName)))
      .limit(1);
    if (existing) {
      out[tier] = existing.id;
      continue;
    }
    const [inserted] = await db
      .insert(tags)
      .values({ orgId, name: tagName })
      .onConflictDoNothing()
      .returning({ id: tags.id });
    if (inserted) {
      out[tier] = inserted.id;
    } else {
      const [retry] = await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.orgId, orgId), eq(tags.name, tagName)))
        .limit(1);
      if (retry) out[tier] = retry.id;
    }
  }
  return out as Record<GraymailTier, string>;
}

async function writeTierTag(
  orgId: string,
  contactId: string,
  tier: GraymailTier,
  tierTags: Record<GraymailTier, string>,
): Promise<void> {
  // Remove any previously applied deliverability:* tag, then add the current one
  await db.execute(sql`
    DELETE FROM contact_tags ct
     USING tags t
     WHERE ct.tag_id = t.id
       AND ct.contact_id = ${contactId}
       AND t.org_id = ${orgId}
       AND t.name LIKE 'deliverability:%'
  `);

  const tagId = tierTags[tier];
  if (!tagId) return;
  await db
    .insert(contactTags)
    .values({ contactId, tagId })
    .onConflictDoNothing();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function latestDate(a: Date | null, b: Date | null): Date | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return a.getTime() > b.getTime() ? a : b;
}

// Re-export the window so workers can tune it
export const GRAYMAIL_WINDOW_DAYS = WINDOW_DAYS;
