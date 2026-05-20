import { describe, it, expect } from 'vitest';
import {
  pickHostOrder,
  computeFreeSlots,
  intersectFreeSlots,
  sliceIntoSlots,
  type RoundRobinState,
  type BusySlot,
  type FreeSlot,
} from './pure.js';

describe('pickHostOrder', () => {
  it('puts lowest assignment count first', () => {
    const states: RoundRobinState[] = [
      { userId: 'a', assignmentCount: 5, lastAssignedAt: new Date(100) },
      { userId: 'b', assignmentCount: 2, lastAssignedAt: new Date(200) },
      { userId: 'c', assignmentCount: 3, lastAssignedAt: new Date(300) },
    ];
    const sorted = pickHostOrder(states);
    expect(sorted.map((s) => s.userId)).toEqual(['b', 'c', 'a']);
  });

  it('tie-breaks on least-recently-assigned', () => {
    const states: RoundRobinState[] = [
      { userId: 'a', assignmentCount: 3, lastAssignedAt: new Date(500) },
      { userId: 'b', assignmentCount: 3, lastAssignedAt: new Date(100) },
      { userId: 'c', assignmentCount: 3, lastAssignedAt: new Date(300) },
    ];
    const sorted = pickHostOrder(states);
    expect(sorted.map((s) => s.userId)).toEqual(['b', 'c', 'a']);
  });

  it('handles never-assigned members (lastAssignedAt=null) as earliest', () => {
    const states: RoundRobinState[] = [
      { userId: 'a', assignmentCount: 3, lastAssignedAt: new Date(500) },
      { userId: 'new', assignmentCount: 3, lastAssignedAt: null },
    ];
    const sorted = pickHostOrder(states);
    expect(sorted[0]!.userId).toBe('new');
  });

  it('does not mutate the input', () => {
    const states: RoundRobinState[] = [
      { userId: 'a', assignmentCount: 2, lastAssignedAt: null },
      { userId: 'b', assignmentCount: 1, lastAssignedAt: null },
    ];
    const snapshot = states.map((s) => s.userId);
    pickHostOrder(states);
    expect(states.map((s) => s.userId)).toEqual(snapshot);
  });
});

describe('computeFreeSlots', () => {
  const start = new Date(Date.UTC(2026, 3, 24, 9, 0));
  const end = new Date(Date.UTC(2026, 3, 24, 17, 0));

  it('returns full window when no busy slots', () => {
    expect(computeFreeSlots(start, end, [])).toEqual([{ startAt: start, endAt: end }]);
  });

  it('excludes busy ranges', () => {
    const busy: BusySlot[] = [
      {
        startAt: new Date(Date.UTC(2026, 3, 24, 11, 0)),
        endAt: new Date(Date.UTC(2026, 3, 24, 12, 0)),
      },
    ];
    const free = computeFreeSlots(start, end, busy);
    expect(free).toHaveLength(2);
    expect(free[0]!.startAt).toEqual(start);
    expect(free[0]!.endAt).toEqual(new Date(Date.UTC(2026, 3, 24, 11, 0)));
    expect(free[1]!.startAt).toEqual(new Date(Date.UTC(2026, 3, 24, 12, 0)));
  });

  it('merges overlapping busy slots', () => {
    const busy: BusySlot[] = [
      {
        startAt: new Date(Date.UTC(2026, 3, 24, 10, 0)),
        endAt: new Date(Date.UTC(2026, 3, 24, 12, 0)),
      },
      {
        startAt: new Date(Date.UTC(2026, 3, 24, 11, 0)),
        endAt: new Date(Date.UTC(2026, 3, 24, 13, 0)),
      },
    ];
    const free = computeFreeSlots(start, end, busy);
    expect(free).toHaveLength(2);
    expect(free[1]!.startAt).toEqual(new Date(Date.UTC(2026, 3, 24, 13, 0)));
  });

  it('clips busy slots that extend past the window', () => {
    const busy: BusySlot[] = [
      {
        startAt: new Date(Date.UTC(2026, 3, 24, 8, 0)),
        endAt: new Date(Date.UTC(2026, 3, 24, 10, 0)),
      },
    ];
    const free = computeFreeSlots(start, end, busy);
    expect(free).toHaveLength(1);
    expect(free[0]!.startAt).toEqual(new Date(Date.UTC(2026, 3, 24, 10, 0)));
  });

  it('filters slots below minSlotMinutes', () => {
    const busy: BusySlot[] = [
      {
        startAt: new Date(Date.UTC(2026, 3, 24, 9, 10)),
        endAt: new Date(Date.UTC(2026, 3, 24, 17, 0)),
      },
    ];
    // Only 10 minutes free at the start, under default minSlotMinutes=15
    expect(computeFreeSlots(start, end, busy)).toEqual([]);
  });

  it('returns [] when window is zero-length or inverted', () => {
    expect(computeFreeSlots(end, start, [])).toEqual([]);
    expect(computeFreeSlots(start, start, [])).toEqual([]);
  });
});

describe('intersectFreeSlots', () => {
  const slot = (h1: number, h2: number): FreeSlot => ({
    startAt: new Date(Date.UTC(2026, 3, 24, h1, 0)),
    endAt: new Date(Date.UTC(2026, 3, 24, h2, 0)),
  });

  it('returns single host unchanged', () => {
    const a = [slot(9, 12)];
    expect(intersectFreeSlots([a])).toEqual(a);
  });

  it('intersects two hosts', () => {
    const a = [slot(9, 12), slot(14, 17)];
    const b = [slot(10, 15)];
    const result = intersectFreeSlots([a, b]);
    expect(result).toEqual([slot(10, 12), slot(14, 15)]);
  });

  it('returns empty when no overlap', () => {
    expect(intersectFreeSlots([[slot(9, 10)], [slot(11, 12)]])).toEqual([]);
  });
});

describe('sliceIntoSlots', () => {
  const slot = (h1: number, h2: number): FreeSlot => ({
    startAt: new Date(Date.UTC(2026, 3, 24, h1, 0)),
    endAt: new Date(Date.UTC(2026, 3, 24, h2, 0)),
  });

  it('cuts a free window into 30-min slots', () => {
    const slots = sliceIntoSlots([slot(9, 10)], 30);
    expect(slots).toHaveLength(2);
    expect(slots[0]!.startAt).toEqual(new Date(Date.UTC(2026, 3, 24, 9, 0)));
    expect(slots[1]!.startAt).toEqual(new Date(Date.UTC(2026, 3, 24, 9, 30)));
  });

  it('honours custom step', () => {
    // 15-min windows every 15 minutes
    const slots = sliceIntoSlots([slot(9, 10)], 15, 15);
    expect(slots).toHaveLength(4);
  });

  it('drops the tail that cannot fit a full slot', () => {
    const slots = sliceIntoSlots([slot(9, 10)], 45);
    expect(slots).toHaveLength(1);
  });
});
