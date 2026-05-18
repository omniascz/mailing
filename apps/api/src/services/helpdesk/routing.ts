/**
 * Chat routing & assignment engine (#245).
 *
 * Strategies:
 *   round-robin  — cycle through available agents in order
 *   least-loaded — assign to agent with fewest active tickets
 *   skill-based  — filter by required skill, then least-loaded
 *   manual       — no auto-assignment; leave for a human to pick
 */

import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  agentAvailability, chatRoutingRules, ticketAssignments,
  type AgentAvailability, type ChatRoutingRule,
} from '../../db/schema/agent-availability.js';
import { helpdeskTickets } from '../../db/schema/helpdesk.js';
import { AppError } from '../../lib/app-error.js';

// ─── Agent status management ──────────────────────────────────────────────────

export async function setAgentStatus(
  orgId: string,
  userId: string,
  status: 'online' | 'away' | 'busy' | 'offline',
): Promise<AgentAvailability> {
  const [row] = await db
    .insert(agentAvailability)
    .values({ orgId, userId, status, lastActiveAt: new Date() })
    .onConflictDoUpdate({
      target: [agentAvailability.orgId, agentAvailability.userId],
      set: { status, lastActiveAt: new Date(), updatedAt: new Date() },
    })
    .returning();
  return row!;
}

export async function updateAgentProfile(
  orgId: string,
  userId: string,
  input: { maxConcurrent?: number; skills?: string[]; channels?: string[] },
): Promise<AgentAvailability> {
  const [row] = await db
    .insert(agentAvailability)
    .values({ orgId, userId, ...input })
    .onConflictDoUpdate({
      target: [agentAvailability.orgId, agentAvailability.userId],
      set: { ...input, updatedAt: new Date() },
    })
    .returning();
  return row!;
}

export async function listAgentAvailability(orgId: string): Promise<AgentAvailability[]> {
  return db.select().from(agentAvailability).where(eq(agentAvailability.orgId, orgId));
}

// ─── Routing rules CRUD ──────────────────────────────────────────────────────

export async function createRoutingRule(orgId: string, input: {
  name: string;
  channel?: string;
  strategy: ChatRoutingRule['strategy'];
  requiredSkill?: string;
  agentIds?: string[];
  priority?: number;
}): Promise<ChatRoutingRule> {
  const [row] = await db.insert(chatRoutingRules).values({ orgId, ...input }).returning();
  return row!;
}

export async function listRoutingRules(orgId: string): Promise<ChatRoutingRule[]> {
  return db.select().from(chatRoutingRules)
    .where(and(eq(chatRoutingRules.orgId, orgId), eq(chatRoutingRules.isActive, true)))
    .orderBy(asc(chatRoutingRules.priority));
}

