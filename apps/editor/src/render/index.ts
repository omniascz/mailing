export { renderEmail, type RenderOptions, type RenderResult } from './render.js';
export { renderPlainText, type RenderPlainTextOptions } from './plain-text.js';
// The opt-out label and the sender lines the compliance footer is made of.
// Exported so the inline flow e-mail, which the renderer never sees, words its
// footer from the same place as a campaign's (apps/api
// services/workflows/inline-optout.ts, Z157).
export { unsubscribeLabel, postalAddressLines } from './compliance.js';
export {
  parseMergeTags,
  listMergeTags,
  listMergeFilters,
  registerMergeFilter,
  expandContactScope,
  expandSystemScope,
  type MergeTagContext,
  type MergeTagContact,
  type MergeFilter,
} from './merge-tags.js';
export { evaluateCondition } from './evaluate-condition.js';
// The allowlist sanitiser the code block runs user HTML through. Exported so
// the archive page can put raw-HTML campaigns through the SAME one rather than
// growing a second opinion about what HTML is safe.
export { sanitizeUserHtml } from './sanitize.js';
export {
  renderLiquid,
  renderLiquidSync,
  registerLiquidFilter,
  listLiquidFilters,
  type LiquidContext,
} from './liquid.js';
// CZ/SK declension filters. Registers into both the merge-tag and Liquid
// paths; call once at process start (workers do this in index.ts).
export { registerLocaleFilters } from './register-locale-filters.js';
// Merge-tag validation — reports typos at save time and in the pre-send panel,
// since the renderer itself resolves an unknown tag to '' by design.
export {
  validateMergeTags,
  availableMergeKeys,
  availableFilters,
  type MergeTagWarning,
  type MergeTagWarningKind,
} from './validate-merge-tags.js';
