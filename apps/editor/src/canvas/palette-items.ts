import { BLOCK_TYPES, type BlockType } from '../schema/blocks.js';

/**
 * What the block palette offers, derived from BLOCK_TYPES.
 *
 * The palette used to be its own hand-written array. It drifted: `product`
 * landed in BLOCK_TYPES on 2026-07-02 at 00:09 and the palette was edited
 * twenty-two hours later, on the same day, to add `video` and `coupon` —
 * walking straight past it. `code`, `share` and `poll` were added later and
 * missed the same way. Four block types that render, validate and send, and
 * that nobody could place, because nothing checked.
 *
 * So the list is no longer written down twice. PALETTE is BLOCK_TYPES minus
 * PALETTE_EXCLUDED, and every type needs an entry in PALETTE_META.
 *
 * Adding a block type now costs you a compile error (PALETTE_META is a
 * Record keyed by BlockType, so a missing key is a tsc failure) and, if that
 * is somehow dodged, a red test in palette-items.test.ts.
 *
 * A fallback label would be worse than either: the new type would show up as
 * a nameless tile and look deliberate.
 */
export interface PaletteItem {
  type: BlockType;
  label: string;
  icon: string;
}

/**
 * Label and icon per block type. A Record — not a partial map — on purpose:
 * omitting a key does not compile.
 */
export const PALETTE_META: Record<BlockType, { label: string; icon: string }> = {
  text: { label: 'Text', icon: 'T' },
  image: { label: 'Image', icon: '🖼' },
  button: { label: 'Button', icon: '▭' },
  divider: { label: 'Divider', icon: '─' },
  spacer: { label: 'Spacer', icon: '↕' },
  columns: { label: 'Columns', icon: '◫' },
  hero: { label: 'Hero', icon: '★' },
  social: { label: 'Social', icon: '@' },
  code: { label: 'Code', icon: '{}' },
  share: { label: 'Share', icon: '↗' },
  poll: { label: 'Poll', icon: '☑' },
  product: { label: 'Product', icon: '🛍' },
  video: { label: 'Video', icon: '▶' },
  coupon: { label: 'Coupon', icon: '🏷' },
  footer: { label: 'Footer', icon: '_' },
  dynamic: { label: 'Dynamic', icon: '⟨⟩' },
};

/**
 * Block types deliberately kept out of the palette, each with the reason.
 *
 * This list is the ONLY way a type may be absent. Being forgotten is not a
 * way. The reason is data rather than a comment so the test can insist one
 * exists — a comment can be deleted and nothing notices.
 *
 * It is currently empty, and that is a finding rather than an oversight:
 * `product` was the one candidate for exclusion ("it gets filled from the
 * shop feed, why place it by hand?"), but nothing in this repo populates a
 * product block from a feed. The only producers are the factory and the
 * hand-written templates in apps/api/src/services/editor/templates. Placing
 * one by hand is, today, the only way a product block can exist at all.
 */
export const PALETTE_EXCLUDED: ReadonlyArray<{ type: BlockType; reason: string }> = [];

/** Types the palette must not offer, as a set, for the derivation below. */
const EXCLUDED_TYPES: ReadonlySet<BlockType> = new Set(PALETTE_EXCLUDED.map((e) => e.type));

/** Palette order follows BLOCK_TYPES, so a new type appears where it was declared. */
export const PALETTE: readonly PaletteItem[] = BLOCK_TYPES.filter(
  (type) => !EXCLUDED_TYPES.has(type),
).map((type) => ({ type, ...PALETTE_META[type] }));

/**
 * Types that ought to be in the palette but are not.
 *
 * Kept as a free function over plain string arrays so the test can feed it
 * fabricated input and prove it can actually see a gap. A comparison that
 * silently always returns [] is the failure mode this whole file exists to
 * prevent, and it would be an embarrassing one to reintroduce in the guard.
 */
export function paletteGaps(
  allTypes: readonly string[],
  offeredTypes: readonly string[],
  excludedTypes: readonly string[],
): string[] {
  const offered = new Set(offeredTypes);
  const excluded = new Set(excludedTypes);
  return allTypes.filter((t) => !offered.has(t) && !excluded.has(t));
}
