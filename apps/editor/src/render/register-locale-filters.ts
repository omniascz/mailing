/**
 * Locale filter registration (#358 / #359).
 *
 * Wires the Czech and Slovak declension helpers into the merge-tag renderer
 * as filters. Imported once from the rendering entrypoint (workers, server
 * renderer) — intentionally NOT imported by the browser bundle so we don't
 * ship declension tables to every recipient.
 */

import { registerMergeFilter, type MergeFilter } from './merge-tags.js';
import { registerLiquidFilter } from './liquid.js';
import {
  declineName as declineCs,
  vocative as vocativeCs,
  type CzechCase,
} from '@forgemsg/i18n-cs';
import { declineName as declineSk, type SlovakCase } from '@forgemsg/i18n-sk';

/**
 * Register a filter into BOTH the regex merge-tag path and the Liquid engine,
 * so `{{ name | vocative }}` renders identically whether the template uses
 * Liquid control-flow or not.
 */
function registerFilter(name: string, fn: MergeFilter): void {
  registerMergeFilter(name, fn);
  registerLiquidFilter(name, (value, arg) => fn(value == null ? '' : String(value), arg as string | undefined));
}

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
  registerFilter('vocative', (v) => (v ? vocativeCs(v) : v));
  for (const [filter, cs] of Object.entries(CS_CASES)) {
    registerFilter(filter, (v) => (v ? declineCs(v, cs) : v));
  }
  // Slovak — prefixed to avoid clashing with Czech filter names.
  for (const [filter, sk] of Object.entries(SK_CASES)) {
    registerFilter(filter, (v) => (v ? declineSk(v, sk) : v));
  }
}
