import { describe, it, expect, beforeAll } from 'vitest';
import {
  validateMergeTags,
  availableMergeKeys,
  availableFilters,
  type MergeTagWarning,
} from './validate-merge-tags.js';
import { registerLocaleFilters } from './register-locale-filters.js';
import type { MergeTagContext } from './merge-tags.js';

const SAMPLE: MergeTagContext = {
  contact: {
    email: 'p@n.cz',
    firstName: 'Petr',
    lastName: 'Novák',
    custom_fields: { plan: 'pro' },
  },
  system: { unsubscribeUrl: 'https://u/1', companyName: 'Acme' },
};

let keys: Set<string>;

beforeAll(() => {
  // The CZ/SK filters are registered at process start in production; without
  // this the validator would correctly report `vocative` as unknown.
  registerLocaleFilters();
  keys = availableMergeKeys(SAMPLE);
});

const tokens = (w: MergeTagWarning[]) => w.map((x) => x.token).sort();

describe('availableMergeKeys', () => {
  it('offers both conventions, flat and namespaced', () => {
    for (const k of [
      'first_name',
      'firstName',
      'contact.first_name',
      'contact.firstName',
      'contact.email',
      'unsubscribe_url',
      'system.unsubscribe_url',
      'system.unsubscribeUrl',
      'contact.custom_fields.plan',
      'contact.plan',
    ]) {
      expect(keys.has(k), k).toBe(true);
    }
  });

  it('does not invent keys the context has no source for', () => {
    expect(keys.has('contact.frist_name')).toBe(false);
    expect(keys.has('system.unsubscribe_link')).toBe(false);
  });
});

describe('unknown tags', () => {
  it('reports a misspelt contact field and suggests the intended one', () => {
    const w = validateMergeTags('Ahoj {{contact.frist_name}},', keys);
    expect(tokens(w)).toEqual(['contact.frist_name']);
    expect(w[0]!.kind).toBe('unknown_tag');
    expect(w[0]!.suggestion).toBe('contact.first_name');
  });

  it('reports a misspelt system field', () => {
    const w = validateMergeTags('<a href="{{system.unsubscribe_urll}}">odhlásit</a>', keys);
    expect(tokens(w)).toEqual(['system.unsubscribe_urll']);
  });

  it('reports a bad tag inside control flow, where nothing renders to hint at it', () => {
    const w = validateMergeTags('{% if contact.frist_name %}Ahoj{% endif %}', keys);
    expect(tokens(w)).toEqual(['contact.frist_name']);
  });

  it('reports each distinct tag once, however often it appears', () => {
    const w = validateMergeTags(
      '{{contact.xx}} {{contact.xx}} {% if contact.xx %}a{% endif %}',
      keys,
    );
    expect(w).toHaveLength(1);
  });
});

describe('tags it cannot verify are never reported', () => {
  it('leaves foreign namespaces alone — they come from ctx.data at run time', () => {
    // These are real: the workflow templates use product.*, order.*, event.*.
    // The context type carries no such namespace, so a warning here would be
    // wrong on content that works.
    const t =
      '{{product.name}} {{order.total}} {{event.date}} {{loyalty.points}} {% if product.name %}x{% endif %}';
    expect(validateMergeTags(t, keys)).toEqual([]);
  });

  it('leaves bare tags alone — ctx.data is spread at top level', () => {
    expect(validateMergeTags('{{promo_code}} {{neexistuje}}', keys)).toEqual([]);
  });

  it('accepts a tag once the context actually supplies it', () => {
    const withData = availableMergeKeys({ ...SAMPLE, data: { promo_code: 'X' } });
    expect(validateMergeTags('{{promo_code}}', withData)).toEqual([]);
  });

  it('ignores coupon tags, which are a different syntax', () => {
    expect(validateMergeTags('{{ campaign.id : SUMMER-10 }}', keys)).toEqual([]);
  });
});

describe('unknown filters', () => {
  it('reports a misspelt locale filter and suggests the real one', () => {
    const w = validateMergeTags('{{contact.first_name | vokativ}}', keys);
    expect(tokens(w)).toEqual(['vokativ']);
    expect(w[0]!.kind).toBe('unknown_filter');
    expect(w[0]!.suggestion).toBe('vocative');
  });

  it('accepts every registered filter', () => {
    for (const f of ['vocative', 'sk_vocative', 'decline', 'salutation', 'default']) {
      expect(validateMergeTags(`{{contact.first_name | ${f}}}`, keys), f).toEqual([]);
    }
  });

  it('accepts LiquidJS builtins', () => {
    const t = '{{contact.first_name | upcase | truncate: 5 | escape}}';
    expect(validateMergeTags(t, keys)).toEqual([]);
  });

  it('does not treat a pipe inside a quoted argument as a filter', () => {
    expect(validateMergeTags('{{contact.first_name | default: "a|b"}}', keys)).toEqual([]);
  });

  it('reports the filter registry union, not one path only', () => {
    const f = availableFilters();
    expect(f.has('vocative')).toBe(true); // merge-tag registry
    expect(f.has('upcase')).toBe(true); // Liquid builtin
  });
});

describe('valid templates produce nothing', () => {
  it('a realistic campaign body', () => {
    const t = `
      <p>Dobrý den {{contact.first_name | vocative}},</p>
      {% if contact.plan %}<p>Váš tarif: {{contact.custom_fields.plan}}</p>{% endif %}
      <p>{{company_name}}, <a href="{{unsubscribe_url}}">odhlásit</a></p>
      <p>{{system.unsubscribeUrl}} {{contact.lastName}}</p>`;
    expect(validateMergeTags(t, keys)).toEqual([]);
  });

  it('empty and non-string input', () => {
    expect(validateMergeTags('', keys)).toEqual([]);
    expect(validateMergeTags(null as unknown as string, keys)).toEqual([]);
  });
});
