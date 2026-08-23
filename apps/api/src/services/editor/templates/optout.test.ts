import { describe, it, expect } from 'vitest';
import { renderEmail } from '@forgemsg/editor/render';
import type { EmailSchema } from '@forgemsg/editor/schema';
import { TEMPLATES, localeOf } from './index.js';

/**
 * Every template in the library, rendered as marketing, carries an opt-out.
 *
 * Not a sample. Sixty-one of these eighty-one have no footer block, and before
 * the renderer started appending one, every one of those sixty-one rendered
 * with no unsubscribe link and no postal address.
 *
 * Rendered with a real system context, because that is what the sending path
 * supplies: the unsubscribe URL is per-recipient and the address comes from the
 * organisation.
 */

const SYSTEM = {
  system: {
    companyName: 'Obchod s.r.o.',
    companyAddress: 'Nádražní 1, 110 00 Praha',
    unsubscribeUrl: 'https://t.example/u/abc',
  },
} as never;

describe('every built-in template', () => {
  it('there are enough of them for this to mean something', () => {
    // Guards against the loops below passing because the library shrank.
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(81);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    '%s renders an opt-out link when sent as marketing',
    (id, t) => {
      const { html } = renderEmail(t.schema as unknown as EmailSchema, {
        context: SYSTEM,
        stream: 'broadcast',
        locale: localeOf(t),
      });
      expect(html, `${id} rendered without an unsubscribe link`).toContain(
        'https://t.example/u/abc',
      );
    },
  );

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    '%s renders the sender postal address when sent as marketing',
    (id, t) => {
      const { html } = renderEmail(t.schema as unknown as EmailSchema, {
        context: SYSTEM,
        stream: 'broadcast',
      });
      expect(html, `${id} rendered without a postal address`).toContain('Nádražní 1, 110 00 Praha');
    },
  );

  it('a Czech template gets the Czech label, an English one the English label', () => {
    const cs = TEMPLATES.find((t) => localeOf(t) === 'cs')!;
    const en = TEMPLATES.find((t) => localeOf(t) === 'en')!;
    const csHtml = renderEmail(cs.schema as unknown as EmailSchema, {
      context: SYSTEM,
      stream: 'broadcast',
      locale: localeOf(cs),
    }).html;
    const enHtml = renderEmail(en.schema as unknown as EmailSchema, {
      context: SYSTEM,
      stream: 'broadcast',
      locale: localeOf(en),
    }).html;
    expect(csHtml).toContain('Odhlásit z odběru');
    expect(enHtml).toContain('Unsubscribe');
  });

  it('no template carries a block type the renderer cannot draw', () => {
    // Two templates used to carry a 'countdown' block. The renderer has no
    // branch for it, so the urgency device those templates are built around was
    // invisible in every inbox. Both were rebuilt; this keeps them rebuilt.
    const KNOWN = new Set([
      'text',
      'image',
      'button',
      'divider',
      'spacer',
      'social',
      'product',
      'video',
      'coupon',
      'footer',
      'columns',
      'hero',
      'dynamic',
    ]);
    const unknown: string[] = [];
    const walk = (n: unknown, id: string): void => {
      if (Array.isArray(n)) return n.forEach((x) => walk(x, id));
      if (n && typeof n === 'object') {
        const o = n as Record<string, unknown>;
        if (typeof o.type === 'string' && o.id && !KNOWN.has(o.type)) {
          unknown.push(`${id}: ${o.type}`);
        }
        Object.values(o).forEach((v) => walk(v, id));
      }
    };
    for (const t of TEMPLATES) walk((t.schema as { blocks?: unknown }).blocks, t.id);
    expect(unknown, 'a block the renderer skips silently').toEqual([]);
  });
});
