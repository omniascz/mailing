/**
 * Czech public holidays (státní svátky + významné dny — #389).
 *
 * Two layers:
 *   - **fixed** — `MM-DD` keys, year-independent. Covers every Czech state holiday
 *     except Easter, plus Good Friday (added per year because it tracks Easter).
 *   - **easterRelativeOffsets** — derived from a single Easter Sunday calculation
 *     using Meeus/Jones/Butcher (Gregorian). Covers Velikonoční pondělí (Easter
 *     Monday) and Velký pátek (Good Friday).
 *
 * Used by:
 *   - workflow trigger `n_days_before_holiday` (#389) to fire campaigns N days
 *     before / on a holiday.
 *   - send-time logic to avoid sending on dnů pracovního klidu without explicit
 *     opt-in.
 */

export interface PublicHoliday {
  /** ISO 8601 calendar date `YYYY-MM-DD`. */
  date: string;
  /** `MM-DD` for non-leap-year sorting, or `EASTER+N` for movable feasts. */
  key: string;
  /** Czech name. */
  name: string;
  /** Statutory rest day under §1 zákona 245/2000 Sb. */
  isWorkRest: boolean;
}

interface FixedHoliday {
  /** `MM-DD`. */
  key: string;
  name: string;
  isWorkRest: boolean;
}

/** Czech state holidays with stable `MM-DD` dates (zákon 245/2000 Sb.). */
export const CZECH_FIXED_HOLIDAYS: readonly FixedHoliday[] = [
  { key: '01-01', name: 'Den obnovy samostatného českého státu',  isWorkRest: true },
  { key: '05-01', name: 'Svátek práce',                            isWorkRest: true },
  { key: '05-08', name: 'Den vítězství',                           isWorkRest: true },
  { key: '07-05', name: 'Den slovanských věrozvěstů Cyrila a Metoděje', isWorkRest: true },
  { key: '07-06', name: 'Den upálení mistra Jana Husa',            isWorkRest: true },
  { key: '09-28', name: 'Den české státnosti',                     isWorkRest: true },
  { key: '10-28', name: 'Den vzniku samostatného československého státu', isWorkRest: true },
  { key: '11-17', name: 'Den boje za svobodu a demokracii',        isWorkRest: true },
  { key: '12-24', name: 'Štědrý den',                              isWorkRest: true },
  { key: '12-25', name: '1. svátek vánoční',                       isWorkRest: true },
  { key: '12-26', name: '2. svátek vánoční',                       isWorkRest: true },
];

/**
 * Compute Easter Sunday (Gregorian) for a given year using the Meeus / Jones /
 * Butcher algorithm. Returns `[year, month, day]` (1-indexed month).
 */
export function easterSunday(year: number): [number, number, number] {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [year, month, day];
}

/** Movable Czech holidays expressed as offsets from Easter Sunday. */
export const CZECH_EASTER_RELATIVE: ReadonlyArray<{ offset: number; name: string; isWorkRest: boolean }> = [
  { offset: -2, name: 'Velký pátek',           isWorkRest: true }, // since 2016
  { offset: 1,  name: 'Velikonoční pondělí',   isWorkRest: true },
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function shiftDate(year: number, month1: number, day: number, offsetDays: number): { y: number; m: number; d: number } {
  // JS Date is the easiest cross-month/year shifter.
  const dt = new Date(Date.UTC(year, month1 - 1, day + offsetDays));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/**
 * Materialise every Czech public holiday for the given year, in chronological
 * order. Returns ISO date strings so callers can compare lexicographically.
 */
export function czechHolidaysForYear(year: number): PublicHoliday[] {
  const out: PublicHoliday[] = [];
  for (const h of CZECH_FIXED_HOLIDAYS) {
    const [mm, dd] = h.key.split('-') as [string, string];
    out.push({
      date: `${year}-${mm}-${dd}`,
      key: h.key,
      name: h.name,
      isWorkRest: h.isWorkRest,
    });
  }
  const [, em, ed] = easterSunday(year);
  for (const r of CZECH_EASTER_RELATIVE) {
    const { y, m, d } = shiftDate(year, em, ed, r.offset);
    if (y !== year) continue; // off-year shift — skip; movable feasts stay in-year for Easter math
    out.push({
      date: `${y}-${pad2(m)}-${pad2(d)}`,
      key: `EASTER${r.offset >= 0 ? '+' : ''}${r.offset}`,
      name: r.name,
      isWorkRest: r.isWorkRest,
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** ISO `YYYY-MM-DD` for a Date in UTC. */
export function toIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Is the given date a Czech public holiday? */
export function isCzechPublicHoliday(date: Date): boolean {
  const iso = toIsoDate(date);
  const year = date.getUTCFullYear();
  return czechHolidaysForYear(year).some((h) => h.date === iso);
}

/** Return the matching holiday for a date, or null. */
export function czechPublicHolidayOn(date: Date): PublicHoliday | null {
  const iso = toIsoDate(date);
  const year = date.getUTCFullYear();
  return czechHolidaysForYear(year).find((h) => h.date === iso) ?? null;
}

/**
 * For workflow trigger `n_days_before_holiday` — given today, return holidays
 * that are exactly N days in the future (looking up to two years ahead so the
 * trigger works in late December).
 */
export function holidaysInDays(date: Date, daysAhead: number): PublicHoliday[] {
  const target = new Date(Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + daysAhead,
  ));
  const targetIso = toIsoDate(target);
  const candidates = [
    ...czechHolidaysForYear(target.getUTCFullYear()),
    ...czechHolidaysForYear(target.getUTCFullYear() + 1),
  ];
  return candidates.filter((h) => h.date === targetIso);
}
