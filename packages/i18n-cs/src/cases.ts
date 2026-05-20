/**
 * Czech declensions for merge-tags (#358).
 *
 * Provides all seven cases for given names. The 5th case (vocative) is the
 * one we actually ship with high confidence; the others are best-effort
 * surface-form rules that are good enough for transactional email. If the
 * copy absolutely requires grammatical correctness (legal/medical), use the
 * nominative fallback and let the copywriter adjust the sentence.
 *
 *   1. nominativ  — Petr přišel
 *   2. genitiv    — bez Petra
 *   3. dativ      — Petrovi
 *   4. akuzativ   — vidím Petra
 *   5. vokativ    — Petře!             (see ./vocative.ts)
 *   6. lokál      — o Petrovi
 *   7. instrumentál — s Petrem
 */

import { inferGender, vocative, type Gender } from './vocative.js';

export type CzechCase =
  | 'nominative'
  | 'genitive'
  | 'dative'
  | 'accusative'
  | 'vocative'
  | 'locative'
  | 'instrumental';

export function declineName(name: string, cs: CzechCase, gender?: Gender): string {
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
      return vocative(trimmed, g);
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

// ─── Male endings ────────────────────────────────────────────────────────────

function maleGenitive(n: string): string {
  // Consonant → +a (Petr → Petra, Pavel → Pavla)
  const last = n.slice(-1).toLowerCase();
  if (last === 'a') return n.slice(0, -1) + 'y'; // Honza → Honzy
  if (last === 'e') return n + ''; // already
  if (last === 'í') return n; // Jiří invariant
  // Drop fleeting -e- for names like Pavel → Pavla, Karel → Karla
  if (n.slice(-2).toLowerCase() === 'el') return n.slice(0, -2) + 'la';
  return n + 'a';
}

function maleDative(n: string): string {
  const last = n.slice(-1).toLowerCase();
  if (last === 'a') return n.slice(0, -1) + 'ovi';
  if (last === 'í') return n + 'mu';
  if (n.slice(-2).toLowerCase() === 'el') return n.slice(0, -2) + 'lovi';
  return n + 'ovi';
}

function maleAccusative(n: string): string {
  // For animate masculines, accusative == genitive.
  return maleGenitive(n);
}

function maleLocative(n: string): string {
  // Largely same as dative
  return maleDative(n);
}

function maleInstrumental(n: string): string {
  const last = n.slice(-1).toLowerCase();
  if (last === 'a') return n.slice(0, -1) + 'ou';
  if (last === 'í') return n + 'm';
  if (n.slice(-2).toLowerCase() === 'el') return n.slice(0, -2) + 'lem';
  return n + 'em';
}

// ─── Female endings ──────────────────────────────────────────────────────────

function femaleGenitive(n: string): string {
  const last = n.slice(-1).toLowerCase();
  if (last === 'a') return n.slice(0, -1) + 'y';
  if (n.toLowerCase().endsWith('ie')) return n; // Marie invariant
  return n;
}

function femaleDative(n: string): string {
  const last = n.slice(-1).toLowerCase();
  if (last === 'a') return n.slice(0, -1) + 'ě';
  return n;
}

function femaleAccusative(n: string): string {
  const last = n.slice(-1).toLowerCase();
  if (last === 'a') return n.slice(0, -1) + 'u';
  return n;
}

function femaleLocative(n: string): string {
  return femaleDative(n);
}

function femaleInstrumental(n: string): string {
  const last = n.slice(-1).toLowerCase();
  if (last === 'a') return n.slice(0, -1) + 'ou';
  return n;
}
