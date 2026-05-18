/**
 * Abuse detection service.
 *
 * Core responsibilities:
 *  - Evaluate signals against configured rules (threshold + window)
 *  - Raise abuse_events when a threshold is tripped
 *  - Enforce sanctions (throttle, pause, suspend) on the sending path
 *  - Track spam trap / honeypot hits
 *  - Provide admin-facing lookup & resolution APIs
 *
 * Signal collection itself is plumbed by the workers layer (bounce/complaint
 * aggregators, campaign finish hooks, …) and callers invoke `evaluateSignal()`.
 */

import { and, eq, desc, sql, isNull, gt, or } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import {
  abuseRules,
  abuseEvents,
  abuseSanctions,
  spamTraps,
  spamTrapHits,
  campaigns,
  type AbuseRule,
  type AbuseEvent,
  type AbuseSanction,
  type SpamTrap,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export type SignalType =
  | 'high_bounce_rate'
  | 'high_complaint_rate'
  | 'spam_trap_hit'
  | 'honeypot_hit'
  | 'volume_spike'
  | 'list_quality_low'
  | 'new_account_high_volume'
  | 'blacklist_hit'
  | 'content_spam_score'
  | 'suspicious_login'
  | 'api_abuse'
  | 'credential_stuffing'
  | 'stale_list_send';

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type Action =
  | 'none'
  | 'alert'
  | 'throttle'
  | 'pause_campaigns'
  | 'suspend_sending'
  | 'suspend_account'
  | 'require_review';

// ─── Default system rules (seeded on first use) ───────────────────────────────

export const DEFAULT_SYSTEM_RULES: Array<{
  name: string;
  description: string;
  signalType: SignalType;
  threshold: number;
  windowMinutes: number;
  minSampleSize: number;
  severity: Severity;
  action: Action;
}> = [
  {
    name: 'High bounce rate',
    description: 'Bounce rate >5% over the last hour',
    signalType: 'high_bounce_rate',
    threshold: 5,
    windowMinutes: 60,
    minSampleSize: 100,
    severity: 'high',
    action: 'throttle',
  },
  {
    name: 'Critical bounce rate',
    description: 'Bounce rate >10% — auto-pause campaigns',
    signalType: 'high_bounce_rate',
    threshold: 10,
    windowMinutes: 60,
    minSampleSize: 100,
    severity: 'critical',
    action: 'pause_campaigns',
  },
  {
    name: 'High complaint rate',
    description: 'Complaints >0.3% — ESP/Gmail thresholds',
    signalType: 'high_complaint_rate',
    threshold: 0.3,
    windowMinutes: 120,
    minSampleSize: 500,
    severity: 'high',
    action: 'throttle',
  },
  {
    name: 'Critical complaint rate',
    description: 'Complaints >1% — suspend sending immediately',
    signalType: 'high_complaint_rate',
    threshold: 1.0,
    windowMinutes: 120,
    minSampleSize: 500,
    severity: 'critical',
    action: 'suspend_sending',
  },
  {
    name: 'Spam trap hit',
    description: 'Any spam trap hit — investigate list hygiene',
    signalType: 'spam_trap_hit',
    threshold: 1,
    windowMinutes: 1440,
    minSampleSize: 1,
    severity: 'high',
    action: 'alert',
  },
  {
    name: 'Multiple spam trap hits',
    description: '≥3 spam trap hits in 24h — pause campaigns',
    signalType: 'spam_trap_hit',
    threshold: 3,
    windowMinutes: 1440,
    minSampleSize: 1,
    severity: 'critical',
    action: 'pause_campaigns',
  },
  {
    name: 'Volume spike',
    description: 'Daily volume 10× prior week — require review',
    signalType: 'volume_spike',
    threshold: 10,
    windowMinutes: 1440,
    minSampleSize: 1000,
    severity: 'medium',
    action: 'require_review',
  },
  {
    name: 'New account high volume',
    description: 'New account (<7d) sending >10k/day',
    signalType: 'new_account_high_volume',
    threshold: 10000,
    windowMinutes: 1440,
    minSampleSize: 0,
    severity: 'medium',
    action: 'require_review',
  },
  {
    name: 'Credential stuffing detected',
    description: '≥20 failed logins from same IP in 5min',
    signalType: 'credential_stuffing',
    threshold: 20,
    windowMinutes: 5,
    minSampleSize: 0,
    severity: 'high',
    action: 'alert',
  },
];

export async function seedSystemRules(): Promise<{ inserted: number }> {
  let inserted = 0;
  for (const r of DEFAULT_SYSTEM_RULES) {
    const existing = await db
      .select({ id: abuseRules.id })
      .from(abuseRules)
      .where(and(isNull(abuseRules.orgId), eq(abuseRules.name, r.name)))
      .limit(1);
    if (existing.length > 0) continue;
    await db.insert(abuseRules).values({
      orgId: null,
      name: r.name,
      description: r.description,
      signalType: r.signalType,
      threshold: String(r.threshold),
      windowMinutes: r.windowMinutes,
      minSampleSize: r.minSampleSize,
      severity: r.severity,
      action: r.action,
    });
    inserted += 1;
  }
  return { inserted };
}

// ─── Rules management ────────────────────────────────────────────────────────

export async function listRules(orgId: string | null): Promise<AbuseRule[]> {
  const where = orgId
    ? or(eq(abuseRules.orgId, orgId), isNull(abuseRules.orgId))
    : isNull(abuseRules.orgId);
  return db.select().from(abuseRules).where(where!).orderBy(desc(abuseRules.severity));
}

export async function createRule(
  orgId: string,
  input: {
    name: string;
    description?: string;
    signalType: SignalType;
    threshold: number;
    windowMinutes?: number;
    minSampleSize?: number;
    severity?: Severity;
    action?: Action;
    enabled?: boolean;
  },
): Promise<AbuseRule> {
  const [row] = await db
    .insert(abuseRules)
    .values({
      orgId,
      name: input.name,
      description: input.description,
      signalType: input.signalType,
      threshold: String(input.threshold),
      windowMinutes: input.windowMinutes ?? 60,
      minSampleSize: input.minSampleSize ?? 100,
      severity: input.severity ?? 'medium',
      action: input.action ?? 'alert',
      enabled: input.enabled ?? true,
    })
    .returning();
  return row!;
}

export async function updateRule(
  orgId: string,
  ruleId: string,
  patch: Partial<{
    name: string;
    description: string;
    threshold: number;
    windowMinutes: number;
    minSampleSize: number;
    severity: Severity;
    action: Action;
    enabled: boolean;
  }>,
): Promise<AbuseRule> {
  const [existing] = await db
    .select()
    .from(abuseRules)
    .where(and(eq(abuseRules.id, ruleId), eq(abuseRules.orgId, orgId)))
    .limit(1);
  if (!existing) throw AppError.notFound('AbuseRule');

  const dbPatch: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.threshold !== undefined) dbPatch.threshold = String(patch.threshold);
  if (patch.windowMinutes !== undefined) dbPatch.windowMinutes = patch.windowMinutes;
  if (patch.minSampleSize !== undefined) dbPatch.minSampleSize = patch.minSampleSize;
  if (patch.severity !== undefined) dbPatch.severity = patch.severity;
  if (patch.action !== undefined) dbPatch.action = patch.action;
  if (patch.enabled !== undefined) dbPatch.enabled = patch.enabled;

  const [row] = await db
    .update(abuseRules)
    .set(dbPatch)
    .where(eq(abuseRules.id, ruleId))
    .returning();
  return row!;
}

