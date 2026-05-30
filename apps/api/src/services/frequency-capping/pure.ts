/**
 * Cross-channel frequency-cap helpers — pure (§9 P1).
 *
 * Decision pieces extracted so the orchestrator stays focused on Redis
 * + DB I/O. Tests target:
 *   • priority bypass (transactional vs marketing)
 *   • quiet-hours arithmetic incl. midnight wrap + IANA TZ
 *   • engagement-band gating
 *   • multi-rule precedence (strictest wins on conflict)
 */

export type MessagePriority = 'transactional' | 'marketing' | 'promotional';

export type EngagementBand =
  | 'highly_engaged'
  | 'engaged'
  | 'at_risk'
  | 'dormant'
  | 'cold';

/**
 * Priority ranks — *lower* number = more critical. transactional is most
 * critical (0); promotional is least critical (2).
 *
 * Rule's `priorityFloor` says "messages at or above this priority bypass
 * the cap". `transactional` floor → only transactional bypasses;
 * `marketing` floor → marketing + transactional bypass.
 */
const PRIORITY_RANK: Record<MessagePriority, number> = {
  transactional: 0,
  marketing: 1,
  promotional: 2,
};

/**
 * True when a message's priority is high enough to bypass the rule's
 * floor. If no floor is set, the message never bypasses (rule always
 * applies).
 */
export function priorityBypasses(
  priority: MessagePriority,
  ruleFloor: string | null | undefined,
): boolean {
  if (!ruleFloor) return false;
  const floor = PRIORITY_RANK[ruleFloor as MessagePriority];
  if (floor === undefined) return false;
  return PRIORITY_RANK[priority] <= floor;
}

/**
 * True when the rule applies to the contact's current engagement band.
 * Null band on the rule means "all bands".
 */
export function ruleMatchesBand(
  contactBand: EngagementBand | null | undefined,
  ruleBand: string | null | undefined,
): boolean {
  if (!ruleBand) return true;
  if (!contactBand) return false; // rule is band-scoped but contact has no band yet
  return ruleBand === contactBand;
}

// ─── Quiet hours ──────────────────────────────────────────────────────────

/**
 * Compute the local hour-of-day (0..23) for `now` in an IANA timezone.
 * Uses Intl.DateTimeFormat so we don't carry a timezone DB.
 * Returns null when the timezone is unknown / invalid.
 */
export function localHourIn(timezone: string, now: Date = new Date()): number | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    });
    const hourString = fmt.format(now);
    // Some locales emit "24" for 24:00; clamp.
    const h = parseInt(hourString, 10);
    if (!Number.isFinite(h)) return null;
    if (h === 24) return 0;
    if (h < 0 || h > 23) return null;
    return h;
  } catch {
    return null;
  }
}

/**
 * True when `hour` falls in [start, end). When start > end the window
 * wraps midnight (e.g. 22→8 means 22-23 + 0-7). When start === end the
 * window is empty (no quiet hours).
 */
export function hourInWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  // wraps midnight
  return hour >= start || hour < end;
}

export interface QuietHoursCheckInput {
  start: number | null | undefined;
  end: number | null | undefined;
  timezone: string | null | undefined;
  now?: Date;
}

/**
 * Returns true when the rule's quiet-hours window is active for the
 * given `now` instant. False when no window is configured, the timezone
 * is invalid, or hour is outside the window.
 */
export function isInQuietHours(input: QuietHoursCheckInput): boolean {
  if (input.start === null || input.start === undefined) return false;
  if (input.end === null || input.end === undefined) return false;
  if (!input.timezone) return false;
  if (!Number.isInteger(input.start) || input.start < 0 || input.start > 23) return false;
  if (!Number.isInteger(input.end) || input.end < 0 || input.end > 23) return false;

  const hour = localHourIn(input.timezone, input.now ?? new Date());
  if (hour === null) return false;
  return hourInWindow(hour, input.start, input.end);
}

// ─── Multi-rule precedence ────────────────────────────────────────────────

export interface AnyRule {
  maxCount: number;
  periodHours: number;
  channel: string;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
  timezone?: string | null;
  engagementBand?: string | null;
  priorityFloor?: string | null;
}

/**
 * Strictness ranking: for two rules covering overlapping (contact,
 * channel, priority, band) tuples, the one allowing the fewest sends per
 * hour wins. We compute sends-per-hour = maxCount / periodHours; lower
 * means stricter.
 */
export function strictnessSendsPerHour(rule: Pick<AnyRule, 'maxCount' | 'periodHours'>): number {
  if (rule.periodHours <= 0) return Infinity;
  return rule.maxCount / rule.periodHours;
}

export function pickStrictestRule<T extends AnyRule>(rules: T[]): T | null {
  if (rules.length === 0) return null;
  let strictest = rules[0]!;
  let strictestScore = strictnessSendsPerHour(strictest);
  for (let i = 1; i < rules.length; i++) {
    const r = rules[i]!;
    const s = strictnessSendsPerHour(r);
    if (s < strictestScore) {
      strictest = r;
      strictestScore = s;
    }
  }
  return strictest;
}

/**
 * Filter rules to only those applicable to (channel, priority, band).
 * The 'all' channel applies to every channel.
 */
export function filterApplicableRules<T extends AnyRule>(
  rules: T[],
  channel: string,
  priority: MessagePriority,
  contactBand: EngagementBand | null | undefined,
): T[] {
  return rules.filter((r) => {
    if (r.channel !== 'all' && r.channel !== channel) return false;
    if (priorityBypasses(priority, r.priorityFloor)) return false;
    if (!ruleMatchesBand(contactBand, r.engagementBand)) return false;
    return true;
  });
}

// ─── Suppression reasons (string enum used by the orchestrator) ───────────

export type SuppressionReason = 'cap_exceeded' | 'quiet_hours' | 'band_locked';
