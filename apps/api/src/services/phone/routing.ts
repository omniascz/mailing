/**
 * Call routing engine (#251)
 *
 * Given an inbound call (from → to) on one of our DID numbers, decide
 * what happens next:
 *
 *   1. Business hours check → if out of hours, route to after-hours target
 *   2. DID → IVR menu lookup (greet + DTMF collection)
 *   3. IVR digit → next action: hunt group, sub-menu, voicemail, voicebot, external
 *   4. Hunt group → pick an agent by strategy (ring-all / round-robin / least-idle)
 *      - If nobody picks up within ring_timeout → overflow to voicebot/voicemail
 *
 * The engine is intentionally pure — it returns a RoutingDecision describing
 * *what* the VoIP provider should do next, never placing the call itself.
 * The caller (webhook handler) converts the decision into TwiML/TeXML.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  huntGroups,
  ivrMenus,
  businessHours,
  agentPresence,
  type HuntGroup,
  type IvrMenu,
  type BusinessHours,
  type IvrOption,
  type BusinessHoursScheduleEntry,
  type BusinessHoursHoliday,
} from '../../db/schema/call-routing.js';

// ─── Decision shape ──────────────────────────────────────────────────────────

export type RoutingAction =
  | { type: 'ring-agents'; userIds: string[]; ringTimeoutSeconds: number; overflow: RoutingAction }
  | {
      type: 'play-ivr';
      ivrId: string;
      greeting: string;
      options: IvrOption[];
      timeoutSeconds: number;
    }
  | { type: 'voicemail'; prompt?: string; mailboxId?: string }
  | { type: 'voicebot'; scenarioId?: string }
  | { type: 'forward'; number: string }
  | { type: 'hangup'; reason?: string };

export interface RoutingDecision {
  action: RoutingAction;
  /** Human-readable trace for debugging/observability. */
  trace: string[];
}

// ─── Hunt group CRUD ─────────────────────────────────────────────────────────

export async function createHuntGroup(
  orgId: string,
  input: {
    name: string;
    strategy?: HuntGroup['strategy'];
    memberUserIds: string[];
    ringTimeoutSeconds?: number;
    overflowTarget?: HuntGroup['overflowTarget'];
    overflowTargetId?: string;
  },
): Promise<HuntGroup> {
  const [row] = await db
    .insert(huntGroups)
    .values({
      orgId,
      name: input.name,
      strategy: input.strategy ?? 'ring-all',
      memberUserIds: input.memberUserIds,
      ringTimeoutSeconds: input.ringTimeoutSeconds ?? 30,
      overflowTarget: input.overflowTarget ?? 'voicemail',
      overflowTargetId: input.overflowTargetId ?? null,
    })
    .returning();
  return row!;
}

export async function listHuntGroups(orgId: string): Promise<HuntGroup[]> {
  return db.select().from(huntGroups).where(eq(huntGroups.orgId, orgId));
}

export async function updateHuntGroup(
  orgId: string,
  id: string,
  patch: Partial<HuntGroup>,
): Promise<HuntGroup> {
  const [row] = await db
    .update(huntGroups)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(huntGroups.id, id), eq(huntGroups.orgId, orgId)))
    .returning();
  if (!row) throw new Error('Hunt group not found');
  return row;
}

export async function deleteHuntGroup(orgId: string, id: string): Promise<void> {
  await db.delete(huntGroups).where(and(eq(huntGroups.id, id), eq(huntGroups.orgId, orgId)));
}

// ─── IVR menu CRUD ───────────────────────────────────────────────────────────

export async function createIvrMenu(
  orgId: string,
  input: {
    name: string;
    greeting: string;
    didNumber?: string;
    options: IvrOption[];
    timeoutSeconds?: number;
    invalidTarget?: IvrMenu['invalidTarget'];
  },
): Promise<IvrMenu> {
  const [row] = await db
    .insert(ivrMenus)
    .values({
      orgId,
      name: input.name,
      greeting: input.greeting,
      didNumber: input.didNumber ?? null,
      options: input.options,
      timeoutSeconds: input.timeoutSeconds ?? 10,
      invalidTarget: input.invalidTarget ?? 'repeat',
    })
    .returning();
  return row!;
}

export async function listIvrMenus(orgId: string): Promise<IvrMenu[]> {
  return db.select().from(ivrMenus).where(eq(ivrMenus.orgId, orgId));
}

export async function updateIvrMenu(
  orgId: string,
  id: string,
  patch: Partial<IvrMenu>,
): Promise<IvrMenu> {
  const [row] = await db
    .update(ivrMenus)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(ivrMenus.id, id), eq(ivrMenus.orgId, orgId)))
    .returning();
  if (!row) throw new Error('IVR menu not found');
  return row;
}

export async function deleteIvrMenu(orgId: string, id: string): Promise<void> {
  await db.delete(ivrMenus).where(and(eq(ivrMenus.id, id), eq(ivrMenus.orgId, orgId)));
}

// ─── Business hours ──────────────────────────────────────────────────────────

