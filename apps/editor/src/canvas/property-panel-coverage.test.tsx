/**
 * Every block type has a property panel with at least one control in it.
 *
 * This does not read a list of handled types — it RENDERS PropertyEditor for
 * a factory block of each type and counts the form controls that come out.
 * `renderToStaticMarkup` needs no DOM, so it runs under this package's
 * `environment: 'node'` config; that was checked by running it, not assumed.
 *
 * Counting controls rather than characters is the whole point. Before this
 * change, selecting a video block rendered 140 characters of markup — a
 * heading and an empty div — because `BlockForm`'s switch had no case for it
 * and no default, and React 19 does not complain about a component returning
 * undefined. A length check would have called that "rendered something".
 *
 * It is also why `BlockForm`'s new default branch renders prose and no
 * control: a generic JSON textarea there would satisfy this test forever and
 * the next missing panel would ship looking finished.
 *
 * WHAT THIS TEST CANNOT SEE
 *  - It does not fire events. onChange never runs, so a panel wired to the
 *    wrong field, or to nothing, passes here. What the panel PRODUCES is
 *    covered by panel-output.test.ts against the zod schemas.
 *  - It does not check that a panel covers every field of its block. A
 *    one-input panel for product passes.
 *  - It cannot see CSS. A control that renders off-screen or invisible
 *    counts.
 *  - It renders the block the factory makes. A panel that only draws
 *    controls for some other state is not exercised.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PropertyEditor } from './PropertyEditor.js';
import { BLOCK_TYPES, type BlockType } from '../schema/blocks.js';
import { createBlock, createEmptyEmail } from '../schema/factory.js';

/**
 * How many form controls a fragment of HTML contains.
 *
 * Kept as a free function over a string so the assertions below can feed it
 * markup they wrote themselves and prove it can tell the difference. A
 * counter that always returns a positive number would make this whole file
 * green and meaningless, which is the failure this repo keeps producing.
 */
export function countControls(html: string): number {
  return (html.match(/<(?:input|textarea|select)\b/g) ?? []).length;
}

function panelMarkup(type: BlockType): string {
  return renderToStaticMarkup(
    <PropertyEditor
      email={createEmptyEmail()}
      selectedPath={[['root', 0]]}
      selectedBlock={createBlock(type)}
      onUpdateBlock={() => {}}
      onUpdateEmail={() => {}}
    />,
  );
}

describe('countControls (matcher self-test)', () => {
  it('counts nothing in markup with no controls', () => {
    expect(countControls('<div class="flex"><h3>video block</h3></div>')).toBe(0);
  });

  it('counts nothing in the shape the missing panels actually produced', () => {
    // Copied from a real render of PropertyEditor with a video block on
    // master before this change. If the matcher scored this above zero, the
    // assertion below would have been green throughout the two months video
    // spent in the palette without a panel.
    const before =
      '<div class="flex h-full flex-col gap-4"><h3 class="text-xs font-semibold ' +
      'uppercase tracking-wide text-secondary-500">video block</h3></div>';
    expect(countControls(before)).toBe(0);
  });

  it('counts each kind of control, once each', () => {
    expect(countControls('<input type="text" />')).toBe(1);
    expect(countControls('<textarea></textarea>')).toBe(1);
    expect(countControls('<select><option value="a">a</option></select>')).toBe(1);
    expect(countControls('<input /><textarea></textarea><select></select>')).toBe(3);
  });

  it('does not count a word that merely starts with a tag name', () => {
    // \b matters here: without it, "inputs" and "selected" would score.
    expect(countControls('<div>inputs are selected</div>')).toBe(0);
    expect(countControls('<inputs>')).toBe(0);
  });

  it('is not fooled by an empty string', () => {
    expect(countControls('')).toBe(0);
  });
});

describe('every block type has a property panel', () => {
  it('the list being walked is the schema export, not a copy', () => {
    expect(BLOCK_TYPES.length).toBeGreaterThanOrEqual(16);
    for (const type of ['video', 'coupon', 'code', 'share', 'product', 'social'] as const) {
      expect(BLOCK_TYPES).toContain(type);
    }
  });

  it.each(BLOCK_TYPES.map((t) => [t] as const))('%s renders at least one control', (type) => {
    const html = panelMarkup(type);
    expect(
      countControls(html),
      `${type} has no property panel — selecting it shows an empty right rail`,
    ).toBeGreaterThan(0);
  });

  it('names its own block type in the heading, so the rail is never anonymous', () => {
    for (const type of BLOCK_TYPES) {
      expect(panelMarkup(type)).toContain(`${type} block`);
    }
  });

  it('the six panels this change added are more than a token control', () => {
    // A single stray input would pass the loop above. These are the blocks
    // the change is about, so they get a floor with some substance to it.
    const floors: Partial<Record<BlockType, number>> = {
      video: 5,
      coupon: 8,
      code: 1,
      share: 5,
      product: 10,
      social: 3,
    };
    for (const [type, floor] of Object.entries(floors)) {
      const n = countControls(panelMarkup(type as BlockType));
      expect(
        n,
        `${type} panel has ${n} controls, expected at least ${floor}`,
      ).toBeGreaterThanOrEqual(floor);
    }
  });
});
