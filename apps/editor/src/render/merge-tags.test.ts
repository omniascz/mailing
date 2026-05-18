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

describe('listMergeTags', () => {
  it('lists unique tags in order', () => {
    const tags = listMergeTags('Hi {{first_name}}, {{last_name}} — {{first_name}}');
    expect(tags).toEqual(['first_name', 'last_name']);
  });

  it('returns an empty list for plain strings', () => {
    expect(listMergeTags('no tags here')).toEqual([]);
  });
});