// ─── Signal evaluation ────────────────────────────────────────────────────────

/**
 * Evaluate a live signal against all enabled rules for that signal type.
 * If any rule trips, raises an abuse_event and applies the rule's action.
 *
 * Caller (workers) provides the observed value + sample size for the
 * rule's configured window. It's up to the caller to aggregate the window
 * (e.g. compute bounce rate over the last 60min from ClickHouse).
 */
export async function evaluateSignal(params: {
  orgId: string;
  signalType: SignalType;
  observedValue: number;
  sampleSize: number;
  campaignId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}): Promise<AbuseEvent[]> {
  const rules = await db
    .select()
    .from(abuseRules)
    .where(
      and(
        eq(abuseRules.signalType, params.signalType),
        eq(abuseRules.enabled, true),
        or(isNull(abuseRules.orgId), eq(abuseRules.orgId, params.orgId)),
      ),
    );

  const raised: AbuseEvent[] = [];

  for (const rule of rules) {
    if (params.sampleSize < rule.minSampleSize) continue;
    const threshold = Number(rule.threshold);
    if (params.observedValue < threshold) continue;

    const summary = `${rule.name}: observed ${params.observedValue} ≥ threshold ${threshold} (N=${params.sampleSize})`;

    const [event] = await db
      .insert(abuseEvents)
      .values({
        orgId: params.orgId,
        ruleId: rule.id,
        signalType: params.signalType,
        severity: rule.severity,
        observedValue: String(params.observedValue),
        threshold: String(threshold),
        sampleSize: params.sampleSize,
        summary,
        metadata: params.metadata ?? {},
        campaignId: params.campaignId,
        ipAddress: params.ipAddress,
        actionTaken: rule.action,
      })
      .returning();

    raised.push(event!);

    // Enforce the action: create a sanction if appropriate
    if (rule.action !== 'none' && rule.action !== 'alert' && rule.action !== 'require_review') {
      await createSanctionForEvent(event!, rule);
    }
  }

  return raised;
}

