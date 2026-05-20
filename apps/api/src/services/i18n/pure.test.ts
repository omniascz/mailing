import { describe, it, expect } from 'vitest';
import {
  parseLocale,
  localeFallbackChain,
  selectVariant,
  collectTextNodes,
  applyTranslations,
  validateMergeTags,
  type LocaleVariant,
} from './pure.js';

describe('parseLocale', () => {
  it('parses full tag cs-CZ', () => {
    expect(parseLocale('cs-CZ')).toEqual({ language: 'cs', region: 'CZ' });
  });

  it('accepts underscore form', () => {
    expect(parseLocale('en_US')).toEqual({ language: 'en', region: 'US' });
  });

  it('handles bare language code', () => {
    expect(parseLocale('sk')).toEqual({ language: 'sk', region: null });
  });

  it('returns empty language for empty input', () => {
    expect(parseLocale('')).toEqual({ language: '', region: null });
  });
});

describe('localeFallbackChain', () => {
  it('cs-CZ falls through cs → en', () => {
    expect(localeFallbackChain('cs-CZ')).toEqual(['cs-cz', 'cs', 'en']);
  });

  it('bare sk falls through to default', () => {
    expect(localeFallbackChain('sk')).toEqual(['sk', 'en']);
  });

  it('skips default when equal to requested', () => {
    expect(localeFallbackChain('en', 'en')).toEqual(['en']);
  });

  it('honours a custom default', () => {
    expect(localeFallbackChain('sk-SK', 'cs')).toEqual(['sk-sk', 'sk', 'cs']);
  });
});

describe('selectVariant', () => {
  const variants: LocaleVariant<string>[] = [
    { locale: 'cs-CZ', content: 'Vítejte' },
    { locale: 'sk-SK', content: 'Vitajte' },
    { locale: 'en', content: 'Welcome' },
  ];

  it('exact match', () => {
    const res = selectVariant(variants, 'cs-CZ');
    expect(res?.content).toBe('Vítejte');
    expect(res?.matched).toBe('exact');
  });

  it('language fallback across regions', () => {
    const res = selectVariant(variants, 'cs-SK');
    expect(res?.content).toBe('Vítejte');
    expect(res?.matched).toBe('language');
  });

  it('falls through to default when language missing', () => {
    const res = selectVariant(variants, 'de-DE');
    expect(res?.content).toBe('Welcome');
    expect(res?.matched).toBe('default');
  });

  it('returns "any" when default is missing too', () => {
    const res = selectVariant([{ locale: 'fr', content: 'Bienvenue' }], 'de', 'en');
    expect(res?.content).toBe('Bienvenue');
    expect(res?.matched).toBe('any');
  });

  it('returns null for empty list', () => {
    expect(selectVariant([], 'cs')).toBeNull();
  });
});

describe('collectTextNodes', () => {
  it('collects translatable keys with JSON-pointer paths', () => {
    const root = {
      blocks: [
        { type: 'text', text: 'Hello' },
        { type: 'button', buttonText: 'Click', href: '/foo' },
      ],
      subject: 'Subject line',
    };
    const nodes = collectTextNodes(root);
    const paths = nodes.map((n) => n.path);
    expect(paths).toContain('/blocks/0/text');
    expect(paths).toContain('/blocks/1/buttonText');
    expect(paths).toContain('/subject');
    expect(paths).not.toContain('/blocks/1/href');
  });

  it('ignores empty strings', () => {
    const nodes = collectTextNodes({ text: '  ', content: 'Real' });
    expect(nodes.map((n) => n.path)).toEqual(['/content']);
  });

  it('does not recurse into translatable string values', () => {
    // Ensure we do not walk inside the string as if it were a tree
    const nodes = collectTextNodes({ text: 'Hello' });
    expect(nodes).toHaveLength(1);
  });
});

describe('applyTranslations', () => {
  it('writes translated values back by path', () => {
    const root = {
      blocks: [{ type: 'text', text: 'Hello' }],
      subject: 'Old subject',
    };
    const map = new Map<string, string>([
      ['/blocks/0/text', 'Ahoj'],
      ['/subject', 'Nový předmět'],
    ]);
    const out = applyTranslations(root, map);
    expect(out.subject).toBe('Nový předmět');
    expect(out.blocks[0]!.text).toBe('Ahoj');
  });

  it('does not mutate the input', () => {
    const root = { subject: 'Old' };
    const map = new Map([['/subject', 'New']]);
    applyTranslations(root, map);
    expect(root.subject).toBe('Old');
  });
});

describe('validateMergeTags', () => {
  it('passes when tags match', () => {
    const res = validateMergeTags(
      'Hello {{first_name}}, your coupon is {{coupon_code}}',
      'Dobrý den {{first_name}}, váš kód je {{coupon_code}}',
    );
    expect(res.ok).toBe(true);
    expect(res.missing).toEqual([]);
    expect(res.extra).toEqual([]);
  });

  it('flags missing tags', () => {
    const res = validateMergeTags('Hello {{first_name}} {{coupon_code}}', 'Ahoj {{first_name}}');
    expect(res.ok).toBe(false);
    expect(res.missing).toContain('{{coupon_code}}');
  });

  it('flags extra tags', () => {
    const res = validateMergeTags('Hello', 'Ahoj {{wild_tag}}');
    expect(res.ok).toBe(false);
    expect(res.extra).toContain('{{wild_tag}}');
  });
});
