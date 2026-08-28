/**
 * Inbound rule engine — evaluate per-tenant receipt rules against received
 * mail, plus CRUD. Replaces the hardcoded routing in the inbound-email service.
 */

import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  inboundRules,
  type InboundRule,
  type InboundAction,
  type InboundRuleMatch,
} from '../../db/schema/inbound-rules.js';
import { AppError } from '../../lib/app-error.js';
import { env } from '../../config/env.js';

export interface InboundMessageMeta {
  to: string;
  from: string;
  subject: string | null;
}

function safeTest(pattern: string | undefined, value: string): boolean {
  if (!pattern) return true; // no constraint = matches
  try {
    return new RegExp(pattern, 'i').test(value);
  } catch {
    return false; // invalid regex never matches
  }
}

function ruleMatches(match: InboundRuleMatch, msg: InboundMessageMeta): boolean {
  return (
    safeTest(match.recipientPattern, msg.to) &&
    safeTest(match.fromPattern, msg.from) &&
    safeTest(match.subjectPattern, msg.subject ?? '')
  );
}

/**
 * Pure: evaluate ordered rules against a message → the actions to run. Rules
 * are applied by ascending priority; a matched 'stop' action halts evaluation
 * (its own actions before 'stop' still count).
 */
export function evaluateInboundRules(
  rules: Array<Pick<InboundRule, 'priority' | 'active' | 'match' | 'actions'>>,
  msg: InboundMessageMeta,
): InboundAction[] {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  const out: InboundAction[] = [];
  for (const r of sorted) {
    if (!r.active) continue;
    if (!ruleMatches(r.match, msg)) continue;
    for (const a of r.actions) {
      if (a.type === 'stop') return out;
      out.push(a);
    }
  }
  return out;
}

/** Default routing when an org has no custom inbound rules configured. */
export function defaultInboundActions(msg: InboundMessageMeta): InboundAction[] {
  const local = (msg.to.split('@')[0] ?? '').toLowerCase();
  if (/^(support|help|hello|contact)\b/.test(local)) {
    return [{ type: 'helpdesk' }];
  }
  return [{ type: 'workflow_event', eventName: 'email_reply_received' }];
}

/** Load an org's rules and resolve the actions for a message (or defaults). */
export async function resolveInboundActions(
  orgId: string,
  msg: InboundMessageMeta,
): Promise<InboundAction[]> {
  const rules = await db
    .select({
      priority: inboundRules.priority,
      active: inboundRules.active,
      match: inboundRules.match,
      actions: inboundRules.actions,
    })
    .from(inboundRules)
    .where(and(eq(inboundRules.orgId, orgId), eq(inboundRules.active, true)))
    .orderBy(asc(inboundRules.priority));

  if (rules.length === 0) return withReachableTargets(defaultInboundActions(msg));
  const actions = evaluateInboundRules(rules, msg);
  // If custom rules exist but none matched, fall back to defaults so mail is
  // never silently lost.
  return withReachableTargets(actions.length > 0 ? actions : defaultInboundActions(msg));
}

/**
 * Drop actions whose destination the customer cannot reach.
 *
 * Helpdesk is a beyond-core domain: with FEATURE_BEYOND_CORE off its routes are
 * not registered, so `GET /api/v1/helpdesk/tickets` answers 404. Opening a
 * ticket there would file the mail somewhere nobody can read it — the same
 * shape of defect as a campaign that can never close, and worse for being
 * customer data.
 *
 * `openTicket` still exists and still works; what changes is that nothing calls
 * it on a deployment where the reader is switched off. Turn the flag on and the
 * default routing is exactly as before.
 *
 * The substitution matters as much as the removal. The mail itself is already
 * stored — `receiveInbound` inserts the `inbound_emails` row before any action
 * runs, and `listInbound`/`getInbound` are core routes — so nothing is lost by
 * not opening a ticket. Replacing the action with the workflow event rather
 * than dropping it means a message to support@ still reaches automation, which
 * is what every other address already gets from `defaultInboundActions`.
 *
 * Applies to configured rules as well as to the defaults: an operator can write
 * a helpdesk rule through the (core) inbound-rules API, and the ticket it
 * produced would be exactly as unreadable.
 */
function withReachableTargets(actions: InboundAction[]): InboundAction[] {
  if (env.FEATURE_BEYOND_CORE) return actions;

  const out: InboundAction[] = [];
  let substituted = false;
  for (const a of actions) {
    if (a.type !== 'helpdesk') {
      out.push(a);
      continue;
    }
    // One substitute even if several rules asked for a ticket — the event is
    // about the message, and firing it twice would run the automation twice.
    if (!substituted) {
      substituted = true;
      out.push({ type: 'workflow_event', eventName: 'email_reply_received' });
    }
  }
  return out;
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function listInboundRules(orgId: string): Promise<InboundRule[]> {
  return db
    .select()
    .from(inboundRules)
    .where(eq(inboundRules.orgId, orgId))
    .orderBy(asc(inboundRules.priority));
}

export async function createInboundRule(
  orgId: string,
  input: {
    name: string;
    priority?: number;
    active?: boolean;
    match?: InboundRuleMatch;
    actions: InboundAction[];
  },
): Promise<InboundRule> {
  const [row] = await db
    .insert(inboundRules)
    .values({
      orgId,
      name: input.name,
      priority: input.priority ?? 100,
      active: input.active ?? true,
      match: input.match ?? {},
      actions: input.actions,
    })
    .returning();
  return row!;
}

export async function updateInboundRule(
  orgId: string,
  id: string,
  patch: Partial<{
    name: string;
    priority: number;
    active: boolean;
    match: InboundRuleMatch;
    actions: InboundAction[];
  }>,
): Promise<InboundRule> {
  const [row] = await db
    .update(inboundRules)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(inboundRules.id, id), eq(inboundRules.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('InboundRule');
  return row;
}

export async function deleteInboundRule(orgId: string, id: string): Promise<void> {
  const [row] = await db
    .delete(inboundRules)
    .where(and(eq(inboundRules.id, id), eq(inboundRules.orgId, orgId)))
    .returning({ id: inboundRules.id });
  if (!row) throw AppError.notFound('InboundRule');
}
