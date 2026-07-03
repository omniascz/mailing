/**
 * Parse a `scheduled_at` value into a Date. Accepts an ISO 8601 timestamp OR a
 * small set of natural-language forms (Resend parity), dependency-free:
 *   "in 5 minutes" / "in 2 hours" / "in 1 day" / "in 3 weeks" / "in an hour"
 *   "tomorrow" / "tomorrow at 9am" / "tomorrow at 14:30"
 *   "next week"
 * Returns null when the value can't be understood. `now` is injectable for tests.
 */

const UNIT_MS: Record<string, number> = {
  second: 1_000,
  sec: 1_000,
  minute: 60_000,
  min: 60_000,
  hour: 3_600_000,
  hr: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** Parse "9am" / "9:30pm" / "14:30" → {h, m}, or null. */
function parseTimeOfDay(s: string): { h: number; m: number } | null {
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = parseInt(m[1]!, 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3]?.toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

export function parseScheduledAt(input: string, now: Date = new Date()): Date | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  // 1. ISO timestamp.
  if (ISO_RE.test(raw)) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = raw.toLowerCase();

  // 2. "in N <unit>" (N may be a number or a/an).
  const inMatch = s.match(/^in\s+(\d+|a|an)\s*([a-z]+?)s?$/);
  if (inMatch) {
    const n = inMatch[1] === 'a' || inMatch[1] === 'an' ? 1 : parseInt(inMatch[1]!, 10);
    const unitMs = UNIT_MS[inMatch[2]!];
    if (unitMs && n >= 0) return new Date(now.getTime() + n * unitMs);
    return null;
  }

  // 3. "tomorrow" [at <time>].
  const tomMatch = s.match(/^tomorrow(?:\s+at\s+(.+))?$/);
  if (tomMatch) {
    const d = new Date(now.getTime() + UNIT_MS.day!);
    if (tomMatch[1]) {
      const t = parseTimeOfDay(tomMatch[1]);
      if (!t) return null;
      d.setHours(t.h, t.m, 0, 0);
    }
    return d;
  }

  // 4. "next week".
  if (s === 'next week') return new Date(now.getTime() + 7 * UNIT_MS.day!);

  return null;
}