async function createSanctionForEvent(event: AbuseEvent, rule: AbuseRule): Promise<void> {
  const now = new Date();
  // Sanctions expire after window *10 minutes unless suspending indefinitely
  const ttlMin = rule.action === 'suspend_account' ? null : rule.windowMinutes * 10;
  const expiresAt = ttlMin ? new Date(now.getTime() + ttlMin * 60 * 1000) : null;

  // Throttle rate scaling by severity
  const throttleRate =
    rule.action === 'throttle'
      ? rule.severity === 'critical'
        ? 100
        : rule.severity === 'high'
          ? 500
          : 1000
      : 0;

  await db.insert(abuseSanctions).values({
    orgId: event.orgId,
    eventId: event.id,
    action: rule.action,
    reason: event.summary,
    throttleRatePerHour: throttleRate,
    expiresAt,
  });

  // If pause_campaigns: flip any running campaign to paused
  if (rule.action === 'pause_campaigns') {
    await db
      .update(campaigns)
      .set({ status: 'paused', updatedAt: now })
      .where(and(eq(campaigns.orgId, event.orgId), eq(campaigns.status, 'sending')));
  }
}

// ─── Events / sanctions listings ──────────────────────────────────────────────

export async function listEvents(
  orgId: string,
  opts: { status?: string; severity?: string; limit?: number } = {},
): Promise<AbuseEvent[]> {
  const conditions = [eq(abuseEvents.orgId, orgId)];
  if (opts.status)
    conditions.push(
      eq(abuseEvents.status, opts.status as typeof abuseEvents.status.enumValues[number]),
    );
  if (opts.severity)
    conditions.push(
      eq(abuseEvents.severity, opts.severity as typeof abuseEvents.severity.enumValues[number]),
    );
  return db
    .select()
    .from(abuseEvents)
    .where(and(...conditions))
    .orderBy(desc(abuseEvents.createdAt))
    .limit(Math.min(opts.limit ?? 100, 500));
}

export async function getEvent(orgId: string, eventId: string): Promise<AbuseEvent> {
  const [row] = await db
    .select()
    .from(abuseEvents)
    .where(and(eq(abuseEvents.id, eventId), eq(abuseEvents.orgId, orgId)))
    .limit(1);
  if (!row) throw AppError.notFound('AbuseEvent');
  return row;
}

