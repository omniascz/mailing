import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNodesOfferable, UNOFFERABLE_NODE_TYPES } from './unofferable-nodes.js';

/**
 * The cascade step cannot be chosen, and cannot arrive by another door.
 *
 * It declares { channel, delayHours, condition } and nothing else — no
 * template, subject, body or campaign — so it has nowhere to get the content it
 * is supposed to send and fails on every run.
 *
 * The editor already does not offer it. What was open is the save route, which
 * validates nodes as { id: string, type: string } and would accept one from the
 * API, a workflow import or the marketplace.
 */

const WEB = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  '..',
  'web',
  'src',
  'app',
  '(dashboard)',
  'workflows',
  '[id]',
  'edit',
  'workflow-editor.tsx',
);

describe('the editor does not offer it', () => {
  it('cascade is absent from the palette', () => {
    // Level (a): the user cannot pick it. Asserted against the real file rather
    // than assumed, because this is the half that was already true and the one
    // most likely to be undone by someone extending the palette.
    const src = readFileSync(WEB, 'utf8');
    const addable = src.slice(src.indexOf('const ADDABLE'), src.indexOf('const NODE_ICONS'));
    expect(
      addable.length,
      'ADDABLE block not found — the assertion below would be vacuous',
    ).toBeGreaterThan(100);
    expect(addable).not.toContain('cascade');
  });
});

describe('the API does not accept it', () => {
  it('refuses a cascade node, naming the node and why', () => {
    let message = '';
    try {
      assertNodesOfferable([
        { id: 'n1', type: 'send_email' },
        { id: 'n2', type: 'cascade' },
      ]);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message, 'a cascade node saved through the API is a workflow that never runs').toMatch(
      /Node "n2" is of type "cascade"/,
    );
    expect(message).toMatch(/no content fields/);
  });

  it('leaves every other node type alone', () => {
    expect(() =>
      assertNodesOfferable([
        { id: 'a', type: 'send_email' },
        { id: 'b', type: 'wait' },
        { id: 'c', type: 'condition' },
        { id: 'd', type: 'send_review_request' },
      ]),
    ).not.toThrow();
  });

  it('tolerates a workflow saved with no nodes', () => {
    expect(() => assertNodesOfferable(undefined)).not.toThrow();
    expect(() => assertNodesOfferable([])).not.toThrow();
  });

  it('every refusal carries a reason, so the message is never just a code', () => {
    for (const [type, reason] of Object.entries(UNOFFERABLE_NODE_TYPES)) {
      expect(reason.length, `${type} has no reason text`).toBeGreaterThan(40);
    }
  });
});
