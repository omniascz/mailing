import { describe, it, expect } from 'vitest';
import {
  SLOVAK_FIXED_HOLIDAYS,
  slovakHolidaysForYear,
  isSlovakPublicHoliday,
  slovakPublicHolidayOn,
  holidaysInDays,
  easterSunday,
} from './public-holidays.js';

describe('easterSunday (SK)', () => {
  // Same Gregorian Easter as CZ — algorithm only varies for Orthodox Easter.
  it('2026 = 2026-04-05', () => {
    expect(easterSunday(2026)).toEqual([2026, 4, 5]);
  });
});

describe('SLOVAK_FIXED_HOLIDAYS', () => {
  it('contains 13 fixed dates', () => {
    expect(SLOVAK_FIXED_HOLIDAYS).toHaveLength(13);
  });

  it('includes 17 November (Deň boja za slobodu a demokraciu)', () => {
    expect(SLOVAK_FIXED_HOLIDAYS.some((h) => h.key === '11-17')).toBe(true);
  });

  it('includes 1 September (Deň Ústavy)', () => {
    expect(SLOVAK_FIXED_HOLIDAYS.some((h) => h.key === '09-01')).toBe(true);
  });

  it('includes Sedembolestná Panna Mária', () => {
    expect(SLOVAK_FIXED_HOLIDAYS.some((h) => h.key === '09-15')).toBe(true);
  });
});

describe('slovakHolidaysForYear', () => {
  it('returns 15 entries (13 fixed + 2 Easter-relative)', () => {
    expect(slovakHolidaysForYear(2026)).toHaveLength(15);
  });

  it('Veľkonočný pondelok 2026 = 2026-04-06', () => {
    const out = slovakHolidaysForYear(2026);
    const easterMonday = out.find((h) => h.name === 'Veľkonočný pondelok');
    expect(easterMonday?.date).toBe('2026-04-06');
  });

  it('all entries are statutory rest days', () => {
    expect(slovakHolidaysForYear(2025).every((h) => h.isWorkRest)).toBe(true);
  });

  it('output is sorted chronologically', () => {
    const out = slovakHolidaysForYear(2026);
    const dates = out.map((h) => h.date);
    expect([...dates]).toEqual([...dates].sort());
  });
});

describe('isSlovakPublicHoliday', () => {
  it('flags 1 September', () => {
    expect(isSlovakPublicHoliday(new Date(Date.UTC(2026, 8, 1)))).toBe(true);
  });

  it('returns false for ordinary day', () => {
    expect(isSlovakPublicHoliday(new Date(Date.UTC(2026, 5, 11)))).toBe(false);
  });
});

describe('slovakPublicHolidayOn', () => {
  it('returns the holiday object', () => {
    const h = slovakPublicHolidayOn(new Date(Date.UTC(2026, 11, 25)));
    expect(h?.name).toBe('Prvý sviatok vianočný');
  });
});

describe('holidaysInDays (SK)', () => {
  it('finds Vianoce 2 days ahead', () => {
    const today = new Date(Date.UTC(2026, 11, 23));
    const out = holidaysInDays(today, 2);
    expect(out.map((h) => h.name)).toContain('Prvý sviatok vianočný');
  });
});