export async function updateRoutingRule(orgId: string, ruleId: string, input: Partial<{
  name: string; channel: string; strategy: string; requiredSkill: string;
  agentIds: string[]; priority: number; isActive: boolean;
}>): Promise<ChatRoutingRule> {
  const [row] = await db.update(chatRoutingRules)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(chatRoutingRules.id, ruleId), eq(chatRoutingRules.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('Routing rule');
  return row;
}

export async function deleteRoutingRule(orgId: string, ruleId: string): Promise<void> {
  await db.delete(chatRoutingRules)
    .where(and(eq(chatRoutingRules.id, ruleId), eq(chatRoutingRules.orgId, orgId)));
}

// ─── Core assignment engine ───────────────────────────────────────────────────

export interface AssignmentResult {
  ticketId: string;
  assignedTo: string | null;
  reason: string;
  strategy: string;
}

export async function autoAssignTicket(
  orgId: string,
  ticketId: string,
  channel: string,
  requiredSkills: string[] = [],
): Promise<AssignmentResult> {
  // 1. Find the first active rule that matches the channel
  const rules = await listRoutingRules(orgId);
  const rule = rules.find(r =>
    r.isActive && (!r.channel || r.channel === channel),
  );

  const strategy = rule?.strategy ?? 'round-robin';

  if (strategy === 'manual') {
    return { ticketId, assignedTo: null, reason: 'manual', strategy };
  }

  // 2. Get available agents
  const available = await db.select().from(agentAvailability)
    .where(and(
      eq(agentAvailability.orgId, orgId),
      eq(agentAvailability.status, 'online'),
      sql`(${agentAvailability.maxConcurrent} = 0 OR ${agentAvailability.activeCount} < ${agentAvailability.maxConcurrent})`,
    ));

  let candidates = available.filter(a => {
    // Channel filter
    if (a.channels.length > 0 && !a.channels.includes(channel)) return false;
    // Skill filter (required by rule or by caller)
    const needed = requiredSkills.length > 0 ? requiredSkills : (rule?.requiredSkill ? [rule.requiredSkill] : []);
    if (needed.length > 0 && !needed.every(s => a.skills.includes(s))) return false;
    // Agent whitelist
    if (rule?.agentIds && rule.agentIds.length > 0 && !rule.agentIds.includes(a.userId)) return false;
    return true;
  });

  if (candidates.length === 0) {
    return { ticketId, assignedTo: null, reason: 'no_available_agents', strategy };
  }

  let chosen: AgentAvailability;

  if (strategy === 'round-robin') {
    // Sort by userId for a stable round-robin; in production use a Redis counter
    candidates.sort((a, b) => a.userId.localeCompare(b.userId));
    // Simple: pick the one with the lowest active count as proxy for round-robin order
    chosen = candidates.reduce((a, b) => a.activeCount <= b.activeCount ? a : b);
  } else if (strategy === 'least-loaded') {
    chosen = candidates.reduce((a, b) => a.activeCount <= b.activeCount ? a : b);
  } else if (strategy === 'skill-based') {
    // Among skill-matched candidates pick least loaded
    chosen = candidates.reduce((a, b) => a.activeCount <= b.activeCount ? a : b);
  } else {
    chosen = candidates[0]!;
  }

  // 3. Assign ticket
  await db.update(helpdeskTickets)
    .set({ assignedTo: chosen.userId, updatedAt: new Date() })
    .where(eq(helpdeskTickets.id, ticketId));

  // 4. Increment agent's active count
  await db.update(agentAvailability)
    .set({ activeCount: sql`${agentAvailability.activeCount} + 1`, updatedAt: new Date() })
    .where(eq(agentAvailability.id, chosen.id));

  // 5. Log assignment
  await db.insert(ticketAssignments).values({
    orgId,
    ticketId,
    assignedTo: chosen.userId,
    reason: `auto-${strategy}`,
  });

  return { ticketId, assignedTo: chosen.userId, reason: `auto-${strategy}`, strategy };
}

export async function manualAssignTicket(
  orgId: string,
  ticketId: string,
  assignedTo: string,
  assignedBy: string,
): Promise<void> {
  const [ticket] = await db.select({ assignedTo: helpdeskTickets.assignedTo })
    .from(helpdeskTickets)
    .where(and(eq(helpdeskTickets.id, ticketId), eq(helpdeskTickets.orgId, orgId)))
    .limit(1);
  if (!ticket) throw AppError.notFound('Ticket');

  // Decrement previous agent's count
  if (ticket.assignedTo && ticket.assignedTo !== assignedTo) {
    await db.update(agentAvailability)
      .set({ activeCount: sql`GREATEST(${agentAvailability.activeCount} - 1, 0)`, updatedAt: new Date() })
      .where(and(eq(agentAvailability.orgId, orgId), eq(agentAvailability.userId, ticket.assignedTo)));
  }

  await db.update(helpdeskTickets)
    .set({ assignedTo, updatedAt: new Date() })
    .where(eq(helpdeskTickets.id, ticketId));

  if (!ticket.assignedTo || ticket.assignedTo !== assignedTo) {
    await db.update(agentAvailability)
      .set({ activeCount: sql`${agentAvailability.activeCount} + 1`, updatedAt: new Date() })
      .where(and(eq(agentAvailability.orgId, orgId), eq(agentAvailability.userId, assignedTo)));
  }

  await db.insert(ticketAssignments).values({ orgId, ticketId, assignedTo, assignedBy, reason: 'manual' });
}

export async function releaseTicket(orgId: string, _ticketId: string, agentId: string): Promise<void> {
  await db.update(agentAvailability)
    .set({ activeCount: sql`GREATEST(${agentAvailability.activeCount} - 1, 0)`, updatedAt: new Date() })
    .where(and(eq(agentAvailability.orgId, orgId), eq(agentAvailability.userId, agentId)));
}