export async function setBusinessHours(
  orgId: string,
  input: {
    timezone: string;
    schedule: BusinessHoursScheduleEntry[];
    holidays?: BusinessHoursHoliday[];
    afterHoursTarget?: BusinessHours['afterHoursTarget'];
    afterHoursTargetId?: string;
  },
): Promise<BusinessHours> {
  const [existing] = await db.select().from(businessHours).where(eq(businessHours.orgId, orgId));
  const values = {
    orgId,
    timezone: input.timezone,
    schedule: input.schedule,
    holidays: input.holidays ?? [],
    afterHoursTarget: input.afterHoursTarget ?? 'voicemail',
    afterHoursTargetId: input.afterHoursTargetId ?? null,
    updatedAt: new Date(),
  };
  if (existing) {
    const [row] = await db
      .update(businessHours)
      .set(values)
      .where(eq(businessHours.orgId, orgId))
      .returning();
    return row!;
  }
  const [row] = await db.insert(businessHours).values(values).returning();
  return row!;
}

export async function getBusinessHours(orgId: string): Promise<BusinessHours | null> {
  const [row] = await db
    .select()
    .from(businessHours)
    .where(eq(businessHours.orgId, orgId))
    .limit(1);
  return row ?? null;
}

function isWithinBusinessHours(bh: BusinessHours, at: Date = new Date()): boolean {
  if (!bh.schedule || bh.schedule.length === 0) return true;
  // Compute wall-clock day + minutes in the org's timezone
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: bh.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(at);
  const p = (t: string): string => parts.find((x) => x.type === t)?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const day = weekdayMap[p('weekday')] ?? 0;
  const minutes = Number(p('hour')) * 60 + Number(p('minute'));
  const iso = `${p('year')}-${p('month')}-${p('day')}`;

  if (bh.holidays?.some((h) => h.date === iso)) return false;

  return bh.schedule.some(
    (entry) => entry.day === day && minutes >= entry.openMinutes && minutes < entry.closeMinutes,
  );
}

// ─── Agent presence ──────────────────────────────────────────────────────────

export async function setAgentPresence(
  orgId: string,
  userId: string,
  status: 'available' | 'busy' | 'away' | 'offline',
): Promise<void> {
  await db
    .insert(agentPresence)
    .values({
      orgId,
      userId,
      status,
      lastActiveAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [agentPresence.orgId, agentPresence.userId],
      set: { status, lastActiveAt: new Date(), updatedAt: new Date() },
    });
}