export async function resolveEvent(
  orgId: string,
  eventId: string,
  actorId: string,
  resolution: {
    status: 'acknowledged' | 'investigating' | 'resolved' | 'false_positive';
    notes?: string;
  },
): Promise<AbuseEvent> {
  await getEvent(orgId, eventId);
  const [row] = await db
    .update(abuseEvents)
    .set({
      status: resolution.status,
      resolvedBy: actorId,
      resolvedAt: new Date(),
      resolutionNotes: resolution.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(abuseEvents.id, eventId))
    .returning();

  // If marked false_positive or resolved, optionally lift linked sanctions
  if (resolution.status === 'false_positive' || resolution.status === 'resolved') {
    await db
      .update(abuseSanctions)
      .set({ active: false, liftedAt: new Date(), liftedBy: actorId, updatedAt: new Date() })
      .where(and(eq(abuseSanctions.eventId, eventId), eq(abuseSanctions.active, true)));
  }

  return row!;
}

export async function listActiveSanctions(orgId: string): Promise<AbuseSanction[]> {
  return db
    .select()
    .from(abuseSanctions)
    .where(
      and(
        eq(abuseSanctions.orgId, orgId),
        eq(abuseSanctions.active, true),
        or(isNull(abuseSanctions.expiresAt), gt(abuseSanctions.expiresAt, new Date())),
      ),
    )
    .orderBy(desc(abuseSanctions.createdAt));
}

/**
 * Lift a sanction manually (admin override).
 */
export async function liftSanction(
  orgId: string,
  sanctionId: string,
  actorId: string,
): Promise<AbuseSanction> {
  const [existing] = await db
    .select()
    .from(abuseSanctions)
    .where(and(eq(abuseSanctions.id, sanctionId), eq(abuseSanctions.orgId, orgId)))
    .limit(1);
  if (!existing) throw AppError.notFound('AbuseSanction');
  const [row] = await db
    .update(abuseSanctions)
    .set({
      active: false,
      liftedBy: actorId,
      liftedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(abuseSanctions.id, sanctionId))
    .returning();
  return row!;
}

/**
 * Check if the org may send right now. Returns the most-restrictive active
 * sanction, or null if sending is allowed.
 */
export async function checkSendingAllowed(
  orgId: string,
): Promise<{ allowed: boolean; sanction?: AbuseSanction; throttleRatePerHour?: number }> {
  const sanctions = await listActiveSanctions(orgId);
  if (sanctions.length === 0) return { allowed: true };

  // Block actions come first
  const blocking = sanctions.find((s) =>
    ['suspend_sending', 'suspend_account', 'pause_campaigns'].includes(s.action),
  );
  if (blocking) return { allowed: false, sanction: blocking };

  // Otherwise return the tightest throttle
  const throttles = sanctions
    .filter((s) => s.action === 'throttle' && s.throttleRatePerHour > 0)
    .sort((a, b) => a.throttleRatePerHour - b.throttleRatePerHour);
  if (throttles.length > 0) {
    return { allowed: true, sanction: throttles[0], throttleRatePerHour: throttles[0]!.throttleRatePerHour };
  }
  return { allowed: true };
}

// ─── Spam traps ───────────────────────────────────────────────────────────────

function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export async function addSpamTrap(input: {
  email: string;
  trapType: 'pristine' | 'recycled' | 'typo' | 'honeypot';
  source?: string;
}): Promise<SpamTrap> {
  const emailHash = hashEmail(input.email);
  const [row] = await db
    .insert(spamTraps)
    .values({
      emailHash,
      trapType: input.trapType,
      source: input.source ?? 'internal',
    })
    .onConflictDoUpdate({
      target: spamTraps.emailHash,
      set: { active: true, trapType: input.trapType },
    })
    .returning();
  return row!;
}

/**
 * Called by the splitter / sender when processing a recipient.
 * If the address is a known trap, records a hit and raises a `spam_trap_hit` signal.
 */
export async function checkSpamTrap(params: {
  orgId: string;
  email: string;
  campaignId?: string;
}): Promise<{ isTrap: boolean; trap?: SpamTrap }> {
  const emailHash = hashEmail(params.email);
  const [trap] = await db
    .select()
    .from(spamTraps)
    .where(and(eq(spamTraps.emailHash, emailHash), eq(spamTraps.active, true)))
    .limit(1);

  if (!trap) return { isTrap: false };

  await db.insert(spamTrapHits).values({
    orgId: params.orgId,
    trapId: trap.id,
    campaignId: params.campaignId,
    emailHash,
  });

  // Count hits in the last 24h and evaluate signal
  const rows = (await db.execute<{ cnt: string }>(sql`
    SELECT COUNT(*)::text AS cnt FROM spam_trap_hits
    WHERE org_id = ${params.orgId}::uuid AND hit_at > NOW() - INTERVAL '1 day'
  `)) as unknown as Array<{ cnt: string }>;
  const cnt = rows[0]?.cnt ?? '0';

  await evaluateSignal({
    orgId: params.orgId,
    signalType: 'spam_trap_hit',
    observedValue: Number(cnt),
    sampleSize: 1,
    campaignId: params.campaignId,
    metadata: { trapType: trap.trapType, source: trap.source },
  });

  return { isTrap: true, trap };
}

/**
 * Reaper: expire sanctions that have hit their expiresAt time. Run by scheduler.
 */
export async function expireStaleSanctions(): Promise<{ expired: number }> {
  const now = new Date();
  const rows = await db
    .update(abuseSanctions)
    .set({ active: false, liftedAt: now, updatedAt: now })
    .where(and(eq(abuseSanctions.active, true), sql`${abuseSanctions.expiresAt} <= ${now}`))
    .returning();
  return { expired: rows.length };
}
