import { describe, it, expect, beforeAll } from 'vitest';
import { registerLocaleFilters } from './register-locale-filters.js';
import { parseMergeTags } from './merge-tags.js';
import { renderLiquidSync } from './liquid.js';

/**
 * Both render paths, because the bug this file exists to prevent was that only
 * one of them had the filters. parseMergeTags switches to Liquid the moment it
 * sees `{%` anywhere in the template, so a template that renders correctly can
 * start rendering names unchanged the day someone adds an {% if %}.
 */
beforeAll(() => {
  registerLocaleFilters();
});

const NAMES: Array<[string, string]> = [
  ['Petr', 'Petře'],
  ['Novák', 'Nováku'],
  ['Novotný', 'Novotný'],
  ['Janů', 'Janů'],
  ['Jana', 'Jano'],
  ['Nováková', 'Nováková'],
];

describe('vocative filter — regex merge-tag path', () => {
  for (const [input, expected] of NAMES) {
    it(`${input} → ${expected}`, () => {
      const out = parseMergeTags('{{contact.first_name | vocative}}', {
        contact: { firstName: input } as never,
      });
      expect(out).toBe(expected);
    });
  }
});

describe('vocative filter — Liquid path', () => {
  for (const [input, expected] of NAMES) {
    it(`${input} → ${expected}`, () => {
      expect(renderLiquidSync('{{ n | vocative }}', { n: input })).toBe(expected);
    });
  }

  it('applies inside Liquid control flow, which is what forces this path', () => {
    const tpl = '{% if n %}Ahoj {{ n | vocative }}!{% endif %}';
    expect(renderLiquidSync(tpl, { n: 'Novotný' })).toBe('Ahoj Novotný!');
    expect(renderLiquidSync(tpl, { n: 'Novák' })).toBe('Ahoj Nováku!');
  });
});

describe('other filters registered in both paths', () => {
  it('sk_vocative is identity for names — modern Slovak has no productive vocative', () => {
    expect(renderLiquidSync('{{ n | sk_vocative }}', { n: 'Peter' })).toBe('Peter');
    expect(
      parseMergeTags('{{contact.first_name | sk_vocative}}', {
        contact: { firstName: 'Peter' } as never,
      }),
    ).toBe('Peter');
  });

  it('decline picks the locale from its argument', () => {
    expect(renderLiquidSync('{{ n | decline: "cs" }}', { n: 'Novák' })).toBe('Nováku');
    expect(renderLiquidSync('{{ n | decline: "sk" }}', { n: 'Novák' })).toBe('Novák');
    expect(renderLiquidSync('{{ n | decline }}', { n: 'Novák' })).toBe('Nováku');
  });

  it('salutation is the vocative of the given name', () => {
    expect(renderLiquidSync('{{ n | salutation }}', { n: 'Petr' })).toBe('Petře');
  });
});