async function pickAvailableAgents(
  orgId: string,
  candidateIds: string[],
  strategy: HuntGroup['strategy'],
  rrIndex: number,
): Promise<{ userIds: string[]; nextRrIndex: number }> {
  if (candidateIds.length === 0) return { userIds: [], nextRrIndex: 0 };

  // Prefer candidates marked 'available' in presence
  const rows = await db
    .select()
    .from(agentPresence)
    .where(
      and(
        eq(agentPresence.orgId, orgId),
        sql`${agentPresence.userId} IN (${sql.join(
          candidateIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      ),
    );
  const presenceByUser = new Map(rows.map((r) => [r.userId, r]));
  const available = candidateIds.filter((id) => presenceByUser.get(id)?.status === 'available');
  // If nobody marked available, fall back to all candidates — better to ring
  // stale phones than to drop to voicemail for a silent presence table.
  const pool = available.length > 0 ? available : candidateIds;

  if (strategy === 'ring-all') return { userIds: pool, nextRrIndex: rrIndex };
  if (strategy === 'round-robin') {
    const idx = rrIndex % pool.length;
    return { userIds: [pool[idx]!], nextRrIndex: (idx + 1) % pool.length };
  }
  if (strategy === 'least-idle') {
    const sorted = [...pool].sort((a, b) => {
      const la = presenceByUser.get(a)?.lastActiveAt?.getTime() ?? 0;
      const lb = presenceByUser.get(b)?.lastActiveAt?.getTime() ?? 0;
      return la - lb; // oldest-last-active first
    });
    return { userIds: [sorted[0]!], nextRrIndex: rrIndex };
  }
  // priority: candidateIds are already in priority order
  return { userIds: [pool[0]!], nextRrIndex: rrIndex };
}

async function resolveOverflow(
  orgId: string,
  target: HuntGroup['overflowTarget'],
  targetId: string | null,
): Promise<RoutingAction> {
  if (target === 'voicemail') return { type: 'voicemail' };
  if (target === 'voicebot') return { type: 'voicebot', scenarioId: targetId ?? undefined };
  if (target === 'ivr' && targetId) {
    const menu = await db
      .select()
      .from(ivrMenus)
      .where(and(eq(ivrMenus.id, targetId), eq(ivrMenus.orgId, orgId)))
      .limit(1);
    if (menu[0]) {
      return {
        type: 'play-ivr',
        ivrId: menu[0].id,
        greeting: menu[0].greeting,
        options: menu[0].options,
        timeoutSeconds: menu[0].timeoutSeconds,
      };
    }
  }
  return { type: 'hangup' };
}

// ─── Main routing entrypoint ─────────────────────────────────────────────────

/**
 * Route an inbound call. `to` should be the DID that was dialled.
 */
export async function route(input: {
  orgId: string;
  from: string;
  to: string;
}): Promise<RoutingDecision> {
  const trace: string[] = [`inbound from=${input.from} to=${input.to}`];

  // 1. Business hours — closed?
  const bh = await getBusinessHours(input.orgId);
  if (bh && !isWithinBusinessHours(bh)) {
    trace.push(`outside business hours (tz=${bh.timezone})`);
    const overflow = await resolveOverflow(
      input.orgId,
      bh.afterHoursTarget as HuntGroup['overflowTarget'],
      bh.afterHoursTargetId,
    );
    return { action: overflow, trace };
  }

  // 2. DID → IVR menu
  const [menu] = await db
    .select()
    .from(ivrMenus)
    .where(and(eq(ivrMenus.orgId, input.orgId), eq(ivrMenus.didNumber, input.to)))
    .limit(1);
  if (menu) {
    trace.push(`matched IVR menu id=${menu.id} name="${menu.name}"`);
    return {
      action: {
        type: 'play-ivr',
        ivrId: menu.id,
        greeting: menu.greeting,
        options: menu.options,
        timeoutSeconds: menu.timeoutSeconds,
      },
      trace,
    };
  }

  // 3. No DID match, no IVR — route directly to voicebot as a default
  trace.push('no routing rule matched — falling back to voicebot');
  return { action: { type: 'voicebot' }, trace };
}

/**
 * Resolve the action for a given DTMF digit within an IVR menu.
 * Called when the provider webhook reports a DTMF collection.
 */
export async function resolveIvrChoice(
  orgId: string,
  menuId: string,
  digit: string,
): Promise<RoutingDecision> {
  const trace: string[] = [`ivr menu=${menuId} digit=${digit}`];
  const [menu] = await db
    .select()
    .from(ivrMenus)
    .where(and(eq(ivrMenus.id, menuId), eq(ivrMenus.orgId, orgId)))
    .limit(1);
  if (!menu) return { action: { type: 'hangup', reason: 'menu-missing' }, trace };

  const opt = menu.options.find((o) => o.digit === digit);
  if (!opt) {
    trace.push('no matching option — applying invalid handler');
    if (menu.invalidTarget === 'hangup') return { action: { type: 'hangup' }, trace };
    if (menu.invalidTarget === 'voicemail') return { action: { type: 'voicemail' }, trace };
    return {
      action: {
        type: 'play-ivr',
        ivrId: menu.id,
        greeting: menu.greeting,
        options: menu.options,
        timeoutSeconds: menu.timeoutSeconds,
      },
      trace,
    };
  }

  if (opt.action === 'hangup') return { action: { type: 'hangup' }, trace };
  if (opt.action === 'voicemail')
    return { action: { type: 'voicemail', mailboxId: opt.targetId }, trace };
  if (opt.action === 'voicebot')
    return { action: { type: 'voicebot', scenarioId: opt.targetId }, trace };
  if (opt.action === 'external' && opt.externalNumber) {
    return { action: { type: 'forward', number: opt.externalNumber }, trace };
  }
  if (opt.action === 'ivr-menu' && opt.targetId) {
    const [sub] = await db
      .select()
      .from(ivrMenus)
      .where(and(eq(ivrMenus.id, opt.targetId), eq(ivrMenus.orgId, orgId)))
      .limit(1);
    if (!sub) return { action: { type: 'hangup', reason: 'submenu-missing' }, trace };
    return {
      action: {
        type: 'play-ivr',
        ivrId: sub.id,
        greeting: sub.greeting,
        options: sub.options,
        timeoutSeconds: sub.timeoutSeconds,
      },
      trace,
    };
  }
  if (opt.action === 'hunt-group' && opt.targetId) {
    const [hg] = await db
      .select()
      .from(huntGroups)
      .where(and(eq(huntGroups.id, opt.targetId), eq(huntGroups.orgId, orgId)))
      .limit(1);
    if (!hg) return { action: { type: 'hangup', reason: 'hunt-group-missing' }, trace };

    const { userIds, nextRrIndex } = await pickAvailableAgents(
      orgId,
      hg.memberUserIds,
      hg.strategy as HuntGroup['strategy'],
      hg.rrIndex,
    );
    if (hg.strategy === 'round-robin' && nextRrIndex !== hg.rrIndex) {
      await db.update(huntGroups).set({ rrIndex: nextRrIndex }).where(eq(huntGroups.id, hg.id));
    }
    trace.push(`hunt group "${hg.name}" strategy=${hg.strategy} rings ${userIds.length} agent(s)`);

    const overflow = await resolveOverflow(
      orgId,
      hg.overflowTarget as HuntGroup['overflowTarget'],
      hg.overflowTargetId,
    );
    if (userIds.length === 0) {
      trace.push('no available agents — jumping straight to overflow');
      return { action: overflow, trace };
    }
    return {
      action: {
        type: 'ring-agents',
        userIds,
        ringTimeoutSeconds: hg.ringTimeoutSeconds,
        overflow,
      },
      trace,
    };
  }
  return { action: { type: 'hangup', reason: 'unresolved' }, trace };
}
