/**
 * Loyalty earning rules engine (#238)
 *
 * Evaluates which earning rules apply to an event and credits points
 * accordingly. Called from the events pipeline or workflow actions.
 */

import { and, eq, isNull, lte, gte, or } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  loyaltyEarningRules,
  loyaltyMembers,
  type LoyaltyEarningRule,
} from '../../db/schema/index.js';
import { creditPoints } from './enrollment.js';

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createEarningRule(
  orgId: string,
  programId: string,
  input: {
    name: string;
    description?: string;
    eventType: LoyaltyEarningRule['eventType'];
    customEventName?: string;
    pointsFixed?: number;
    pointsPerCurrency?: string;
    currencyField?: string;
    maxPointsPerEvent?: number;
    maxLifetimePoints?: number;
    maxPointsPerPeriod?: number;
    periodDays?: number;
    conditions?: Record<string, unknown>;
    startsAt?: Date;
    endsAt?: Date;
  },
): Promise<LoyaltyEarningRule> {
  const [rule] = await db
    .insert(loyaltyEarningRules)
    .values({
      orgId,
      programId,
      name: input.name,
      description: input.description,
      eventType: input.eventType,
      customEventName: input.customEventName,
      pointsFixed: input.pointsFixed,
      pointsPerCurrency: input.pointsPerCurrency,
      currencyField: input.currencyField,
      maxPointsPerEvent: input.maxPointsPerEvent,
      maxLifetimePoints: input.maxLifetimePoints,
      maxPointsPerPeriod: input.maxPointsPerPeriod,
      periodDays: input.periodDays,
      conditions: input.conditions,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    })
    .returning();
  return rule!;
}

export async function updateEarningRule(
  orgId: string,
  ruleId: string,
  patch: Partial<
    Omit<LoyaltyEarningRule, 'id' | 'orgId' | 'programId' | 'createdAt' | 'updatedAt'>
  >,
): Promise<LoyaltyEarningRule> {
  const [updated] = await db
    .update(loyaltyEarningRules)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(loyaltyEarningRules.id, ruleId), eq(loyaltyEarningRules.orgId, orgId)))
    .returning();
  if (!updated) throw new Error('Earning rule not found');
  return updated;
}

export async function deleteEarningRule(orgId: string, ruleId: string): Promise<void> {
  await db
    .delete(loyaltyEarningRules)
    .where(and(eq(loyaltyEarningRules.id, ruleId), eq(loyaltyEarningRules.orgId, orgId)));
}

export async function listEarningRules(
  orgId: string,
  programId: string,
): Promise<LoyaltyEarningRule[]> {
  return db
    .select()
    .from(loyaltyEarningRules)
    .where(and(eq(loyaltyEarningRules.orgId, orgId), eq(loyaltyEarningRules.programId, programId)))
    .orderBy(loyaltyEarningRules.createdAt);
}

// ─── Event evaluation ─────────────────────────────────────────────────────────

export interface EarnEvent {
  eventType: LoyaltyEarningRule['eventType'];
  customEventName?: string;
  /** Properties used for per-currency calculation (e.g. { amount: 49.99 }) */
  properties?: Record<string, unknown>;
}

export interface EarnResult {
  pointsEarned: number;
  rulesApplied: string[];
  newBalance: number;
  tieredUp: boolean;
  tierName?: string;
}

/**
 * Calculate points to award for a given event on a rule.
 */
function calculatePoints(rule: LoyaltyEarningRule, event: EarnEvent): number {
  if (rule.pointsFixed !== null && rule.pointsFixed !== undefined) {
    return rule.pointsFixed;
  }

  if (rule.pointsPerCurrency && rule.currencyField && event.properties) {
    const amount = Number(event.properties[rule.currencyField] ?? 0);
    const rate = Number(rule.pointsPerCurrency);
    const raw = Math.floor(amount * rate);
    const capped = rule.maxPointsPerEvent ? Math.min(raw, rule.maxPointsPerEvent) : raw;
    return Math.max(0, capped);
  }

  return 0;
}

/**
 * Evaluate all active earning rules for a program and credit points to a member.
 * Skips if member is not enrolled or not active.
 */
export async function processEarnEvent(
  orgId: string,
  programId: string,
  contactId: string,
  event: EarnEvent,
): Promise<EarnResult | null> {
  // Get member
  const [member] = await db
    .select()
    .from(loyaltyMembers)
    .where(
      and(
        eq(loyaltyMembers.orgId, orgId),
        eq(loyaltyMembers.programId, programId),
        eq(loyaltyMembers.contactId, contactId),
      ),
    )
    .limit(1);

  if (!member || member.status !== 'active') return null;

  // Get active rules for this event type
  const now = new Date();
  const rules = await db
    .select()
    .from(loyaltyEarningRules)
    .where(
      and(
        eq(loyaltyEarningRules.orgId, orgId),
        eq(loyaltyEarningRules.programId, programId),
        eq(loyaltyEarningRules.active, true),
        eq(loyaltyEarningRules.eventType, event.eventType),
        or(isNull(loyaltyEarningRules.startsAt), lte(loyaltyEarningRules.startsAt, now))!,
        or(isNull(loyaltyEarningRules.endsAt), gte(loyaltyEarningRules.endsAt, now))!,
      ),
    );

  const matchingRules = rules.filter((r) => {
    if (r.eventType === 'custom_event') {
      return r.customEventName === event.customEventName;
    }
    return true;
  });

  if (matchingRules.length === 0) return null;

  let totalPoints = 0;
  const rulesApplied: string[] = [];

  for (const rule of matchingRules) {
    const pts = calculatePoints(rule, event);
    if (pts > 0) {
      totalPoints += pts;
      rulesApplied.push(rule.id);
    }
  }

  if (totalPoints === 0) return null;

  const { newBalance, tieredUp, tierName } = await creditPoints(orgId, member.id, totalPoints, {
    description: `${event.eventType} event`,
    type: 'earn',
  });

  return { pointsEarned: totalPoints, rulesApplied, newBalance, tieredUp, tierName };
}
