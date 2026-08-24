/**
 * Every declared block type survives both renderers.
 *
 * Worth having because the obvious safety net does not cover this. `renderBlock`
 * has no `default` case and returns `string`, so an unhandled type is a
 * TYPECHECK failure ("Function lacks ending return statement") — verified by
 * deleting the `code` case and running tsc. That protects the HTML renderer at
 * compile time and it is genuinely strong, but it says nothing about whether
 * the block produces anything, and the plain-text renderer is a second switch
 * that has to be remembered separately.
 *
 * So this walks BLOCK_TYPES itself: add a type to the list and forget either
 * renderer, and one of these fails.
 */
import { describe, it, expect } from 'vitest';
import { renderEmail } from './render.js';
import { renderPlainText } from './plain-text.js';
import { BLOCK_TYPES, type EmailSchema } from '../schema/blocks.js';
import { createBlock, createEmptyEmail } from '../schema/factory.js';

/** Blocks whose whole job is vertical space produce no words, by design. */
const NO_TEXT_OF_THEIR_OWN = new Set(['spacer', 'columns', 'hero', 'dynamic', 'share']);

const CONTEXT = {
  contact: { firstName: 'Jana', email: 'jana@test.local' },
  system: {
    companyName: 'Obchod s.r.o.',
    companyAddress: 'Nádražní 1, 110 00 Praha',
    unsubscribeUrl: 'https://t.example/u/abc',
    viewInBrowserUrl: 'https://t.example/b/xyz',
  },
} as never;

function emailWith(blocks: EmailSchema['blocks']): EmailSchema {
  return { ...createEmptyEmail(), subject: 'Coverage', blocks };
}

describe('every block type in BLOCK_TYPES', () => {
  it('the list is the one the schema exports, not a copy', () => {
    // A local list would drift; this asserts the count so a silent removal
    // cannot make the loops below vacuous.
    expect(BLOCK_TYPES.length).toBeGreaterThanOrEqual(15);
    expect(BLOCK_TYPES).toContain('code');
    expect(BLOCK_TYPES).toContain('share');
    expect(BLOCK_TYPES).toContain('social');
  });

  it.each(BLOCK_TYPES.map((t) => [t] as const))('%s renders to HTML', (type) => {
    const block = createBlock(type);
    const { html } = renderEmail(emailWith([block]), { context: CONTEXT, stream: 'broadcast' });
    expect(html).toMatch(/^<!DOCTYPE html/);
    expect(html).toContain('</html>');
  });

  it.each(BLOCK_TYPES.map((t) => [t] as const))('%s renders to plain text', (type) => {
    const block = createBlock(type);
    const out = renderPlainText(emailWith([block]), { context: CONTEXT, stream: 'broadcast' });
    // Every message has at least its subject; the assertion that matters is
    // that the call returns rather than throwing on an unhandled type.
    expect(out).toContain('Coverage');
  });

  it.each(
    BLOCK_TYPES.filter((t) => !NO_TEXT_OF_THEIR_OWN.has(t) && t !== 'divider').map(
      (t) => [t] as const,
    ),
  )('%s contributes something visible to the text part', (type) => {
    const block = createBlock(type);
    const out = renderPlainText(emailWith([block]), { context: CONTEXT, stream: 'broadcast' });
    const withoutHeader = out.replace(/^Coverage\n*/, '').trim();
    expect(withoutHeader.length, `${type} produced no text at all`).toBeGreaterThan(0);
  });

  it('a factory block of every type is accepted by the schema', async () => {
    const { emailSchema } = await import('../schema/blocks.js');
    for (const type of BLOCK_TYPES) {
      const parsed = emailSchema.safeParse(emailWith([createBlock(type)]));
      expect(parsed.success, `${type} failed schema validation`).toBe(true);
    }
  });
});
