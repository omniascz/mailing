import { describe, it, expect } from 'vitest';
import {
  czechNameDays,
  nameDaysFor,
  isNameDayFor,
  toMonthDayKey,
} from './name-days.js';

describe('czechNameDays', () => {
  it('covers all 366 calendar days (including 02-29)', () => {
    const keys = Object.keys(czechNameDays).sort();
    expect(keys).toContain('01-01');
    expect(keys).toContain('02-29');
    expect(keys).toContain('12-31');
    expect(keys.length).toBe(366);
  });

  it('has well-known primary name-days', () => {
    expect(czechNameDays['02-14']).toEqual(['Valentýn']);
    expect(czechNameDays['03-19']).toEqual(['Josef']);
    expect(czechNameDays['04-24']).toEqual(['Jiří']);
    expect(czechNameDays['07-13']).toEqual(['Markéta']);
    expect(czechNameDays['12-24']).toEqual(['Adam', 'Eva']);
    expect(czechNameDays['12-26']).toEqual(['Štěpán']);
  });

  it('leaves state holidays empty', () => {
    expect(czechNameDays['01-01']).toEqual([]); // Nový rok
    expect(czechNameDays['05-01']).toEqual([]); // Svátek práce
    expect(czechNameDays['09-28']).toEqual([]); // Den české státnosti
    expect(czechNameDays['12-25']).toEqual([]); // 1. svátek vánoční
  });
});

describe('toMonthDayKey', () => {
  it('formats dates as MM-DD in local time', () => {
    expect(toMonthDayKey(new Date(2026, 0, 1))).toBe('01-01');
    expect(toMonthDayKey(new Date(2026, 5, 9))).toBe('06-09');
    expect(toMonthDayKey(new Date(2026, 11, 31))).toBe('12-31');
  });
});

describe('nameDaysFor', () => {
  it('returns the names for a given date', () => {
    expect(nameDaysFor(new Date(2026, 3, 24))).toEqual(['Jiří']); // 04-24
    expect(nameDaysFor(new Date(2026, 5, 29))).toEqual(['Petr', 'Pavel']); // 06-29
  });

  it('returns empty array for state holidays', () => {
    expect(nameDaysFor(new Date(2026, 4, 1))).toEqual([]); // 05-01
  });
});

describe('isNameDayFor', () => {
  it('matches exact names', () => {
    expect(isNameDayFor('Petr', new Date(2026, 5, 29))).toBe(true); // 06-29 Petr
    expect(isNameDayFor('Pavel', new Date(2026, 5, 29))).toBe(true);
    expect(isNameDayFor('Jiří', new Date(2026, 3, 24))).toBe(true); // 04-24
  });

  it('is case-insensitive and diacritic-insensitive', () => {
    expect(isNameDayFor('jiri', new Date(2026, 3, 24))).toBe(true);
    expect(isNameDayFor('MARIAN', new Date(2026, 2, 25))).toBe(true); // 03-25 Marián
    expect(isNameDayFor('marián', new Date(2026, 2, 25))).toBe(true);
  });

  it('rejects non-matching names', () => {
    expect(isNameDayFor('Petr', new Date(2026, 3, 24))).toBe(false);
    expect(isNameDayFor('', new Date(2026, 3, 24))).toBe(false);
    expect(isNameDayFor('Karel', new Date(2026, 0, 1))).toBe(false); // state holiday, empty
  });

  it('trims whitespace', () => {
    expect(isNameDayFor('  Petr  ', new Date(2026, 5, 29))).toBe(true);
  });
});
