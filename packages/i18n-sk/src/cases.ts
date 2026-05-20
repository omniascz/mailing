/**
 * Slovak declensions for merge-tags (#359).
 *
 * Slovak has six productive cases (the 7th "vocative" merged into nominative
 * centuries ago — but survives in a few petrified forms like "Bože", "synu",
 * "priateľu" that we surface when the input matches). We implement all seven
 * so the merge-tag filters stay analogous to Czech (#358) for the user.
 *
 *   1. nominatív    — Peter prišiel
 *   2. genitív      — bez Petra
 *   3. datív        — Petrovi
 *   4. akuzatív     — vidím Petra
 *   5. vokatív      — priateľu!             (rare; fallback = nominative)
 *   6. lokál        — o Petrovi
 *   7. inštrumentál — s Petrom
 *
 * Rules are a best-effort surface grammar — full correctness needs a
 * morphological dictionary which we load lazily in the workers later.
 */

export type Gender = 'male' | 'female' | 'unknown';

export type SlovakCase =
  | 'nominative'
  | 'genitive'
  | 'dative'
  | 'accusative'
  | 'vocative'
  | 'locative'
  | 'instrumental';

const VOCATIVE_EXCEPTIONS: Record<string, string> = {
  priateľ: 'priateľu',
  otec: 'otče',
  boh: 'bože',
  chlap: 'chlape',
  syn: 'synu',
};

export function inferGender(name: string): Gender {
  const n = name.trim();
  if (!n) return 'unknown';
  const last = n.slice(-1).toLowerCase();
  if (last === 'a') return 'female';
  if (n.toLowerCase().endsWith('ia')) return 'female';
  return 'male';
}

export function declineName(name: string, cs: SlovakCase, gender?: Gender): string {
  const trimmed = name.trim();
  if (!trimmed) return name;
  if (trimmed.includes(' ')) {
    const [first, ...rest] = trimmed.split(' ');
    return [declineName(first!, cs, gender), ...rest].join(' ');
  }
  const g = gender ?? inferGender(trimmed);

  switch (cs) {
    case 'nominative':
      return trimmed;
    case 'vocative':
      return vocative(trimmed);
    case 'genitive':
      return g === 'female' ? femaleGenitive(trimmed) : maleGenitive(trimmed);
    case 'dative':
      return g === 'female' ? femaleDative(trimmed) : maleDative(trimmed);
    case 'accusative':
      return g === 'female' ? femaleAccusative(trimmed) : maleAccusative(trimmed);
    case 'locative':
      return g === 'female' ? femaleLocative(trimmed) : maleLocative(trimmed);
    case 'instrumental':
      return g === 'female' ? femaleInstrumental(trimmed) : maleInstrumental(trimmed);
  }
}

function vocative(n: string): string {
  const k = n.toLowerCase();
  if (VOCATIVE_EXCEPTIONS[k]) return VOCATIVE_EXCEPTIONS[k]!;
  return n; // modern Slovak: vocative = nominative for most names
}

// ─── Male endings ────────────────────────────────────────────────────────────

function maleGenitive(n: string): string {
  const last = n.slice(-1).toLowerCase();
  if (last === 'a') return n.slice(0, -1) + 'u'; // Slávo → Slávu (rare)
  if (last === 'o') return n.slice(0, -1) + 'u'; // Janko → Janka? handled below with fleeting
  if (last === 'í' || last === 'i') return n + 'ho';
  // Fleeting -o- in -ko → -ka (Janko → Janka)
  if (n.slice(-2).toLowerCase() === 'ko') return n.slice(0, -2) + 'ka';
  // Fleeting -e- (Peter → Petra, Pavel → Pavla)
  if (n.slice(-2).toLowerCase() === 'er') return n.slice(0, -2) + 'ra';
  if (n.slice(-2).toLowerCase() === 'el') return n.slice(0, -2) + 'la';
  return n + 'a';
}

function maleDative(n: string): string {
  const last = n.slice(-1).toLowerCase();
  if (last === 'a') return n.slice(0, -1) + 'ovi';
  if (last === 'í' || last === 'i') return n + 'mu';
  if (n.slice(-2).toLowerCase() === 'ko') return n.slice(0, -2) + 'kovi';
  if (n.slice(-2).toLowerCase() === 'er') return n.slice(0, -2) + 'rovi';
  if (n.slice(-2).toLowerCase() === 'el') return n.slice(0, -2) + 'lovi';
  return n + 'ovi';
}

function maleAccusative(n: string): string {
  return maleGenitive(n);
}

function maleLocative(n: string): string {
  return maleDative(n);
}

function maleInstrumental(n: string): string {
  const last = n.slice(-1).toLowerCase();
  if (last === 'a') return n.slice(0, -1) + 'om';
  if (last === 'í' || last === 'i') return n + 'm';
  if (n.slice(-2).toLowerCase() === 'ko') return n.slice(0, -2) + 'kom';
  if (n.slice(-2).toLowerCase() === 'er') return n.slice(0, -2) + 'rom';
  if (n.slice(-2).toLowerCase() === 'el') return n.slice(0, -2) + 'lom';
  return n + 'om';
}

// ─── Female endings ──────────────────────────────────────────────────────────

function femaleGenitive(n: string): string {
  const last = n.slice(-1).toLowerCase();
  if (last === 'a') return n.slice(0, -1) + 'y'; // Jana → Jany
  if (n.toLowerCase().endsWith('ia')) return n.slice(0, -1) + 'e'; // Mária → Márie
  return n;
}

function femaleDative(n: string): string {
  const last = n.slice(-1).toLowerCase();
  if (last === 'a') return n.slice(0, -1) + 'e'; // Jana → Jane
  if (n.toLowerCase().endsWith('ia')) return n.slice(0, -1) + 'i'; // Mária → Márii
  return n;
}

function femaleAccusative(n: string): string {
  const last = n.slice(-1).toLowerCase();
  if (last === 'a') return n.slice(0, -1) + 'u'; // Jana → Janu
  if (n.toLowerCase().endsWith('ia')) return n.slice(0, -1) + 'u'; // Mária → Máriu
  return n;
}

function femaleLocative(n: string): string {
  return femaleDative(n);
}

function femaleInstrumental(n: string): string {
  const last = n.slice(-1).toLowerCase();
  if (last === 'a') return n.slice(0, -1) + 'ou'; // Jana → Janou
  if (n.toLowerCase().endsWith('ia')) return n.slice(0, -1) + 'ou'; // Mária → Máriou
  return n;
}
