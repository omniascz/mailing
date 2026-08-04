import { describe, expect, it } from 'vitest';
import { listMergeTags, parseMergeTags } from './merge-tags.js';

describe('parseMergeTags', () => {
  it('replaces a direct top-level field', () => {
    const out = parseMergeTags('Hello {{first_name}}!', {
      contact: { firstName: 'Ada' },
    });
    expect(out).toBe('Hello Ada!');
  });

  it('resolves snake_case fields directly too', () => {
    const out = parseMergeTags('Hi {{first_name}}', {
      contact: { first_name: 'Bob' },
    });
    expect(out).toBe('Hi Bob');
  });

  it('falls back to custom_fields', () => {
    const out = parseMergeTags('Plan: {{plan}}', {
      contact: { custom_fields: { plan: 'pro' } },
    });
    expect(out).toBe('Plan: pro');
  });

  it('uses a default when the field is missing', () => {
    const out = parseMergeTags('Hi {{first_name|default:"there"}}', {
      contact: {},
    });
    expect(out).toBe('Hi there');
  });

  it('uses a default when the value is empty string', () => {
    const out = parseMergeTags('Hi {{first_name|default:"friend"}}', {
      contact: { firstName: '' },
    });
    expect(out).toBe('Hi friend');
  });

  it('resolves system fields', () => {
    const out = parseMergeTags('Year {{current_year}}', {
      system: { currentYear: '2026' },
    });
    expect(out).toBe('Year 2026');
  });

  it('leaves unknown tags as empty strings', () => {
    const out = parseMergeTags('A {{nope}} B', {});
    expect(out).toBe('A  B');
  });

  it('returns the original string when no tags are present', () => {
    expect(parseMergeTags('just text', {})).toBe('just text');
  });
});

describe('parseMergeTags — Liquid control-flow', () => {
  it('evaluates a {% for %} loop over an array custom-field', () => {
    const out = parseMergeTags('{% for p in products %}{{ p.name }}:{{ p.price }} {% endfor %}', {
      contact: {
        custom_fields: {
          products: [
            { name: 'Shirt', price: '20' },
            { name: 'Hat', price: '10' },
          ],
        },
      },
    });
    expect(out.trim()).toBe('Shirt:20 Hat:10');
  });

  it('evaluates a {% for %} loop over explicit ctx.data collections', () => {
    const out = parseMergeTags('{% for item in items %}[{{ item }}]{% endfor %}', {
      data: { items: ['a', 'b'] },
    });
    expect(out).toBe('[a][b]');
  });

  it('evaluates {% if %} against contact fields', () => {
    const tpl = 'Hi {{ first_name }}{% if vip %} (VIP){% endif %}';
    expect(
      parseMergeTags(tpl, { contact: { firstName: 'Ada', custom_fields: { vip: true } } }),
    ).toBe('Hi Ada (VIP)');
    expect(
      parseMergeTags(tpl, { contact: { firstName: 'Bob', custom_fields: { vip: false } } }),
    ).toBe('Hi Bob');
  });

  it('resolves system tags inside a Liquid template', () => {
    const out = parseMergeTags('{% if show %}<a href="{{ unsubscribe_url }}">off</a>{% endif %}', {
      system: { unsubscribeUrl: 'https://x/u/tok' },
      data: { show: true },
    });
    expect(out).toBe('<a href="https://x/u/tok">off</a>');
  });

  it('shields per-recipient coupon tags across the Liquid pass', () => {
    const out = parseMergeTags('{% if promo %}Code: {{coupon_code:batch7}}{% endif %}', {
      data: { promo: true },
    });
    // Coupon tag survives untouched for later per-recipient resolution.
    expect(out).toBe('Code: {{coupon_code:batch7}}');
  });

  it('falls back to the regex pass on malformed Liquid', () => {
    // Unclosed {% for %} → Liquid throws → regex pass runs, leaving text as-is.
    const out = parseMergeTags('Hi {{first_name}} {% for x in %}', {
      contact: { firstName: 'Ada' },
    });
    expect(out).toContain('Hi Ada');
  });
});

describe('listMergeTags', () => {
  it('lists unique tags in order', () => {
    const tags = listMergeTags('Hi {{first_name}}, {{last_name}} — {{first_name}}');
    expect(tags).toEqual(['first_name', 'last_name']);
  });

  it('returns an empty list for plain strings', () => {
    expect(listMergeTags('no tags here')).toEqual([]);
  });
});
