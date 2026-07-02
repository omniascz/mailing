import { describe, it, expect } from 'vitest';
import { resolveEventRelativeUntil, readPath } from './wait-resolve.js';

describe('readPath', () => {
  it('reads a dot-path', () => {
    expect(readPath({ event: { starts_at: '2026-06-01' } }, 'event.starts_at')).toBe('2026-06-01');
  });

  it('falls back snake_case → camelCase', () => {
    expect(readPath({ event: { startsAt: '2026-06-01' } }, 'event.starts_at')).toBe('2026-06-01');
  });

  it('returns undefined for a missing path', () => {
    expect(readPath({ event: {} }, 'event.starts_at')).toBeUndefined();
    expect(readPath(null, 'a.b')).toBeUndefined();
  });
});

describe('resolveEventRelativeUntil', () => {
  const start = '2026-06-01T18:00:00.000Z';

  it('applies a negative hour offset (24h before)', () => {
    const d = resolveEventRelativeUntil(
      { field: 'event.starts_at', offsetHours: -24 },
      { event: { starts_at: start } },
    );
    expect(d?.toISOString()).toBe('2026-05-31T18:00:00.000Z');
  });

  it('applies a positive hour offset (1h after)', () => {
    const d = resolveEventRelativeUntil(
      { field: 'event.starts_at', offsetHours: 1 },
      { event: { starts_at: start } },
    );
    expect(d?.toISOString()).toBe('2026-06-01T19:00:00.000Z');
  });

  it('combines day + minute offsets and accepts camelCase data', () => {
    const d = resolveEventRelativeUntil(
      { field: 'event.starts_at', offsetDays: -1, offsetMinutes: -30 },
      { event: { startsAt: start } },
    );
    expect(d?.toISOString()).toBe('2026-05-31T17:30:00.000Z');
  });

  it('accepts an epoch-ms number as the base date', () => {
    const d = resolveEventRelativeUntil(
      { field: 'ts', offsetHours: 0 },
      { ts: Date.parse(start) },
    );
    expect(d?.toISOString()).toBe(start);
  });

  it('returns null when the field is missing or unparseable', () => {
    expect(resolveEventRelativeUntil({ field: 'event.starts_at' }, { event: {} })).toBeNull();
    expect(
      resolveEventRelativeUntil({ field: 'event.starts_at' }, { event: { starts_at: 'not-a-date' } }),
    ).toBeNull();
  });
});
