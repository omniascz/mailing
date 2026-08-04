import { describe, it, expect } from 'vitest';
import { buildSalutation, getVocative } from './cz-sk-inference.js';

/**
 * buildSalutation used to document the surname form in its examples
 * ("Vážený pane Nováku,") and then ignore the lastName argument entirely,
 * returning a bare "Vážený pane,". These pin the behaviour to the promise.
 */
describe('buildSalutation — formal', () => {
  it('addresses a man by surname in the vocative', () => {
    expect(buildSalutation('male', 'Petr', 'Novák')).toBe('Vážený pane Nováku,');
  });

  it('leaves an adjectival surname unchanged', () => {
    expect(buildSalutation('male', 'Petr', 'Novotný')).toBe('Vážený pane Novotný,');
  });

  it('addresses a woman by surname, which is invariant for -ová', () => {
    expect(buildSalutation('female', 'Jana', 'Nováková')).toBe('Vážená paní Nováková,');
  });

  it('drops to the bare title when the surname is missing', () => {
    expect(buildSalutation('male', 'Jan', null)).toBe('Vážený pane,');
    expect(buildSalutation('female', 'Jana', null)).toBe('Vážená paní,');
  });

  it('falls back to a neutral greeting when the gender is unknown', () => {
    // No gendered title exists, so guessing one would be worse than not.
    expect(buildSalutation('unknown', 'Petr', 'Novák')).toBe('Dobrý den, Petře,');
    expect(buildSalutation('unknown', null, null)).toBe('Dobrý den,');
  });
});

describe('buildSalutation — informal', () => {
  it('uses the given name in the vocative', () => {
    expect(buildSalutation('male', 'Petr', 'Novák', 'informal')).toBe('Dobrý den, Petře,');
    expect(buildSalutation('female', 'Jana', 'Nováková', 'informal')).toBe('Dobrý den, Jano,');
  });

  it('drops the name when there is none', () => {
    expect(buildSalutation('male', null, 'Novák', 'informal')).toBe('Dobrý den,');
  });
});

describe('getVocative — single source of truth', () => {
  it('matches the i18n-cs implementation, including the classes the old local copy got wrong', () => {
    expect(getVocative('Novotný')).toBe('Novotný');
    expect(getVocative('Janů')).toBe('Janů');
    expect(getVocative('Němec')).toBe('Němče');
    expect(getVocative('Petr')).toBe('Petře');
  });
});
