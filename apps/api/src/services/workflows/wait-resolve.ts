/**
 * Resolve an event-relative `wait { until: { field, offsetHours } }` node against
 * the run's data payload (pure).
 *
 * Templates schedule day-of reminders as e.g.
 *   { until: { field: 'event.starts_at', offsetHours: -24 } }
 * meaning "24h before the event start". The executor needs a concrete Date; this
 * reads the referenced field from run.data (dot-path, snake/camel tolerant),
 * parses it as a date and applies the offset. Returns null when the field is
 * absent or unparseable so the caller can decide (skip the wait rather than
 * block the run forever).
 */

export interface EventRelativeUntil {
  field: string;
  offsetHours?: number;
  offsetDays?: number;
  offsetMinutes?: number;
}

/** Read a dot-path from an object, trying the exact key then a camelCase variant. */
export function readPath(data: unknown, path: string): unknown {
  const segments = path.split('.');
  let cur: unknown = data;
  for (const seg of segments) {
    if (cur == null || typeof cur !== 'object') return undefined;
    const obj = cur as Record<string, unknown>;
    if (seg in obj) {
      cur = obj[seg];
      continue;
    }
    // snake_case → camelCase fallback (starts_at → startsAt)
    const camel = seg.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    if (camel in obj) {
      cur = obj[camel];
      continue;
    }
    return undefined;
  }
  return cur;
}

function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Resolve the concrete `until` Date, or null if the referenced field can't be
 * turned into a date.
 */
export function resolveEventRelativeUntil(
  until: EventRelativeUntil,
  runData: unknown,
): Date | null {
  if (!until || typeof until.field !== 'string') return null;
  const base = toDate(readPath(runData, until.field));
  if (!base) return null;
  const offsetMs =
    (until.offsetDays ?? 0) * 86_400_000 +
    (until.offsetHours ?? 0) * 3_600_000 +
    (until.offsetMinutes ?? 0) * 60_000;
  return new Date(base.getTime() + offsetMs);
}
