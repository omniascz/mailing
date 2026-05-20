/**
 * Slovak public holidays (štátne sviatky + dni pracovného pokoja — #389).
 *
 * Layout mirrors `@forgemsg/i18n-cs/public-holidays` so a workflow trigger can
 * resolve either market off the contact's locale. Easter calculation is
 * duplicated here on purpose so this package has no cross-locale dependency.
 */

/** Meeus / Jones / Butcher (Gregorian). Returns `[year, month, day]`. */
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

export interface PublicHoliday {
  date: string;
  key: string;
  name: string;
  isWorkRest: boolean;
}

interface FixedHoliday {
  key: string;
  name: string;
  isWorkRest: boolean;
}

/**
 * Slovak holidays per zákon č. 241/1993 Z. z. — combination of `štátne sviatky`
 * (independence-related) and `dni pracovného pokoja` (religious + social).
 */
export const SLOVAK_FIXED_HOLIDAYS: readonly FixedHoliday[] = [
  { key: '01-01', name: 'Deň vzniku Slovenskej republiky', isWorkRest: true },
  { key: '01-06', name: 'Zjavenie Pána (Traja králi)', isWorkRest: true },
  { key: '05-01', name: 'Sviatok práce', isWorkRest: true },
  { key: '05-08', name: 'Deň víťazstva nad fašizmom', isWorkRest: true },
  { key: '07-05', name: 'Sviatok svätého Cyrila a svätého Metoda', isWorkRest: true },
  { key: '08-29', name: 'Výročie Slovenského národného povstania', isWorkRest: true },
  { key: '09-01', name: 'Deň Ústavy Slovenskej republiky', isWorkRest: true },
  { key: '09-15', name: 'Sedembolestná Panna Mária', isWorkRest: true },
  { key: '11-01', name: 'Sviatok všetkých svätých', isWorkRest: true },
  { key: '11-17', name: 'Deň boja za slobodu a demokraciu', isWorkRest: true },
  { key: '12-24', name: 'Štedrý deň', isWorkRest: true },
  { key: '12-25', name: 'Prvý sviatok vianočný', isWorkRest: true },
  { key: '12-26', name: 'Druhý sviatok vianočný', isWorkRest: true },
];

export const SLOVAK_EASTER_RELATIVE: ReadonlyArray<{
  offset: number;
  name: string;
  isWorkRest: boolean;
}> = [
  { offset: -2, name: 'Veľký piatok', isWorkRest: true },
  { offset: 1, name: 'Veľkonočný pondelok', isWorkRest: true },
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function shiftDate(
  year: number,
  month1: number,
  day: number,
  offsetDays: number,
): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(year, month1 - 1, day + offsetDays));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function slovakHolidaysForYear(year: number): PublicHoliday[] {
  const out: PublicHoliday[] = [];
  for (const h of SLOVAK_FIXED_HOLIDAYS) {
    const [mm, dd] = h.key.split('-') as [string, string];
    out.push({
      date: `${year}-${mm}-${dd}`,
      key: h.key,
      name: h.name,
      isWorkRest: h.isWorkRest,
    });
  }
  const [, em, ed] = easterSunday(year);
  for (const r of SLOVAK_EASTER_RELATIVE) {
    const { y, m, d } = shiftDate(year, em, ed, r.offset);
    if (y !== year) continue;
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

export function toIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function isSlovakPublicHoliday(date: Date): boolean {
  const iso = toIsoDate(date);
  return slovakHolidaysForYear(date.getUTCFullYear()).some((h) => h.date === iso);
}

export function slovakPublicHolidayOn(date: Date): PublicHoliday | null {
  const iso = toIsoDate(date);
  return slovakHolidaysForYear(date.getUTCFullYear()).find((h) => h.date === iso) ?? null;
}

export function holidaysInDays(date: Date, daysAhead: number): PublicHoliday[] {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + daysAhead),
  );
  const targetIso = toIsoDate(target);
  const candidates = [
    ...slovakHolidaysForYear(target.getUTCFullYear()),
    ...slovakHolidaysForYear(target.getUTCFullYear() + 1),
  ];
  return candidates.filter((h) => h.date === targetIso);
}
