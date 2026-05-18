import { useCallback, useMemo, useReducer } from 'react';
import type { Block, BlockType, EmailSchema } from '../schema/blocks.js';
import { createBlock } from '../schema/factory.js';

/**
 * Reducer-based editor store. Intentionally framework-free — Zustand/Redux can
 * wrap this later but the actions + logic live here so everything is unit
 * testable without React.
 *
 * The path abstraction: every block is addressed by a BlockPath — an array of
 * (parentKey, index) pairs. Example:
 *   root[2] → [['root', 2]]
 *   columns[1].columns[0][3] → [['root', 1], ['col:0', 3]]
 *   hero[4].content[0] → [['root', 4], ['hero', 0]]
 * A path lets us walk any block tree, reuse the same insert/move/remove code,
 * and keep the reducer flat.
 */

export type PathKey = 'root' | `col:${number}` | 'hero' | 'if' | 'else';

export type BlockPath = Array<[PathKey, number]>;

export interface EditorState {
  email: EmailSchema;
  selectedPath: BlockPath | null;
  past: EmailSchema[];
  future: EmailSchema[];
}

export type EditorAction =
  | { kind: 'select'; path: BlockPath | null }
  | { kind: 'addBlock'; blockType: BlockType; parentPath?: BlockPath; index?: number; parentKey?: PathKey }
  | { kind: 'removeBlock'; path: BlockPath }
  | { kind: 'moveBlock'; from: BlockPath; to: { parentPath: BlockPath; parentKey: PathKey; index: number } }
  | { kind: 'updateBlock'; path: BlockPath; patch: Record<string, unknown> }
  | { kind: 'updateEmail'; patch: Partial<EmailSchema> }
  | { kind: 'replaceEmail'; email: EmailSchema }
  | { kind: 'undo' }
  | { kind: 'redo' };

const HISTORY_LIMIT = 100;

export function initialState(email: EmailSchema): EditorState {
  return { email, selectedPath: null, past: [], future: [] };
}

function cloneEmail(email: EmailSchema): EmailSchema {
  // Structured clone would preserve Date/Map/etc, but our blocks are plain
  // JSON already, so a JSON round-trip is the cheapest deep clone.
  return JSON.parse(JSON.stringify(email)) as EmailSchema;
}

function pushHistory(state: EditorState, nextEmail: EmailSchema): EditorState {
  const past = [...state.past, state.email];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { ...state, past, future: [], email: nextEmail };
}

/** Resolve a path to its container array + index so we can mutate it. */
function resolveContainer(
  email: EmailSchema,
  path: BlockPath,
): { container: Block[]; index: number } | null {
  if (path.length === 0) return null;
  let container: Block[] = email.blocks;

  for (let i = 0; i < path.length - 1; i++) {
    const step = path[i];
    if (!step) return null;
    const [, idx] = step;
    const block = container[idx];
    if (!block) return null;
    const nextStep = path[i + 1];
    if (!nextStep) return null;
    const [nextKey] = nextStep;

    if (block.type === 'columns' && typeof nextKey === 'string' && nextKey.startsWith('col:')) {
      const colIdx = Number(nextKey.slice(4));
      const col = block.columns[colIdx];
      if (!col) return null;
      container = col;
      continue;
    }
    if (block.type === 'hero' && nextKey === 'hero') {
      container = block.content;
      continue;
    }
    if (block.type === 'dynamic' && nextKey === 'if') {
      container = block.ifContent;
      continue;
    }
    if (block.type === 'dynamic' && nextKey === 'else') {
      container = block.elseContent;
      continue;
    }
    return null;
  }

  const last = path[path.length - 1];
  if (!last) return null;
  return { container, index: last[1] };
}

/** Resolve a parent path to the container array without consuming a final index. */
function resolveParent(email: EmailSchema, parentPath: BlockPath, parentKey: PathKey): Block[] | null {
  if (parentPath.length === 0) return email.blocks;
  const { container, index } = resolveContainer(email, parentPath) ?? { container: null, index: -1 };
  if (!container) return null;
  const parent = container[index];
  if (!parent) return null;
  if (parent.type === 'columns' && parentKey.startsWith('col:')) {
    const colIdx = Number(parentKey.slice(4));
    return parent.columns[colIdx] ?? null;
  }
  if (parent.type === 'hero' && parentKey === 'hero') return parent.content;
  if (parent.type === 'dynamic' && parentKey === 'if') return parent.ifContent;
  if (parent.type === 'dynamic' && parentKey === 'else') return parent.elseContent;
  return null;
}

