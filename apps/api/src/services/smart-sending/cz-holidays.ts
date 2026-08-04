/**
 * Czech and Slovak public holidays blacklist for Smart Sending.
 * Don't send marketing emails on státní svátky.
 *
 * CZ fixed: 1.1 / 1.5 / 8.5 / 5.7 / 6.7 / 28.9 / 28.10 / 17.11 / 24.12 / 25.12 / 26.12
 * CZ moveable: Velký pátek + Velikonoční pondělí (Easter-based)
 * SK fixed: same + 1.1 (independence) / 5.7 / 29.8 / 1.9 / 15.9 / 17.11 / 24.12 / 25.12 / 26.12
 */

/** Anonymous Gregorian Easter Monday calculation (Butcher/Meeus algorithm). */
function easterMonday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-based
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  // Add 1 day for Easter Monday
  const d0 = new Date(Date.UTC(year, month - 1, day));
  d0.setUTCDate(d0.getUTCDate() + 1);
  return d0;
}

function goodFriday(year: number): Date {
  const mon = easterMonday(year);
  const d = new Date(mon);
  d.setUTCDate(d.getUTCDate() - 3);
  return d;
}

function toKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const CZ_FIXED: Array<[number, number]> = [
  [1, 1],
  [1, 5],
  [8, 5],
  [5, 7],
  [6, 7],
  [28, 9],
  [28, 10],
  [17, 11],
  [24, 12],
  [25, 12],
  [26, 12],
];

const SK_FIXED: Array<[number, number]> = [
  [1, 1],
  [6, 1],
  [1, 5],
  [8, 5],
  [5, 7],
  [29, 8],
  [1, 9],
  [15, 9],
  [1, 11],
  [17, 11],
  [24, 12],
  [25, 12],
  [26, 12],
];

function buildSet(
  year: number,
  fixed: Array<[number, number]>,
  includeEaster: boolean,
): Set<string> {
  const s = new Set<string>();
  for (const [day, month] of fixed) {
    s.add(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  if (includeEaster) {
    s.add(toKey(goodFriday(year)));
    s.add(toKey(easterMonday(year)));
  }
  return s;
}

const cache = new Map<string, Set<string>>();

function getHolidays(year: number, country: 'cz' | 'sk' = 'cz'): Set<string> {
  const key = `${country}-${year}`;
  if (!cache.has(key)) {
    cache.set(key, buildSet(year, country === 'cz' ? CZ_FIXED : SK_FIXED, true));
  }
  return cache.get(key)!;
}

/** Returns true if the given date is a CZ/SK public holiday. */
export function isCzHoliday(date: Date, country: 'cz' | 'sk' = 'cz'): boolean {
  const year = date.getUTCFullYear();
  const key = `${year}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  return getHolidays(year, country).has(key);
}

/** Returns all holidays for a given year. */
export function getCzHolidays(year: number, country: 'cz' | 'sk' = 'cz'): string[] {
  return Array.from(getHolidays(year, country)).sort();
}
