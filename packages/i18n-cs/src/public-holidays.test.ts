import { describe, it, expect } from 'vitest';
import {
  CZECH_FIXED_HOLIDAYS,
  czechHolidaysForYear,
  easterSunday,
  isCzechPublicHoliday,
  czechPublicHolidayOn,
  holidaysInDays,
  toIsoDate,
} from './public-holidays.js';

describe('easterSunday', () => {
  // Reference values from the Czech Statistical Office calendar.
  const known: Array<[number, [number, number, number]]> = [
    [2024, [2024, 3, 31]],
    [2025, [2025, 4, 20]],
    [2026, [2026, 4, 5]],
    [2027, [2027, 3, 28]],
    [2030, [2030, 4, 21]],
  ];

  for (const [year, expected] of known) {
    it(`year ${year} → ${expected[1]}-${expected[2]}`, () => {
      expect(easterSunday(year)).toEqual(expected);
    });
  }
});

describe('CZECH_FIXED_HOLIDAYS', () => {
  it('contains 11 fixed dates', () => {
    expect(CZECH_FIXED_HOLIDAYS).toHaveLength(11);
  });

  it('every fixed entry uses MM-DD format', () => {
    for (const h of CZECH_FIXED_HOLIDAYS) {
      expect(h.key).toMatch(/^\d{2}-\d{2}$/);
    }
  });

  it('includes the 17 November day', () => {
    expect(CZECH_FIXED_HOLIDAYS.some((h) => h.key === '11-17')).toBe(true);
  });
});

describe('czechHolidaysForYear', () => {
  it('returns 13 entries (11 fixed + 2 Easter-relative)', () => {
    expect(czechHolidaysForYear(2026)).toHaveLength(13);
  });

  it('output is sorted chronologically', () => {
    const out = czechHolidaysForYear(2026);
    const dates = out.map((h) => h.date);
    expect([...dates]).toEqual([...dates].sort());
  });

  it('Velikonoční pondělí 2026 = 2026-04-06', () => {
    const out = czechHolidaysForYear(2026);
    const easterMonday = out.find((h) => h.name === 'Velikonoční pondělí');
    expect(easterMonday?.date).toBe('2026-04-06');
  });

  it('Velký pátek 2026 = 2026-04-03', () => {
    const out = czechHolidaysForYear(2026);
    const goodFriday = out.find((h) => h.name === 'Velký pátek');
    expect(goodFriday?.date).toBe('2026-04-03');
  });

  it('all entries are statutory rest days', () => {
    const out = czechHolidaysForYear(2025);
    expect(out.every((h) => h.isWorkRest)).toBe(true);
  });
});

describe('isCzechPublicHoliday', () => {
  it('flags 1 January', () => {
    expect(isCzechPublicHoliday(new Date(Date.UTC(2026, 0, 1)))).toBe(true);
  });

  it('flags 28 October', () => {
    expect(isCzechPublicHoliday(new Date(Date.UTC(2026, 9, 28)))).toBe(true);
  });

  it('flags Velikonoční pondělí 2026', () => {
    expect(isCzechPublicHoliday(new Date(Date.UTC(2026, 3, 6)))).toBe(true);
  });

  it('returns false for an arbitrary working day', () => {
    expect(isCzechPublicHoliday(new Date(Date.UTC(2026, 1, 12)))).toBe(false);
  });
});

describe('czechPublicHolidayOn', () => {
  it('returns the holiday object for matching date', () => {
    const h = czechPublicHolidayOn(new Date(Date.UTC(2026, 11, 24)));
    expect(h?.name).toBe('Štědrý den');
  });

  it('returns null for non-holiday', () => {
    expect(czechPublicHolidayOn(new Date(Date.UTC(2026, 5, 15)))).toBeNull();
  });
});

describe('holidaysInDays (workflow trigger)', () => {
  it('returns the holiday exactly N days ahead', () => {
    // 2026-12-22 + 2 days = 2026-12-24 = Štědrý den
    const today = new Date(Date.UTC(2026, 11, 22));
    const out = holidaysInDays(today, 2);
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe('Štědrý den');
  });

  it('returns [] when no holiday lands on day+N', () => {
    const today = new Date(Date.UTC(2026, 5, 15));
    expect(holidaysInDays(today, 3)).toEqual([]);
  });

  it('crosses year boundary correctly', () => {
    // 2026-12-30 + 2 days = 2027-01-01 (Den obnovy samostatného českého státu)
    const today = new Date(Date.UTC(2026, 11, 30));
    const out = holidaysInDays(today, 2);
    expect(out.some((h) => h.date === '2027-01-01')).toBe(true);
  });
});

describe('toIsoDate', () => {
  it('formats UTC dates as YYYY-MM-DD', () => {
    expect(toIsoDate(new Date(Date.UTC(2026, 3, 6)))).toBe('2026-04-06');
  });
});
