import { describe, it, expect } from 'vitest';
import { renderEmail, registerLocaleFilters } from '@forgemsg/editor/render';
import type { EmailSchema } from '@forgemsg/editor/schema';
import { CZECH_TEMPLATES as BATCH_1 } from './czech.js';
import { CZECH_TEMPLATES_2 as BATCH_2 } from './czech-2.js';
import { TEMPLATES, localeOf, getTemplatesByLocale, getFamily } from './index.js';

/**
 * What makes these Czech templates rather than ten more entries.
 *
 * The assertions are about the text and the rendered output, not the count. A
 * test that only checked `length` would pass for ten copies of an English
 * template with Czech names.
 */

// apps/api calls this at boot (index.ts:321). Without it the locale filters are
// not registered and `|vocative` silently passes the value through — which is
// exactly the failure this file exists to catch, so it must be armed here too.
registerLocaleFilters();

/**
 * The whole Czech set, both batches.
 *
 * Every per-template assertion below runs over this, not over one file. The
 * layout-uniqueness check in particular is only meaningful across the set: a
 * second batch that repeated a shape from the first would be padding, and a
 * per-file check would not notice.
 */
const CZECH_TEMPLATES = [...BATCH_1, ...BATCH_2];

const GREETING_TAG = '{{contact.first_name|vocative|default:"zákazníku"}}';

/** Characters that only appear in Czech/Slovak, not in English. */
const CZECH_LETTERS = /[ěščřžýáíéúůňťďĚŠČŘŽÝÁÍÉÚŮŇŤĎ]/;

function schemaOf(t: (typeof CZECH_TEMPLATES)[number]) {
  return t.schema as {
    subject: string;
    preheader: string;
    blocks: Array<{ type?: string }>;
  };
}

/** Every string in the schema, flattened. */
function allText(schema: unknown, out: string[] = []): string[] {
  if (typeof schema === 'string') out.push(schema);
  else if (Array.isArray(schema)) schema.forEach((v) => allText(v, out));
  else if (schema && typeof schema === 'object')
    Object.values(schema).forEach((v) => allText(v, out));
  return out;
}

describe('Czech templates — the text is Czech', () => {
  it('there are twenty of them and all are marked cs', () => {
    expect(BATCH_1).toHaveLength(10);
    expect(BATCH_2).toHaveLength(10);
    expect(CZECH_TEMPLATES).toHaveLength(20);
    for (const t of CZECH_TEMPLATES) expect(localeOf(t), t.id).toBe('cs');
  });

  it('every id is unique across both batches', () => {
    const ids = CZECH_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size, ids.join(',')).toBe(ids.length);
  });

  it.each(CZECH_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s has a Czech subject and preheader',
    (id, t) => {
      const s = schemaOf(t);
      expect(s.subject, `${id} subject is not Czech: ${s.subject}`).toMatch(CZECH_LETTERS);
      expect(s.preheader, `${id} preheader is not Czech: ${s.preheader}`).toMatch(CZECH_LETTERS);
    },
  );

  it.each(CZECH_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s has Czech body copy, not an English template with a Czech name',
    (id, t) => {
      const body = allText(schemaOf(t).blocks).join(' ');
      expect(body, `${id} body has no Czech diacritics at all`).toMatch(CZECH_LETTERS);
      // A handful of English words that would give away a translation left half-done.
      for (const giveaway of ['Unsubscribe', 'Shop now', 'View in browser', 'Hi there']) {
        expect(body, `${id} still contains "${giveaway}"`).not.toContain(giveaway);
      }
    },
  );
});

describe('Czech templates — the greeting declines', () => {
  it.each(CZECH_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s addresses the reader through the vocative filter',
    (id, t) => {
      const body = allText(schemaOf(t)).join(' ');
      expect(body, `${id} does not use the declension filter`).toContain(GREETING_TAG);
      // The shape that made the filter pointless: a bare first name after a greeting.
      expect(body, `${id} greets with an undeclined first name`).not.toMatch(
        /Dobrý den \{\{\s*(contact\.)?first_name\s*(\|\s*default[^}]*)?\}\}/,
      );
    },
  );

  it('renders "Petro", not "Petra"', () => {
    // The whole point, measured end to end through the real renderer rather
    // than asserted from the tag being present.
    const t = CZECH_TEMPLATES.find((x) => x.id === 'cs-order-confirm')!;
    const { html } = renderEmail(t.schema as unknown as EmailSchema, {
      context: { contact: { first_name: 'Petra' } } as never,
    });
    expect(html).toContain('Dobrý den Petro,');
    expect(html).not.toContain('Dobrý den Petra,');
  });

  it('falls back to a declined noun when the name is unknown', () => {
    const t = CZECH_TEMPLATES.find((x) => x.id === 'cs-order-confirm')!;
    const { html } = renderEmail(t.schema as unknown as EmailSchema, {
      context: { contact: {} } as never,
    });
    expect(html, 'an anonymous reader must still be addressed in Czech').toContain(
      'Dobrý den zákazníku,',
    );
  });
});

