import { describe, expect, it } from 'vitest';
import { blockSchema, emailSchema } from './blocks.js';
import { createBlock, createEmptyEmail } from './factory.js';

describe('block schema', () => {
  it('accepts a text block from the factory', () => {
    const block = createBlock('text');
    const parsed = blockSchema.parse(block);
    expect(parsed.type).toBe('text');
  });

  it('rejects a block missing an id', () => {
    expect(() =>
      blockSchema.parse({ type: 'spacer', height: 20 }),
    ).toThrow();
  });

  it('validates a full empty email', () => {
    const email = createEmptyEmail();
    const parsed = emailSchema.parse(email);
    expect(parsed.blocks).toEqual([]);
    expect(parsed.globalStyles.contentWidth).toBe(600);
  });

  it('validates a nested columns block recursively', () => {
    const cols = createBlock('columns');
    if (cols.type !== 'columns') throw new Error('bad factory');
    cols.columns[0]!.push(createBlock('text'));
    cols.columns[1]!.push(createBlock('button'));
    const parsed = blockSchema.parse(cols);
    expect(parsed.type).toBe('columns');
  });

  it('rejects a columns block when ratios length differs', () => {
    const cols = createBlock('columns');
    if (cols.type !== 'columns') throw new Error('bad factory');
    cols.columnRatios = [1, 1, 1];
    expect(() => blockSchema.parse(cols)).toThrow();
  });

  it('accepts a dynamic block with a condition and both branches', () => {
    const dyn = createBlock('dynamic');
    if (dyn.type !== 'dynamic') throw new Error('bad factory');
    dyn.ifContent.push(createBlock('text'));
    dyn.elseContent.push(createBlock('text'));
    const parsed = blockSchema.parse(dyn);
    expect(parsed.type).toBe('dynamic');
  });

  it('all 10 block types round-trip through the factory', () => {
    const types = [
      'text',
      'image',
      'button',
      'divider',
      'spacer',
      'columns',
      'hero',
      'social',
      'footer',
      'dynamic',
    ] as const;
    for (const t of types) {
      const b = createBlock(t);
      expect(() => blockSchema.parse(b)).not.toThrow();
    }
  });
});
