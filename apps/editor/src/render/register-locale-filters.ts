/**
 * CZ/SK merge-tag filters (#358 / #359).
 *
 * There used to be two of these. This one registered into both the regex
 * merge-tag path and the Liquid engine but was never called; the other lived
 * in apps/workers, was called at worker startup, and registered into the regex
 * path only. The result: `{{ name | vocative }}` inside a template containing
 * any Liquid control flow silently rendered the name unchanged — verified by
 * running it, `renderLiquidSync('{{ n | vocative }}', …)` returned the input
 * verbatim.
 *
 * This file survived the merge because registering into both paths is the
 * behaviour we want. The workers copy is now a thin re-export so its existing
 * call site keeps working.
 */

import { registerMergeFilter, type MergeFilter } from './merge-tags.js';
import { registerLiquidFilter } from './liquid.js';
import { declineName as declineCs, vocative as vocativeCs } from '@forgemsg/i18n-cs';
import { declineName as declineSk } from '@forgemsg/i18n-sk';

/**
 * Register into BOTH the regex merge-tag path and the Liquid engine, so a
 * filter renders identically whether or not the template also uses Liquid
 * control flow. parseMergeTags switches to the Liquid path the moment it sees
 * `{%` anywhere in the template.
 */
function registerFilter(name: string, fn: MergeFilter): void {
  registerMergeFilter(name, fn);
  registerLiquidFilter(name, (value, arg) =>
    fn(value == null ? '' : String(value), arg as string | undefined),
  );
}

export function registerLocaleFilters(): void {
  // ─── Czech ────────────────────────────────────────────────────────────────
  registerFilter('vocative', (v) => (v ? vocativeCs(v) : v));

  // ─── Slovak ───────────────────────────────────────────────────────────────
  // Modern Slovak has no productive vocative, so this is identity for names
  // apart from a few petrified words. It exists so a Slovak template does not
  // have to reach for the Czech filter — which is what the SK "meniny"
  // workflow template does today, applying Czech declension to Slovak names.
  registerFilter('sk_vocative', (v) => (v ? declineSk(v, 'vocative') : v));

  // ─── Locale-aware alias ───────────────────────────────────────────────────
  // {{ first_name | decline:"sk" }} — no argument defaults to Czech.
  registerFilter('decline', (v, locale) => {
    if (!v) return v;
    const lang = (locale ?? 'cs').toLowerCase().slice(0, 2);
    return lang === 'sk' ? declineSk(v, 'vocative') : declineCs(v, 'vocative');
  });

  // ─── Convenience: |salutation ─────────────────────────────────────────────
  // Vocative of the given name. The gender-aware "Vážený pane Novotný" form
  // needs the contact's gender and surname, which a single-value filter does
  // not have — that lives in buildSalutation() on the API side.
  registerFilter('salutation', (v) => (v ? vocativeCs(v) : v));
}
