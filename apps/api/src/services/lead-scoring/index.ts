/**
 * Lead scoring engine (task 5.10).
 *
 * Scoring lifecycle:
 *   1. applyLeadScore(contactId, eventType) — award/deduct points, log event
 *   2. decayScores()                        — daily job: subtract decayed points
 *   3. evaluateThresholds(contactId)        — fire tag + webhook on score milestones
 *
 * Default rule seeds are created by seedDefaultRules() when an org first
 * enables lead scoring.
 */

import { and, eq, sql, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  contacts,
  leadScoreRules,
  leadScoreEvents,
  type LeadScoreRule,
} from '../../db/schema/index.js';
import { redis } from '@forgemsg/shared/redis';
import { AppError } from '../../lib/app-error.js';

// ─── Threshold definitions ────────────────────────────────────────────────────

interface ScoreThreshold {
  score: number;
  tagName: string;
  label: string;
}

const SCORE_THRESHOLDS: ScoreThreshold[] = [
  { score: 10, tagName: 'lead_warm', label: 'Warm lead' },
  { score: 50, tagName: 'lead_hot', label: 'Hot lead' },
  { score: 100, tagName: 'lead_mql', label: 'MQL' },
  { score: 200, tagName: 'lead_sql', label: 'SQL' },
];

// ─── Default rule seeds ───────────────────────────────────────────────────────

export const DEFAULT_RULES: Array<
  Omit<LeadScoreRule, 'id' | 'orgId' | 'createdAt' | 'updatedAt' | 'active'>
> = [
  { eventType: 'email_open', points: 1, decayDays: 90, description: 'Opened an email' },
  { eventType: 'email_click', points: 3, decayDays: 90, description: 'Clicked a link in email' },
  { eventType: 'link_click', points: 5, decayDays: 90, description: 'Clicked a tracked link' },
  { eventType: 'page_visit', points: 2, decayDays: 90, description: 'Visited a tracked page' },
  { eventType: 'form_submit', points: 10, decayDays: 180, description: 'Submitted a form' },
  { eventType: 'purchase', points: 20, decayDays: 365, description: 'Made a purchase' },
  {
    eventType: 'email_unsubscribe',
    points: -10,
    decayDays: 365,
    description: 'Unsubscribed from emails',
  },
  { eventType: 'spam_complaint', points: -25, decayDays: 365, description: 'Marked email as spam' },
];

export async function seedDefaultRules(orgId: string): Promise<void> {
  const existing = await db
    .select({ id: leadScoreRules.id })
    .from(leadScoreRules)
    .where(eq(leadScoreRules.orgId, orgId))
    .limit(1);

  if (existing.length > 0) return; // already seeded

  await db.insert(leadScoreRules).values(DEFAULT_RULES.map((r) => ({ ...r, orgId, active: true })));
}

// ─── Apply score ──────────────────────────────────────────────────────────────

export async function applyLeadScore(
  contactId: string,
  orgId: string,
  eventType: string,
  metadata?: Record<string, unknown>,
): Promise<{ scoreAfter: number; pointsDelta: number } | null> {
  // Find the active rule for this event type
  const [rule] = await db
    .select()
    .from(leadScoreRules)
    .where(
      and(
        eq(leadScoreRules.orgId, orgId),
        eq(leadScoreRules.eventType, eventType),
        eq(leadScoreRules.active, true),
      ),
    )
    .limit(1);

  if (!rule) return null; // no rule configured for this event

  // Get current contact score
  const [contact] = await db
    .select({ id: contacts.id, leadScore: contacts.leadScore })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
    .limit(1);

  if (!contact) throw AppError.notFound('Contact');

  const currentScore = contact.leadScore ?? 0;
  const scoreAfter = Math.max(0, currentScore + rule.points); // floor at 0

  // Update contact score
  await db
    .update(contacts)
    .set({ leadScore: scoreAfter, updatedAt: new Date() })
    .where(eq(contacts.id, contactId));

  // Log the event
  await db.insert(leadScoreEvents).values({
    orgId,
    contactId,
    eventType,
    pointsDelta: rule.points,
    scoreAfter,
    metadata: metadata ?? null,
  });

  // Evaluate thresholds (fire-and-forget)
  evaluateThresholds(contactId, orgId, currentScore, scoreAfter).catch(() => {});

  return { scoreAfter, pointsDelta: rule.points };
}

// ─── Threshold evaluation ─────────────────────────────────────────────────────

