/**
 * Cloud Phone pure helpers (#403).
 *
 * Business-hours scheduling, E.164 normalisation and hunt-group pool
 * selection as pure functions that are exercised independently of the DB.
 */

export interface BusinessHoursSchedule {
  /** 0 = Sunday … 6 = Saturday */
  day: number;
  /** Minutes from midnight (e.g. 09:00 = 540) */
  openMinutes: number;
  closeMinutes: number;
}

export interface BusinessHoursHoliday {
  /** ISO date `YYYY-MM-DD` in the org's timezone */
  date: string;
  label?: string;
}

export interface BusinessHoursConfig {
  timezone: string;
  schedule: BusinessHoursSchedule[];
  holidays?: BusinessHoursHoliday[];
}

/**
 * Is the given instant within business hours, evaluated in the org's
 * timezone? When schedule is empty we treat as always-open (off-hours
 * routing is opt-in).
 */
export function isWithinBusinessHours(bh: BusinessHoursConfig, at: Date = new Date()): boolean {
  if (!bh.schedule || bh.schedule.length === 0) return true;

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
  const hour = Number(p('hour'));
  // Intl may return "24" for midnight in some locales; normalise to 0.
  const normHour = hour === 24 ? 0 : hour;
  const minutes = normHour * 60 + Number(p('minute'));
  const iso = `${p('year')}-${p('month')}-${p('day')}`;

  if (bh.holidays?.some((h) => h.date === iso)) return false;

  return bh.schedule.some(
    (entry) => entry.day === day && minutes >= entry.openMinutes && minutes < entry.closeMinutes,
  );
}

// ─── E.164 normalisation ────────────────────────────────────────────────────

/**
 * Best-effort E.164 normaliser for inbound CLI / outbound dial numbers.
 * Strips decorations, adds a leading `+` when missing, and validates the
 * length range 8–15 digits per E.164.
 */
export function normalizeE164(input: string, defaultCountryCode = '420'): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/[^+\d]/g, '');
  if (digits.startsWith('+')) {
    digits = '+' + digits.slice(1).replace(/\D/g, '');
  } else if (digits.startsWith('00')) {
    digits = '+' + digits.slice(2);
  } else if (digits.length >= 9 && !digits.startsWith('+')) {
    // CZ local number → add default country code
    digits = `+${defaultCountryCode}${digits}`;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) return null;
  return digits;
}

// ─── Hunt-group pool selection ──────────────────────────────────────────────

export type HuntStrategy = 'ring-all' | 'round-robin' | 'least-idle' | 'fewest-calls';

export interface AgentPresence {
  userId: string;
  status: 'available' | 'busy' | 'away' | 'offline';
  lastActiveAt?: Date | null;
  callsToday?: number;
}

export interface PoolResult {
  userIds: string[];
  nextRrIndex: number;
}

/**
 * Select the agents to ring for an inbound call given a hunt strategy and
 * current presence data. Pure over inputs; the service layer reads
 * agent_presence rows and passes them in.
 */
export function selectHuntPool(
  candidates: string[],
  presence: AgentPresence[],
  strategy: HuntStrategy,
  rrIndex = 0,
): PoolResult {
  if (candidates.length === 0) return { userIds: [], nextRrIndex: 0 };

  const presenceByUser = new Map(presence.map((p) => [p.userId, p]));
  const available = candidates.filter((id) => presenceByUser.get(id)?.status === 'available');
  const pool = available.length > 0 ? available : candidates;

  if (strategy === 'ring-all') {
    return { userIds: pool, nextRrIndex: rrIndex };
  }

  if (strategy === 'round-robin') {
    const idx = rrIndex % pool.length;
    return { userIds: [pool[idx]!], nextRrIndex: (idx + 1) % pool.length };
  }

  if (strategy === 'least-idle') {
    const sorted = [...pool].sort((a, b) => {
      const la = presenceByUser.get(a)?.lastActiveAt?.getTime() ?? 0;
      const lb = presenceByUser.get(b)?.lastActiveAt?.getTime() ?? 0;
      return lb - la; // most-recently-active first (i.e. least idle)
    });
    return { userIds: [sorted[0]!], nextRrIndex: rrIndex };
  }

  if (strategy === 'fewest-calls') {
    const sorted = [...pool].sort((a, b) => {
      const ca = presenceByUser.get(a)?.callsToday ?? 0;
      const cb = presenceByUser.get(b)?.callsToday ?? 0;
      return ca - cb;
    });
    return { userIds: [sorted[0]!], nextRrIndex: rrIndex };
  }

  return { userIds: pool, nextRrIndex: rrIndex };
}