describe('Czech templates — structure', () => {
  it.each(CZECH_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s carries a footer block, which is where the address and opt-out attach',
    (id, t) => {
      const types = schemaOf(t).blocks.map((b) => b.type);
      expect(types, `${id} has no footer block`).toContain('footer');
    },
  );

  it('renders the unsubscribe link and the postal address', () => {
    // renderFooter is the only place either is added; a template without a
    // footer block gets neither.
    const t = CZECH_TEMPLATES[0]!;
    const { html } = renderEmail(t.schema as unknown as EmailSchema, {
      context: {
        system: { companyName: 'Obchod s.r.o.', companyAddress: 'Nádražní 1, Praha' },
      } as never,
    });
    expect(html).toContain('Unsubscribe');
    expect(html).toContain('Nádražní 1, Praha');
  });

  it('no two share a layout', () => {
    // The library this batch joins has 20 distinct layouts across 71 templates,
    // and two of them cover 46. Ten more of the same shape would be padding.
    const seen = new Map<string, string>();
    for (const t of CZECH_TEMPLATES) {
      const key = schemaOf(t)
        .blocks.map((b) => b.type)
        .filter((x) => x !== 'spacer' && x !== 'divider')
        .filter((x, i, a) => x !== a[i - 1])
        .join('>');
      const clash = seen.get(key);
      expect(clash, `${t.id} has the same layout as ${clash}: ${key}`).toBeUndefined();
      seen.set(key, t.id);
    }
    expect(seen.size).toBe(20);
  });

  it('uses the blocks the product has and the library barely touched', () => {
    const used = new Set<string>();
    for (const t of CZECH_TEMPLATES) allBlockTypes(t.schema, used);
    // product 4x, coupon 3x across the previous 71.
    expect(used).toContain('product');
    expect(used).toContain('coupon');
    expect(used).toContain('dynamic');
    // share arrived with PR #55 and belongs on the content emails — a digest
    // is the kind of thing someone forwards, an invoice is not.
    expect(used).toContain('share');
    // countdown is deliberately absent: the renderer has no branch for it, so a
    // block of that type produces no output at all.
    expect(used, 'countdown renders to nothing — see the file header').not.toContain('countdown');
  });

  it('every one renders to HTML', () => {
    for (const t of CZECH_TEMPLATES) {
      const { html } = renderEmail(t.schema as unknown as EmailSchema);
      expect(html, `${t.id} did not render`).toContain('<!DOCTYPE html');
      expect(html).toContain('</html>');
    }
  });

  it('block ids are stable across imports', () => {
    // The other template files build ids with Math.random(), so the same source
    // yields a different schema every time it is loaded.
    const ids = CZECH_TEMPLATES.flatMap((t) =>
      schemaOf(t).blocks.map((b) => (b as { id: string }).id),
    );
    expect(
      ids.every((i) => /^[a-z]{2}\d+[a-z]?$/.test(i)),
      ids.join(','),
    ).toBe(true);
  });
});

describe('the other templates are untouched', () => {
  it('the pre-existing library still reports as English', () => {
    const notCzech = TEMPLATES.filter((t) => !t.id.startsWith('cs-'));
    expect(notCzech).toHaveLength(71);
    for (const t of notCzech) {
      expect(localeOf(t), `${t.id} changed locale`).toBe('en');
      expect(t.family, `${t.id} gained a family`).toBeUndefined();
    }
  });

  it('locale filtering separates the two sets', () => {
    expect(getTemplatesByLocale('cs')).toHaveLength(20);
    expect(getTemplatesByLocale('en')).toHaveLength(71);
    expect(getTemplatesByLocale('sk')).toHaveLength(0);
  });

  it('a family groups the variants of one email', () => {
    expect(getFamily('order-confirmation').map((t) => t.id)).toEqual(['cs-order-confirm']);
    expect(getFamily('nothing-like-this')).toEqual([]);
  });

  it('every template has its own family, so a translation can pair with it', () => {
    // `family` groups the same email ACROSS LANGUAGES, not the steps of a
    // series — batch one gave the two cart reminders their own families and
    // the third step follows that. Sharing one across steps would mean a
    // future English welcome-1 could not be paired with the Czech one.
    const families = CZECH_TEMPLATES.map((t) => t.family);
    expect(families.every(Boolean), 'a Czech template has no family').toBe(true);
    expect(new Set(families).size, families.join(',')).toBe(CZECH_TEMPLATES.length);
    for (const f of families) expect(getFamily(f!)).toHaveLength(1);
  });
});

function allBlockTypes(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) return node.forEach((n) => allBlockTypes(n, out));
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.type === 'string') out.add(o.type);
    Object.values(o).forEach((v) => allBlockTypes(v, out));
  }
}
