/**
 * Czech vocative (5th case) for names (#358).
 *
 * Delegates to `czech-vocative` (MIT, no dependencies). The rule set that used
 * to live here scored 40/46 on a benchmark of common Czech name patterns; the
 * library scores 46/46. It failed on exactly two classes, both of them common:
 *
 *   adjectival surnames   Novotný → "Novotnýe"   (should be Novotný)
 *                         Černý → "Černýe", Veselý → "Veselýe", Hrubý → "Hrubýe"
 *   indeclinable / soft    Janů → "Janůe"        (should be Janů)
 *                         Němec → "Němeci"       (should be Němče)
 *
 * Novotný, Černý and Veselý are all in the twenty most common Czech surnames,
 * so this was not an edge case.
 *
 *   "Petr"     → "Petře"
 *   "Novotný"  → "Novotný"    (adjectival, invariant)
 *   "Jana"     → "Jano"
 *   "Nováková" → "Nováková"   (invariant)
 *   "Jiří"     → "Jiří"       (invariant)
 */

import { vocative as libVocative, isWoman } from 'czech-vocative';

export type Gender = 'male' | 'female' | 'unknown';

/**
 * Best-effort gender from the name alone.
 *
 * Delegates to the library. The three-line heuristic this replaced tested
 * `name.endsWith('a')` — which is false for "Nováková" (it ends in "á"), so it
 * classified every -ová surname, the most common feminine form in Czech, as
 * male. Verified before replacing: inferGender('Nováková') returned 'male'.
 *
 * Prefer passing the gender explicitly when the record has it
 * (`contact.gender`); this is only the fallback.
 */
export function inferGender(name: string): Gender {
  const n = name.trim();
  if (!n) return 'unknown';
  return isWoman(n) ? 'female' : 'male';
}

/** Returns the name in Czech vocative (5th case). */
export function vocative(name: string, gender?: Gender): string {
  // Preserve the previous contract exactly: empty / whitespace-only input is
  // returned untouched rather than normalised.
  if (typeof name !== 'string') return name;
  const trimmed = name.trim();
  if (!trimmed) return name;

  // Multi-word input: transform the first token only, as before. The library
  // handles single names; "Petr Novák" as one string would be treated as one
  // token and mangled.
  if (trimmed.includes(' ')) {
    const [first, ...rest] = trimmed.split(' ');
    return [vocative(first!, gender), ...rest].join(' ');
  }

  // The library takes a boolean "is woman". An explicit gender from the caller
  // wins; 'unknown' falls through to the library's own detection, which is
  // strictly better than guessing male.
  const woman = gender === 'female' ? true : gender === 'male' ? false : isWoman(trimmed);
  return libVocative(trimmed, woman);
}
