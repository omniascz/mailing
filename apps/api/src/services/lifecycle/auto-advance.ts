/**
 * Stage auto-advance engine (#319).
 *
 * Evaluates all enabled lifecycle_rules for a contact, and if conditions
 * match, advances the contact's lifecycle_stage (stored in customFields),
 * applies side effects (tags, workflow enrol), and increments metrics.
 *
 * Call `evaluateContact(orgId, contactId)` from:
 *   - lead-scoring recompute
 *   - meetings.book
 *   - tag add/remove
 *   - API event handler
 */

import { and, eq, asc, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts } from '../../db/schema/contacts.js';
import {
  lifecycleRules,
  type LifecycleRule,
  type LifecycleRuleCondition,
} from '../../db/schema/lifecycle-rules.js';

// ─── Fact resolver ────────────────────────────────────────────────────────────

interface ContactFacts {
  leadScore: number;
  lifecycleStage: string | null;
  tags: string[];
  customFields: Record<string, unknown>;
  hasBookedMeeting: boolean;
  lastOpenedAt: Date | null;
  lastClickedAt: Date | null;
}

async function loadFacts(orgId: string, contactId: string): Promise<ContactFacts | null> {
  const rows = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);
  const c = rows[0];
  if (!c) return null;

  // Booked meeting. The table is `bookings`, not `meetings`, and it has no
  // contact_id — it is keyed by the invitee's email address, so the link back to
  // a contact goes through contacts.email. Its confirmed state is 'confirmed';
  // there is no 'scheduled'. No try/catch: if this stops resolving, the rule
  // engine must fail loudly rather than quietly decide nobody ever booked.
  const meetingRows = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text AS count
        FROM bookings b
        JOIN contacts c ON c.email = b.invitee_email AND c.org_id = b.org_id
        WHERE b.org_id = ${orgId}::uuid
          AND c.id = ${contactId}::uuid
          AND b.status = 'confirmed'`,
  );
  const hasBookedMeeting =
    Number((meetingRows as unknown as Array<{ count: string }>)[0]?.count ?? '0') > 0;

  const cf = (c.customFields ?? {}) as Record<string, unknown>;
  return {
    leadScore: c.leadScore ?? 0,
    lifecycleStage: (cf.lifecycle_stage as string) ?? null,
    tags: Array.isArray(cf.tags) ? (cf.tags as string[]) : [],
    customFields: cf,
    hasBookedMeeting,
    lastOpenedAt: c.lastOpenedAt,
    lastClickedAt: c.lastClickedAt,
  };
}

function resolveField(field: string, facts: ContactFacts): unknown {
  switch (field) {
    case 'lead_score':
      return facts.leadScore;
    case 'lifecycle_stage':
      return facts.lifecycleStage;
    case 'has_booked_meeting':
      return facts.hasBookedMeeting;
    case 'has_tag':
      return facts.tags;
    case 'last_opened_at':
      return facts.lastOpenedAt;
    case 'last_clicked_at':
      return facts.lastClickedAt;
    default:
      if (field.startsWith('custom.')) {
        return facts.customFields[field.slice('custom.'.length)];
      }
      return undefined;
  }
}

function evaluateCondition(cond: LifecycleRuleCondition, facts: ContactFacts): boolean {
  const actual = resolveField(cond.field, facts);
  const expected = cond.value;

  switch (cond.operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'contains':
      return (
        (Array.isArray(actual) && actual.includes(expected as string)) ||
        (typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected))
      );
    case 'exists':
      return actual !== undefined && actual !== null && actual !== '';
    default:
      return false;
  }
}

// ─── Rule matching ────────────────────────────────────────────────────────────

function matchesRule(rule: LifecycleRule, facts: ContactFacts): boolean {
  if (rule.fromStage && facts.lifecycleStage !== rule.fromStage) return false;
  if (facts.lifecycleStage === rule.toStage) return false; // already there
  return rule.conditions.every((c) => evaluateCondition(c, facts));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface AutoAdvanceResult {
  advanced: boolean;
  fromStage: string | null;
  toStage: string | null;
  ruleId: string | null;
  ruleName: string | null;
}

export async function evaluateContact(
  orgId: string,
  contactId: string,
): Promise<AutoAdvanceResult> {
  const facts = await loadFacts(orgId, contactId);
  if (!facts) {
    return { advanced: false, fromStage: null, toStage: null, ruleId: null, ruleName: null };
  }

  const rules = await db
    .select()
    .from(lifecycleRules)
    .where(and(eq(lifecycleRules.orgId, orgId), eq(lifecycleRules.enabled, true)))
    .orderBy(asc(lifecycleRules.priority));

  for (const rule of rules) {
    // Tick evaluation counter (async; non-blocking for the hot path)
    void db
      .update(lifecycleRules)
      .set({ evaluationCount: sql`${lifecycleRules.evaluationCount} + 1` })
      .where(eq(lifecycleRules.id, rule.id));

    if (!matchesRule(rule, facts)) continue;

    // Apply: advance stage + add tags + optionally enrol in workflow
    const fromStage = facts.lifecycleStage;
    const nextCustomFields: Record<string, unknown> = {
      ...facts.customFields,
      lifecycle_stage: rule.toStage,
    };
    if (rule.addTags.length) {
      const existing = Array.isArray(facts.customFields.tags)
        ? (facts.customFields.tags as string[])
        : [];
      nextCustomFields.tags = [...new Set([...existing, ...rule.addTags])];
    }

    await db
      .update(contacts)
      .set({
        customFields: nextCustomFields,
        updatedAt: new Date(),
      })
      .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)));

    await db
      .update(lifecycleRules)
      .set({
        matchCount: sql`${lifecycleRules.matchCount} + 1`,
        lastMatchedAt: new Date(),
      })
      .where(eq(lifecycleRules.id, rule.id));

    if (rule.triggerWorkflowId) {
      try {
        const { onApiEvent } = await import('../workflows/triggers.js');
        await onApiEvent(orgId, contactId, 'lifecycle_stage_advanced', {
          fromStage,
          toStage: rule.toStage,
          ruleId: rule.id,
        });
      } catch {
        /* non-fatal */
      }
    }

    return {
      advanced: true,
      fromStage,
      toStage: rule.toStage,
      ruleId: rule.id,
      ruleName: rule.name,
    };
  }

  return {
    advanced: false,
    fromStage: facts.lifecycleStage,
    toStage: null,
    ruleId: null,
    ruleName: null,
  };
}

// ─── CRUD helpers ─────────────────────────────────────────────────────────────

export async function createRule(
  orgId: string,
  input: {
    name: string;
    fromStage?: string;
    toStage: string;
    conditions: LifecycleRuleCondition[];
    addTags?: string[];
    triggerWorkflowId?: string;
    priority?: number;
  },
): Promise<LifecycleRule> {
  const [rule] = await db
    .insert(lifecycleRules)
    .values({
      orgId,
      name: input.name,
      fromStage: input.fromStage ?? null,
      toStage: input.toStage,
      conditions: input.conditions,
      addTags: input.addTags ?? [],
      triggerWorkflowId: input.triggerWorkflowId ?? null,
      priority: input.priority ?? 100,
    })
    .returning();
  return rule!;
}

export async function listRules(orgId: string): Promise<LifecycleRule[]> {
  return db
    .select()
    .from(lifecycleRules)
    .where(eq(lifecycleRules.orgId, orgId))
    .orderBy(asc(lifecycleRules.priority));
}

export async function deleteRule(orgId: string, ruleId: string): Promise<void> {
  await db
    .delete(lifecycleRules)
    .where(and(eq(lifecycleRules.orgId, orgId), eq(lifecycleRules.id, ruleId)));
}
