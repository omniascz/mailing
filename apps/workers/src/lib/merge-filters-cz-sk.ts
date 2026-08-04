/**
 * CZ/SK merge-tag filters at worker startup (#606–#608).
 *
 * The registration itself now lives in @forgemsg/editor, next to both renderer
 * paths it has to write into. This file used to hold a second, divergent copy
 * that registered into the regex merge-tag path only, which is why
 * `{{ name | vocative }}` did nothing in templates using Liquid control flow.
 *
 * Kept as a re-export rather than deleted so `apps/workers/src/index.ts` — the
 * one call site — does not have to know where the registry moved to.
 */

export { registerLocaleFilters as registerCzSkMergeFilters } from '@forgemsg/editor/render';