export function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.kind) {
    case 'select':
      return { ...state, selectedPath: action.path };

    case 'addBlock': {
      const next = cloneEmail(state.email);
      const parentPath = action.parentPath ?? [];
      const parentKey: PathKey = action.parentKey ?? 'root';
      const parent = parentKey === 'root' ? next.blocks : resolveParent(next, parentPath, parentKey);
      if (!parent) return state;
      const block = createBlock(action.blockType);
      const index = action.index ?? parent.length;
      parent.splice(index, 0, block);
      return pushHistory(state, next);
    }

    case 'removeBlock': {
      const next = cloneEmail(state.email);
      const resolved = resolveContainer(next, action.path);
      if (!resolved) return state;
      resolved.container.splice(resolved.index, 1);
      const newState = pushHistory(state, next);
      return { ...newState, selectedPath: null };
    }

    case 'moveBlock': {
      const next = cloneEmail(state.email);
      const fromResolved = resolveContainer(next, action.from);
      if (!fromResolved) return state;
      const [removed] = fromResolved.container.splice(fromResolved.index, 1);
      if (!removed) return state;

      const toParent =
        action.to.parentKey === 'root' && action.to.parentPath.length === 0
          ? next.blocks
          : resolveParent(next, action.to.parentPath, action.to.parentKey);
      if (!toParent) return state;
      const insertAt = Math.min(Math.max(action.to.index, 0), toParent.length);
      toParent.splice(insertAt, 0, removed);
      return pushHistory(state, next);
    }

    case 'updateBlock': {
      const next = cloneEmail(state.email);
      const resolved = resolveContainer(next, action.path);
      if (!resolved) return state;
      const target = resolved.container[resolved.index];
      if (!target) return state;
      Object.assign(target, action.patch);
      return pushHistory(state, next);
    }

    case 'updateEmail': {
      const next = { ...cloneEmail(state.email), ...action.patch };
      if (action.patch.globalStyles) {
        next.globalStyles = { ...state.email.globalStyles, ...action.patch.globalStyles };
      }
      return pushHistory(state, next);
    }

    case 'replaceEmail':
      return pushHistory(state, cloneEmail(action.email));

    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1]!;
      return {
        ...state,
        email: previous,
        past: state.past.slice(0, -1),
        future: [state.email, ...state.future],
        selectedPath: null,
      };
    }

    case 'redo': {
      if (state.future.length === 0) return state;
      const next = state.future[0]!;
      return {
        ...state,
        email: next,
        past: [...state.past, state.email],
        future: state.future.slice(1),
        selectedPath: null,
      };
    }
  }
}

/** React hook wrapping the reducer with memoized action dispatchers. */
export function useEditor(initialEmail: EmailSchema) {
  const [state, dispatch] = useReducer(reducer, initialEmail, initialState);

  const actions = useMemo(
    () => ({
      select: (path: BlockPath | null) => dispatch({ kind: 'select', path }),
      addBlock: (
        blockType: BlockType,
        opts: { parentPath?: BlockPath; parentKey?: PathKey; index?: number } = {},
      ) => dispatch({ kind: 'addBlock', blockType, ...opts }),
      removeBlock: (path: BlockPath) => dispatch({ kind: 'removeBlock', path }),
      moveBlock: (from: BlockPath, to: { parentPath: BlockPath; parentKey: PathKey; index: number }) =>
        dispatch({ kind: 'moveBlock', from, to }),
      updateBlock: (path: BlockPath, patch: Record<string, unknown>) =>
        dispatch({ kind: 'updateBlock', path, patch }),
      updateEmail: (patch: Partial<EmailSchema>) => dispatch({ kind: 'updateEmail', patch }),
      replaceEmail: (email: EmailSchema) => dispatch({ kind: 'replaceEmail', email }),
      undo: () => dispatch({ kind: 'undo' }),
      redo: () => dispatch({ kind: 'redo' }),
    }),
    [],
  );

  const selectedBlock = useMemo<Block | null>(() => {
    if (!state.selectedPath) return null;
    const r = resolveContainer(state.email, state.selectedPath);
    return r?.container[r.index] ?? null;
  }, [state.email, state.selectedPath]);

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  const getBlockAtPath = useCallback(
    (path: BlockPath): Block | null => {
      const r = resolveContainer(state.email, path);
      return r?.container[r.index] ?? null;
    },
    [state.email],
  );

  return { state, actions, selectedBlock, canUndo, canRedo, getBlockAtPath };
}

// Exposed for tests that want to walk the tree directly.
export { resolveContainer };
