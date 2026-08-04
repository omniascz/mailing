/**
 * Integration smoke-tests for CZ/SK merge-tag pipe filters (#606–#608).
 *
 * These tests call registerCzSkMergeFilters() and then exercise the
 * parseMergeTags() function to verify the full pipe from template →
 * declension engine → rendered string.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parseMergeTags } from '@forgemsg/editor/render';
import { registerCzSkMergeFilters } from './merge-filters-cz-sk.js';

beforeAll(() => {
  registerCzSkMergeFilters();
});

// ─── Czech vocative ────────────────────────────────────────────────────────────

/**
 * The |genitive and |dative blocks that used to live here were removed with
 * the filters themselves. They asserted "Petr → Petra" and "Jana → Jany",
 * which the rules did get right — but the same rules produced "Hrubýa",
 * "Janůovi" and "Tomáša", and nothing in the repository called any of them.
 */
describe('|vocative (Czech 5th case)', () => {
  it('Petr → Petře', () => {
    const ctx = { contact: { first_name: 'Petr' } };
    expect(parseMergeTags('Vážený {{contact.first_name|vocative}},', ctx)).toBe('Vážený Petře,');
  });

  it('Pavel → Pavle', () => {
    const ctx = { contact: { first_name: 'Pavel' } };
    expect(parseMergeTags('Ahoj, {{contact.first_name|vocative}}!', ctx)).toBe('Ahoj, Pavle!');
  });

  it('Jana → Jano', () => {
    const ctx = { contact: { first_name: 'Jana' } };
    expect(parseMergeTags('Milá {{contact.first_name|vocative}},', ctx)).toBe('Milá Jano,');
  });

  it('Tomáš → Tomáši', () => {
    const ctx = { contact: { first_name: 'Tomáš' } };
    expect(parseMergeTags('Dobrý den, {{contact.first_name|vocative}}!', ctx)).toBe(
      'Dobrý den, Tomáši!',
    );
  });

  it('empty → empty', () => {
    const ctx = { contact: { first_name: '' } };
    expect(parseMergeTags('Ahoj, {{contact.first_name|vocative}}!', ctx)).toBe('Ahoj, !');
  });
});

// ─── Czech genitive ────────────────────────────────────────────────────────────

describe('|sk_vocative (Slovak)', () => {
  it('Peter → Peter', () => {
    const ctx = { contact: { first_name: 'Peter' } };
    expect(parseMergeTags('Vážený {{contact.first_name|sk_vocative}},', ctx)).toBe('Vážený Peter,');
  });

  it('Jana → Jana (Slovak vocative = nominative for most female names)', () => {
    const ctx = { contact: { first_name: 'Jana' } };
    expect(parseMergeTags('Milá {{contact.first_name|sk_vocative}},', ctx)).toBe('Milá Jana,');
  });
});

// ─── Locale-aware |decline ────────────────────────────────────────────────────

describe('|decline locale-aware alias', () => {
  it('defaults to Czech vocative', () => {
    const ctx = { contact: { first_name: 'Petr' } };
    expect(parseMergeTags('Ahoj {{contact.first_name|decline}}!', ctx)).toBe('Ahoj Petře!');
  });

  it('uses Slovak when locale="sk" — Jana stays Jana (SK vocative = nominative)', () => {
    const ctx = { contact: { first_name: 'Jana' } };
    expect(parseMergeTags('Ahoj {{contact.first_name|decline:"sk"}}!', ctx)).toBe('Ahoj Jana!');
  });
});

// ─── Chained filters ─────────────────────────────────────────────────────────

describe('chained filters', () => {
  it('|vocative|default:"zákazníku" — fallback when name missing', () => {
    const ctx = { contact: {} };
    expect(parseMergeTags('Vážený {{contact.first_name|vocative|default:"zákazníku"}},', ctx)).toBe(
      'Vážený zákazníku,',
    );
  });

  it('|vocative|default — name present, default ignored', () => {
    const ctx = { contact: { first_name: 'Petr' } };
    expect(parseMergeTags('Vážený {{contact.first_name|vocative|default:"zákazníku"}},', ctx)).toBe(
      'Vážený Petře,',
    );
  });
});
