/**
 * Meetings pure helpers (#261/#400).
 *
 * Round-robin fairness logic + free-slot math extracted out of the DB-coupled
 * services so we can validate the algorithms in unit tests. The service in
 * `round-robin.ts` does the DB reads/writes and delegates to `pickHostOrder`.
 */

// ─── Round-robin fairness ───────────────────────────────────────────────────

export interface RoundRobinState {
  userId: string;
  assignmentCount: number;
  lastAssignedAt: Date | null;
}

/**
 * Deterministic ordering: least assignments first, ties broken by
 * least-recently assigned. Returns the input sorted, so the caller can
 * iterate until it finds an available host.
 */
export function pickHostOrder(states: RoundRobinState[]): RoundRobinState[] {
  return [...states].sort((a, b) => {
    if (a.assignmentCount !== b.assignmentCount) {
      return a.assignmentCount - b.assignmentCount;
    }
    const aTime = a.lastAssignedAt?.getTime() ?? 0;
    const bTime = b.lastAssignedAt?.getTime() ?? 0;
    return aTime - bTime;
  });
}

// ─── Free-slot computation ──────────────────────────────────────────────────

export interface BusySlot {
  startAt: Date;
  endAt: Date;
}

export interface FreeSlot {
  startAt: Date;
  endAt: Date;
}

/**
 * Compute free slots within `[windowStart, windowEnd]` given a list of busy
 * ranges. Slots are merged in chronological order and the result excludes
 * any overlap with busy ranges. Slot durations below `minSlotMinutes` are
 * filtered out so callers only see bookable gaps.
 */
export function computeFreeSlots(
  windowStart: Date,
  windowEnd: Date,
  busy: BusySlot[],
  minSlotMinutes = 15,
): FreeSlot[] {
  if (windowEnd.getTime() <= windowStart.getTime()) return [];

  // Clip busy ranges to window + sort + merge overlaps
  const clipped = busy
    .map((b) => ({
      startAt: new Date(Math.max(b.startAt.getTime(), windowStart.getTime())),
      endAt: new Date(Math.min(b.endAt.getTime(), windowEnd.getTime())),
    }))
    .filter((b) => b.endAt.getTime() > b.startAt.getTime())
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const merged: BusySlot[] = [];
  for (const b of clipped) {
    const last = merged[merged.length - 1];
    if (last && b.startAt.getTime() <= last.endAt.getTime()) {
      last.endAt = new Date(Math.max(last.endAt.getTime(), b.endAt.getTime()));
    } else {
      merged.push({ startAt: new Date(b.startAt), endAt: new Date(b.endAt) });
    }
  }

  const free: FreeSlot[] = [];
  let cursor = windowStart;
  for (const b of merged) {
    if (b.startAt.getTime() > cursor.getTime()) {
      free.push({ startAt: cursor, endAt: new Date(b.startAt) });
    }
    cursor = b.endAt.getTime() > cursor.getTime() ? b.endAt : cursor;
  }
  if (cursor.getTime() < windowEnd.getTime()) {
    free.push({ startAt: cursor, endAt: windowEnd });
  }

  const minMs = minSlotMinutes * 60_000;
  return free.filter((s) => s.endAt.getTime() - s.startAt.getTime() >= minMs);
}

/**
 * Intersect multiple hosts' free slots to find times when the whole panel is
 * available. Useful for sales team meetings that require multiple reps.
 */
export function intersectFreeSlots(slotsPerHost: FreeSlot[][]): FreeSlot[] {
  if (slotsPerHost.length === 0) return [];
  if (slotsPerHost.length === 1) return slotsPerHost[0] ?? [];

  let intersection = slotsPerHost[0] ?? [];
  for (let i = 1; i < slotsPerHost.length; i++) {
    const next = slotsPerHost[i] ?? [];
    intersection = twoWayIntersect(intersection, next);
    if (intersection.length === 0) return [];
  }
  return intersection;
}

function twoWayIntersect(a: FreeSlot[], b: FreeSlot[]): FreeSlot[] {
  const result: FreeSlot[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ai = a[i]!;
    const bj = b[j]!;
    const start = new Date(Math.max(ai.startAt.getTime(), bj.startAt.getTime()));
    const end = new Date(Math.min(ai.endAt.getTime(), bj.endAt.getTime()));
    if (start.getTime() < end.getTime()) {
      result.push({ startAt: start, endAt: end });
    }
    if (ai.endAt.getTime() < bj.endAt.getTime()) i++;
    else j++;
  }
  return result;
}

/** Slice a free-slot window into fixed-duration bookable slots. */
export function sliceIntoSlots(
  free: FreeSlot[],
  durationMinutes: number,
  stepMinutes: number = durationMinutes,
): FreeSlot[] {
  const durMs = durationMinutes * 60_000;
  const stepMs = stepMinutes * 60_000;
  const out: FreeSlot[] = [];
  for (const window of free) {
    let t = window.startAt.getTime();
    while (t + durMs <= window.endAt.getTime()) {
      out.push({ startAt: new Date(t), endAt: new Date(t + durMs) });
      t += stepMs;
    }
  }
  return out;
}