async function evaluateThresholds(
  contactId: string,
  orgId: string,
  scoreBefore: number,
  scoreAfter: number,
): Promise<void> {
  for (const threshold of SCORE_THRESHOLDS) {
    // Only fire once when crossing the threshold upwards
    if (scoreBefore < threshold.score && scoreAfter >= threshold.score) {
      // Dedup: don't fire if already processed within 24h
      const dedupKey = `lead-threshold:${contactId}:${threshold.tagName}`;
      const alreadyFired = await redis.get(dedupKey);
      if (alreadyFired) continue;

      await redis.setex(dedupKey, 86_400, '1');

      // Add tag
      try {
        const { tags, contactTags } = await import('../../db/schema/index.js');
        const [tag] = await db
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.orgId, orgId), eq(tags.name, threshold.tagName)))
          .limit(1);

        const tagId = tag?.id;
        if (tagId) {
          await db
            .insert(contactTags)
            .values({ contactId, tagId })
            .onConflictDoNothing()
            .catch(() => {});
        }
      } catch {
        // tag application is best-effort
      }
    }
  }
}

// ─── Score decay ──────────────────────────────────────────────────────────────

/**
 * Daily job: recalculates each contact's score by removing contributions from
 * events older than their rule's decay_days.
 *
 * Strategy: sum all non-decayed events per contact and update the contact row.
 * This is a full-recalc approach — simple and correct for typical org sizes.
 * For very large orgs (> 1M contacts) this would be batched.
 */
export async function decayScores(orgId: string): Promise<{ updated: number }> {
  // Get all contacts in org that have a non-zero score
  const contactRows = await db
    .select({ id: contacts.id, leadScore: contacts.leadScore })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), sql`${contacts.leadScore} > 0`));

  let updated = 0;

  for (const contact of contactRows) {
    // Recalculate score: sum pointsDelta from events where createdAt > now - decayDays
    // We join lead_score_events with lead_score_rules on eventType to get the decayDays
    const [result] = await db.execute(sql`
      SELECT COALESCE(SUM(lse.points_delta), 0)::int AS new_score
      FROM lead_score_events lse
      JOIN lead_score_rules lsr
        ON lsr.org_id = lse.org_id
       AND lsr.event_type = lse.event_type
      WHERE lse.contact_id = ${contact.id}
        AND lse.org_id = ${orgId}
        AND lse.created_at >= now() - (lsr.decay_days || ' days')::interval
    `);

    const newScore = Math.max(0, Number((result as { new_score: number }).new_score));

    if (newScore !== (contact.leadScore ?? 0)) {
      await db
        .update(contacts)
        .set({ leadScore: newScore, updatedAt: new Date() })
        .where(eq(contacts.id, contact.id));
      updated++;
    }
  }

  return { updated };
}

// ─── CRUD for rules ───────────────────────────────────────────────────────────

export async function listLeadScoreRules(orgId: string): Promise<LeadScoreRule[]> {
  return db
    .select()
    .from(leadScoreRules)
    .where(eq(leadScoreRules.orgId, orgId))
    .orderBy(desc(leadScoreRules.points));
}

export async function createLeadScoreRule(
  orgId: string,
  data: { eventType: string; points: number; decayDays?: number; description?: string },
): Promise<LeadScoreRule> {
  const [rule] = await db
    .insert(leadScoreRules)
    .values({ orgId, ...data, decayDays: data.decayDays ?? 90, active: true })
    .returning();
  return rule!;
}

export async function updateLeadScoreRule(
  id: string,
  orgId: string,
  data: Partial<{ points: number; decayDays: number; active: boolean; description: string }>,
): Promise<LeadScoreRule> {
  const [rule] = await db
    .update(leadScoreRules)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(leadScoreRules.id, id), eq(leadScoreRules.orgId, orgId)))
    .returning();

  if (!rule) throw AppError.notFound('LeadScoreRule');
  return rule;
}

export async function deleteLeadScoreRule(id: string, orgId: string): Promise<void> {
  const [rule] = await db
    .delete(leadScoreRules)
    .where(and(eq(leadScoreRules.id, id), eq(leadScoreRules.orgId, orgId)))
    .returning({ id: leadScoreRules.id });

  if (!rule) throw AppError.notFound('LeadScoreRule');
}

export async function getContactLeadScoreHistory(contactId: string, orgId: string, limit = 50) {
  return db
    .select()
    .from(leadScoreEvents)
    .where(and(eq(leadScoreEvents.contactId, contactId), eq(leadScoreEvents.orgId, orgId)))
    .orderBy(desc(leadScoreEvents.createdAt))
    .limit(limit);
}
