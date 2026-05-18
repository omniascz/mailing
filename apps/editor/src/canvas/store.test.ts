import { describe, expect, it } from 'vitest';
import type { ColumnsBlock, DynamicBlock, HeroBlock } from '../schema/blocks.js';
import { createBlock, createEmptyEmail } from '../schema/factory.js';
import { initialState, reducer, resolveContainer, type BlockPath } from './store.js';

describe('editor reducer', () => {
  it('adds a block at root', () => {
    let state = initialState(createEmptyEmail());
    state = reducer(state, { kind: 'addBlock', blockType: 'text' });
    expect(state.email.blocks.length).toBe(1);
    expect(state.email.blocks[0]!.type).toBe('text');
  });

  it('removes a block by path', () => {
    let state = initialState(createEmptyEmail());
    state = reducer(state, { kind: 'addBlock', blockType: 'text' });
    state = reducer(state, { kind: 'addBlock', blockType: 'button' });
    expect(state.email.blocks.length).toBe(2);
    state = reducer(state, { kind: 'removeBlock', path: [['root', 0]] });
    expect(state.email.blocks.length).toBe(1);
    expect(state.email.blocks[0]!.type).toBe('button');
  });

  it('moves a block to a new position at root', () => {
    let state = initialState(createEmptyEmail());
    state = reducer(state, { kind: 'addBlock', blockType: 'text' });
    state = reducer(state, { kind: 'addBlock', blockType: 'button' });
    state = reducer(state, { kind: 'addBlock', blockType: 'divider' });
    state = reducer(state, {
      kind: 'moveBlock',
      from: [['root', 0]],
      to: { parentPath: [], parentKey: 'root', index: 2 },
    });
    // After removing text from [text, button, divider] we get [button, divider],
    // then inserting text at index 2 appends it at the end.
    expect(state.email.blocks.map((b) => b.type)).toEqual(['button', 'divider', 'text']);
  });

  it('updates a block with a patch', () => {
    let state = initialState(createEmptyEmail());
    state = reducer(state, { kind: 'addBlock', blockType: 'spacer' });
    state = reducer(state, {
      kind: 'updateBlock',
      path: [['root', 0]],
      patch: { height: 40 },
    });
    const block = state.email.blocks[0];
    expect(block && block.type === 'spacer' && block.height).toBe(40);
  });

  it('undo and redo walk the history', () => {
    let state = initialState(createEmptyEmail());
    state = reducer(state, { kind: 'addBlock', blockType: 'text' });
    state = reducer(state, { kind: 'addBlock', blockType: 'button' });
    expect(state.email.blocks.length).toBe(2);
    state = reducer(state, { kind: 'undo' });
    expect(state.email.blocks.length).toBe(1);
    state = reducer(state, { kind: 'undo' });
    expect(state.email.blocks.length).toBe(0);
    state = reducer(state, { kind: 'redo' });
    expect(state.email.blocks.length).toBe(1);
  });

  it('adds a block into a columns container via parentKey', () => {
    let state = initialState(createEmptyEmail());
    state = reducer(state, { kind: 'addBlock', blockType: 'columns' });
    state = reducer(state, {
      kind: 'addBlock',
      blockType: 'text',
      parentPath: [['root', 0]],
      parentKey: 'col:0',
    });
    const cols = state.email.blocks[0] as ColumnsBlock;
    expect(cols.type).toBe('columns');
    expect(cols.columns[0]!.length).toBe(1);
    expect(cols.columns[0]![0]!.type).toBe('text');
  });

  it('adds and resolves a block inside a hero container', () => {
    let state = initialState(createEmptyEmail());
    state = reducer(state, { kind: 'addBlock', blockType: 'hero' });
    state = reducer(state, {
      kind: 'addBlock',
      blockType: 'button',
      parentPath: [['root', 0]],
      parentKey: 'hero',
    });
    const hero = state.email.blocks[0] as HeroBlock;
    expect(hero.content.length).toBe(1);
    const path: BlockPath = [
      ['root', 0],
      ['hero', 0],
    ];
    const resolved = resolveContainer(state.email, path);
    expect(resolved?.container[resolved.index]!.type).toBe('button');
  });

  it('adds a block into the else-branch of a dynamic container', () => {
    let state = initialState(createEmptyEmail());
    state = reducer(state, { kind: 'addBlock', blockType: 'dynamic' });
    state = reducer(state, {
      kind: 'addBlock',
      blockType: 'text',
      parentPath: [['root', 0]],
      parentKey: 'else',
    });
    const dyn = state.email.blocks[0] as DynamicBlock;
    expect(dyn.elseContent.length).toBe(1);
  });

  it('replaceEmail updates the whole tree and preserves history', () => {
    let state = initialState(createEmptyEmail());
    state = reducer(state, { kind: 'addBlock', blockType: 'text' });
    const replacement = createEmptyEmail();
    replacement.subject = 'Imported';
    replacement.blocks = [createBlock('divider')];
    state = reducer(state, { kind: 'replaceEmail', email: replacement });
    expect(state.email.subject).toBe('Imported');
    expect(state.email.blocks.length).toBe(1);
    expect(state.past.length).toBe(2);
  });
});
