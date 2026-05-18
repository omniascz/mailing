/**
 * Locale filter registration (#358 / #359).
 *
 * Wires the Czech and Slovak declension helpers into the merge-tag renderer
 * as filters. Imported once from the rendering entrypoint (workers, server
 * renderer) — intentionally NOT imported by the browser bundle so we don't
 * ship declension tables to every recipient.
 */

import { registerMergeFilter } from './merge-tags.js';
import {
  declineName as declineCs,
  vocative as vocativeCs,
  type CzechCase,
} from '@forgemsg/i18n-cs';
import {
  declineName as declineSk,
  type SlovakCase,
} from '@forgemsg/i18n-sk';

const CS_CASES: Record<string, CzechCase> = {
  vocative: 'vocative',
  genitive: 'genitive',
  dative: 'dative',
  accusative: 'accusative',
  locative: 'locative',
  instrumental: 'instrumental',
};

const SK_CASES: Record<string, SlovakCase> = {
  sk_nominative: 'nominative',
  sk_genitive: 'genitive',
  sk_dative: 'dative',
  sk_accusative: 'accusative',
  sk_locative: 'locative',
  sk_instrumental: 'instrumental',
  sk_vocative: 'vocative',
};

export function registerLocaleFilters(): void {
  // Czech — the `vocative` filter is the common one, aliased for convenience.
  registerMergeFilter('vocative', (v) => (v ? vocativeCs(v) : v));
  for (const [filter, cs] of Object.entries(CS_CASES)) {
    registerMergeFilter(filter, (v) => (v ? declineCs(v, cs) : v));
  }
  // Slovak — prefixed to avoid clashing with Czech filter names.
  for (const [filter, sk] of Object.entries(SK_CASES)) {
    registerMergeFilter(filter, (v) => (v ? declineSk(v, sk) : v));
  }
}
