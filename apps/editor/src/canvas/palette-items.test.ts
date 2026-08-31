/**
 * The palette offers every block type, or says in writing why it does not.
 *
 * This is a drift guard, and drift guards in this repo have a habit of going
 * green by accident, so the matcher is tested against fabricated input first:
 * if `paletteGaps` cannot see a hole in a two-element list it invented, its
 * verdict on the real palette is worth nothing.
 *
 * WHAT THIS TEST CANNOT SEE
 *  - It never renders React. It does not prove the tile appears on screen,
 *    that the icon has a glyph in the user's font, or that dragging works.
 *  - It says nothing about whether a block type has a property-panel case.
 *    `video`, `coupon`, `code`, `share` and `product` are all placeable and
 *    all have no form in PropertyEditor; that is a separate hole.
 *  - It cannot judge a label. `PALETTE_META.code.label = 'Poll'` passes here.
 */
import { describe, it, expect } from 'vitest';
import { BLOCK_TYPES } from '../schema/blocks.js';
import { PALETTE, PALETTE_META, PALETTE_EXCLUDED, paletteGaps } from './palette-items.js';

describe('paletteGaps (matcher self-test)', () => {
  it('reports a type that is offered nowhere', () => {
    expect(paletteGaps(['a', 'b'], ['a'], [])).toEqual(['b']);
  });

  it('reports nothing when everything is offered', () => {
    expect(paletteGaps(['a', 'b'], ['a', 'b'], [])).toEqual([]);
  });

  it('an explicit exclusion silences the gap, and only for that type', () => {
    expect(paletteGaps(['a', 'b', 'c'], ['a'], ['b'])).toEqual(['c']);
  });

  it('an empty type list cannot produce a gap, so a vacuous call is visible', () => {
    // Guards against the failure where BLOCK_TYPES stops being imported and
    // the real assertion below quietly compares nothing to nothing.
    expect(paletteGaps([], [], [])).toEqual([]);
  });
});

describe('the block palette', () => {
  it('is derived from BLOCK_TYPES, not a copy of it', () => {
    // A copy would have a fixed length. This asserts the arithmetic that only
    // holds if PALETTE is BLOCK_TYPES minus the exclusions.
    expect(PALETTE).toHaveLength(BLOCK_TYPES.length - PALETTE_EXCLUDED.length);
    expect(BLOCK_TYPES.length).toBeGreaterThanOrEqual(16);
  });

  it('offers every block type that is not explicitly excluded', () => {
    const gaps = paletteGaps(
      BLOCK_TYPES,
      PALETTE.map((i) => i.type),
      PALETTE_EXCLUDED.map((e) => e.type),
    );
    expect(gaps, `block types missing from the palette: ${gaps.join(', ')}`).toEqual([]);
  });

  it('offers the four types that were silently missing before', () => {
    // Named rather than derived: these are the regression, and a derived
    // assertion would go green again the moment they fell out of BLOCK_TYPES.
    const offered = PALETTE.map((i) => i.type);
    for (const type of ['code', 'share', 'poll', 'product'] as const) {
      expect(offered, `${type} is not in the palette`).toContain(type);
    }
  });

  it('gives every block type a label and an icon', () => {
    for (const type of BLOCK_TYPES) {
      const meta = PALETTE_META[type];
      expect(meta, `${type} has no palette metadata`).toBeDefined();
      expect(meta.label.trim().length, `${type} has a blank label`).toBeGreaterThan(0);
      expect(meta.icon.trim().length, `${type} has a blank icon`).toBeGreaterThan(0);
    }
  });

  it('every exclusion names a real block type and gives a reason', () => {
    // An exclusion is allowed to exist; being wordless is not. A stale
    // exclusion for a type that no longer exists is also a defect — it would
    // hide a future type that happens to reuse the name.
    for (const entry of PALETTE_EXCLUDED) {
      expect(BLOCK_TYPES, `excluded type ${entry.type} is not a block type`).toContain(entry.type);
      expect(
        entry.reason.trim().length,
        `exclusion of ${entry.type} has no reason`,
      ).toBeGreaterThan(10);
    }
  });

  it('offers no type that is not a block type', () => {
    const known = new Set<string>(BLOCK_TYPES);
    for (const item of PALETTE) {
      expect(known, `palette offers unknown type ${item.type}`).toContain(item.type);
    }
  });
});
