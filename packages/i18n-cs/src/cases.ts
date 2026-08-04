/**
 * Czech name declension for merge-tags (#358).
 *
 * Only the vocative. The other five cases used to be here as best-effort
 * surface rules, and they were measured before being removed: on feminine
 * patterns they scored 6/20, and on masculine patterns anything outside the
 * hard consonant type came out wrong — "Hrubýa", "Janůovi", "Tomáša",
 * "Marekem". Nothing in this repository used them: a search across seeds,
 * workflow templates, fixtures, docs and tests found `| vocative` in four
 * places and the other five filters in none.
 *
 * Keeping a broken feature nobody calls costs more than removing it, so the
 * type below only admits 'vocative' — asking for a case that does not exist is
 * now a compile error rather than a plausible-looking wrong answer.
 */

import { vocative, type Gender } from './vocative.js';

/**
 * Deliberately a single member. It stays a union type (rather than collapsing
 * to a string literal parameter) so adding a case later is a widening change,
 * not a signature change for every caller.
 */
export type CzechCase = 'vocative';

export function declineName(name: string, cs: CzechCase, gender?: Gender): string {
  // `cs` is load-bearing for the call sites even though there is one branch:
  // it keeps the intent explicit at the call site and makes a future second
  // case additive.
  void cs;
  return vocative(name, gender);
}
