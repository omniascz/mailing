import { describe, it, expect } from 'vitest';
import {
  slovakNameDays,
  nameDaysFor,
  isNameDayFor,
  toMonthDayKey,
} from './name-days.js';

describe('slovakNameDays', () => {
  it('covers all 366 calendar days (including 02-29)', () => {
    const keys = Object.keys(slovakNameDays).sort();
    expect(keys).toContain('01-01');
    expect(keys).toContain('02-29');
    expect(keys).toContain('12-31');
    expect(keys.length).toBe(366);
  });

  it('has well-known primary name-days', () => {
    expect(slovakNameDays['02-14']).toEqual(['Valentín']);
    expect(slovakNameDays['03-19']).toEqual(['Jozef']);
    expect(slovakNameDays['04-24']).toEqual(['Juraj']);
    expect(slovakNameDays['06-29']).toEqual(['Peter', 'Pavol']);
    expect(slovakNameDays['11-25']).toEqual(['Katarína']);
    expect(slovakNameDays['12-24']).toEqual(['Adam', 'Eva']);
    expect(slovakNameDays['12-26']).toEqual(['Štefan']);
  });

  it('leaves state holidays empty', () => {
    expect(slovakNameDays['01-01']).toEqual([]); // Deň vzniku SR
    expect(slovakNameDays['05-01']).toEqual([]); // Sviatok práce
    expect(slovakNameDays['07-05']).toEqual([]); // Cyril a Metod
    expect(slovakNameDays['08-29']).toEqual([]); // SNP
    expect(slovakNameDays['09-01']).toEqual([]); // Deň ústavy
    expect(slovakNameDays['11-01']).toEqual([]); // Sviatok všetkých svätých
    expect(slovakNameDays['12-25']).toEqual([]); // 1. sviatok vianočný
  });
});

describe('toMonthDayKey', () => {
  it('formats MM-DD in local time', () => {
    expect(toMonthDayKey(new Date(2026, 0, 1))).toBe('01-01');
    expect(toMonthDayKey(new Date(2026, 11, 31))).toBe('12-31');
  });
});

describe('nameDaysFor', () => {
  it('returns the names for a given date', () => {
    expect(nameDaysFor(new Date(2026, 3, 24))).toEqual(['Juraj']);
    expect(nameDaysFor(new Date(2026, 5, 29))).toEqual(['Peter', 'Pavol']);
  });

  it('returns empty array for state holidays', () => {
    expect(nameDaysFor(new Date(2026, 4, 1))).toEqual([]);
  });
});

describe('isNameDayFor', () => {
  it('matches exact names', () => {
    expect(isNameDayFor('Juraj', new Date(2026, 3, 24))).toBe(true);
    expect(isNameDayFor('Peter', new Date(2026, 5, 29))).toBe(true);
    expect(isNameDayFor('Pavol', new Date(2026, 5, 29))).toBe(true);
  });

  it('is case-insensitive and diacritic-insensitive', () => {
    expect(isNameDayFor('juraj', new Date(2026, 3, 24))).toBe(true);
    expect(isNameDayFor('LUBOMIR', new Date(2026, 7, 13))).toBe(true); // 08-13 Ľubomír
    expect(isNameDayFor('katarina', new Date(2026, 10, 25))).toBe(true);
  });

  it('rejects non-matching names', () => {
    expect(isNameDayFor('Peter', new Date(2026, 3, 24))).toBe(false);
    expect(isNameDayFor('', new Date(2026, 3, 24))).toBe(false);
    expect(isNameDayFor('Karel', new Date(2026, 0, 1))).toBe(false);
  });

  it('trims whitespace', () => {
    expect(isNameDayFor('  Peter  ', new Date(2026, 5, 29))).toBe(true);
  });
});
