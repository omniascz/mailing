/**
 * Round-robin scheduling for team meeting pools (#261).
 *
 * Strategy: weighted round-robin by assignment count (fewest assignments first).
 * Tie-breaking: least recently assigned.
 *
 * State is persisted in round_robin_state so restarts don't reset fairness.
 */

import { eq, and, asc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { roundRobinState } from '../../db/schema/booking-pages.js';

import { calendarEvents } from '../../db/schema/calendar.js';
import { gte, lte } from 'drizzle-orm';

// ─── Pick next host ───────────────────────────────────────────────────────────

export async function pickNextHost(
  orgId: string,
  eventTypeId: string,
  memberIds: string[],
): Promise<string> {
  if (memberIds.length === 0) throw new Error('No team members configured');
  if (memberIds.length === 1) return memberIds[0]!;

  // Ensure state rows exist for all members
  await ensureStateRows(orgId, eventTypeId, memberIds);

  // Load state sorted by (assignmentCount ASC, lastAssignedAt ASC)
  const states = await db.select()
    .from(roundRobinState)
    .where(and(
      eq(roundRobinState.orgId, orgId),
      eq(roundRobinState.eventTypeId, eventTypeId),
    ))
    .orderBy(asc(roundRobinState.assignmentCount), asc(roundRobinState.lastAssignedAt));

  // Pick the first eligible member (who is available right now)
  const now = new Date();
  for (const state of states) {
    if (!memberIds.includes(state.userId)) continue;
    const available = await isMemberAvailable(state.userId, now);
    if (available) {
      await db.update(roundRobinState)
        .set({
          assignmentCount: state.assignmentCount + 1,
          lastAssignedAt: now,
          updatedAt: now,
        })
        .where(eq(roundRobinState.id, state.id));
      return state.userId;
    }
  }

  // Fallback: pick the one with fewest assignments ignoring availability
  const fallback = states.find(s => memberIds.includes(s.userId));
  if (fallback) {
    await db.update(roundRobinState)
      .set({
        assignmentCount: fallback.assignmentCount + 1,
        lastAssignedAt: now,
        updatedAt: now,
      })
      .where(eq(roundRobinState.id, fallback.id));
    return fallback.userId;
  }

  return memberIds[0]!;
}

// ─── Team availability overview ───────────────────────────────────────────────

export interface TeamSlot {
  userId: string;
  startAt: string;
  endAt: string;
}

export async function getTeamAvailability(
  _orgId: string,
  userIds: string[],
  fromDate: Date,
  toDate: Date,
): Promise<TeamSlot[]> {
  const slots: TeamSlot[] = [];

  for (const userId of userIds) {
    const available = await isMemberAvailableInRange(userId, fromDate, toDate);
    if (available) {
      slots.push({
        userId,
        startAt: fromDate.toISOString(),
        endAt: toDate.toISOString(),
      });
    }
  }

  return slots;
}

// ─── Availability check ───────────────────────────────────────────────────────

async function isMemberAvailable(_userId: string, at: Date): Promise<boolean> {
  // Check for calendar conflicts at the given moment
  const conflicts = await db.select({ id: calendarEvents.id })
    .from(calendarEvents)
    .where(and(
      eq(calendarEvents.busy, true),
      lte(calendarEvents.startAt, at),
      gte(calendarEvents.endAt, at),
    ))
    .limit(1);
  return conflicts.length === 0;
}

async function isMemberAvailableInRange(_userId: string, from: Date, to: Date): Promise<boolean> {
  const conflicts = await db.select({ id: calendarEvents.id })
    .from(calendarEvents)
    .where(and(
      eq(calendarEvents.busy, true),
      lte(calendarEvents.startAt, to),
      gte(calendarEvents.endAt, from),
    ))
    .limit(1);
  return conflicts.length === 0;
}

// ─── Ensure state rows exist ──────────────────────────────────────────────────

async function ensureStateRows(
  orgId: string,
  eventTypeId: string,
  memberIds: string[],
): Promise<void> {
  const existing = await db.select({ userId: roundRobinState.userId })
    .from(roundRobinState)
    .where(and(
      eq(roundRobinState.orgId, orgId),
      eq(roundRobinState.eventTypeId, eventTypeId),
    ));

  const existingIds = new Set(existing.map(r => r.userId));
  const missing = memberIds.filter(id => !existingIds.has(id));

  if (missing.length > 0) {
    await db.insert(roundRobinState).values(
      missing.map(userId => ({ orgId, eventTypeId, userId })),
    ).onConflictDoNothing();
  }
}
