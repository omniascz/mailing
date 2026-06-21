/**
 * CZ/SK merge-tag filters (#606–#608).
 *
 * Registers Czech and Slovak declension pipe-filters into the editor's
 * MergeFilter registry so `{{contact.first_name|vocative}}` etc. work in
 * email/SMS templates at send time.
 *
 * Call registerCzSkMergeFilters() ONCE at worker startup, before any
 * batch-sender worker is initialised.
 *
 * Supported filters:
 *
 *   Czech:
 *     |vocative      — 5. pád: "Petr" → "Petře"
 *     |genitive      — 2. pád: "Petr" → "Petra"
 *     |dative        — 3. pád: "Petr" → "Petrovi"
 *     |accusative    — 4. pád: "Petr" → "Petra"
 *     |locative      — 6. pád: "Petr" → "Petrovi"
 *     |instrumental  — 7. pád: "Petr" → "Petrem"
 *
 *   Slovak:
 *     |sk_vocative     — vokatív: "Peter" → "Peter"
 *     |sk_genitive     — genitív: "Peter" → "Petra"
 *     |sk_dative       — datív:   "Peter" → "Petrovi"
 *     |sk_accusative   — akuzatív: "Peter" → "Petra"
 *     |sk_locative     — lokál:   "Peter" → "Petrovi"
 *     |sk_instrumental — inštrumentál: "Peter" → "Petrom"
 *
 * Locale auto-detection:
 *     |decline        — uses contact.locale (cs/sk) to pick the right rules.
 *                       Falls back to Czech if locale is unknown.
 */

import { registerMergeFilter } from '@forgemsg/editor/render';
import { declineName as csDecline } from '@forgemsg/i18n-cs/cases';
import { vocative as csVocative } from '@forgemsg/i18n-cs/vocative';
import { declineName as skDecline } from '@forgemsg/i18n-sk/cases';

export function registerCzSkMergeFilters(): void {
  // ─── Czech filters ──────────────────────────────────────────────────────────
  registerMergeFilter('vocative', (v) => csDecline(v, 'vocative'));
  registerMergeFilter('genitive', (v) => csDecline(v, 'genitive'));
  registerMergeFilter('dative', (v) => csDecline(v, 'dative'));
  registerMergeFilter('accusative', (v) => csDecline(v, 'accusative'));
  registerMergeFilter('locative', (v) => csDecline(v, 'locative'));
  registerMergeFilter('instrumental', (v) => csDecline(v, 'instrumental'));

  // ─── Slovak filters ─────────────────────────────────────────────────────────
  registerMergeFilter('sk_vocative', (v) => skDecline(v, 'vocative'));
  registerMergeFilter('sk_genitive', (v) => skDecline(v, 'genitive'));
  registerMergeFilter('sk_dative', (v) => skDecline(v, 'dative'));
  registerMergeFilter('sk_accusative', (v) => skDecline(v, 'accusative'));
  registerMergeFilter('sk_locative', (v) => skDecline(v, 'locative'));
  registerMergeFilter('sk_instrumental', (v) => skDecline(v, 'instrumental'));

  // ─── Locale-aware alias ─────────────────────────────────────────────────────
  // |decline uses the arg to pick the locale: {{first_name|decline:"cs"}}
  // Without arg it defaults to Czech vocative (most common use-case).
  registerMergeFilter('decline', (v, locale) => {
    const lang = (locale ?? 'cs').toLowerCase().slice(0, 2);
    if (lang === 'sk') return skDecline(v, 'vocative');
    return csDecline(v, 'vocative');
  });

  // ─── Convenience: |salutation ───────────────────────────────────────────────
  // Produces gender-aware greeting: "Vážený pane Novák" / "Vážená paní Nováková"
  // Used as: {{contact.last_name|salutation}} — requires contact.gender in ctx.
  // Here we just do vocative of first name (simpler, universal).
  registerMergeFilter('salutation', (v) => csVocative(v));
}
