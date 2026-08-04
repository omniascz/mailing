import { describe, it, expect } from 'vitest';
import { vocative, inferGender } from './vocative.js';

/**
 * The benchmark that motivated moving to czech-vocative, frozen as tests.
 *
 * The previous rule-based implementation scored 40/46 here. The three foreign
 * names from that benchmark (Nguyen, Kowalski, Müller) are deliberately absent
 * — Czech usage on them is genuinely unsettled, and asserting a form we are not
 * sure of would pin a guess rather than a rule.
 */
const CASES: Array<[name: string, gender: 'male' | 'female', expected: string, pattern: string]> = [
  ['Novák', 'male', 'Nováku', 'tvrdé -k'],
  ['Dvořák', 'male', 'Dvořáku', 'tvrdé -k'],
  ['Horák', 'male', 'Horáku', 'tvrdé -k'],
  ['Marek', 'male', 'Marku', '-ek prchavé e'],
  ['Sedláček', 'male', 'Sedláčku', '-ek prchavé e'],
  ['Jelínek', 'male', 'Jelínku', '-ek prchavé e'],
  ['Petr', 'male', 'Petře', '-r → -ře'],
  ['Alexandr', 'male', 'Alexandře', '-r → -ře'],
  ['Pavel', 'male', 'Pavle', '-el prchavé e'],
  ['Karel', 'male', 'Karle', '-el prchavé e'],
  ['Martin', 'male', 'Martine', 'tvrdé -n'],
  ['Zeman', 'male', 'Zemane', 'tvrdé -n'],
  ['David', 'male', 'Davide', 'tvrdé -d'],
  ['Jakub', 'male', 'Jakube', 'tvrdé -b'],
  ['Filip', 'male', 'Filipe', 'tvrdé -p'],
  ['Adam', 'male', 'Adame', 'tvrdé -m'],
  ['Tomáš', 'male', 'Tomáši', 'měkké -š'],
  ['Lukáš', 'male', 'Lukáši', 'měkké -š'],
  ['Aleš', 'male', 'Aleši', 'měkké -š'],
  ['Beneš', 'male', 'Beneši', 'měkké -š'],
  ['Ondřej', 'male', 'Ondřeji', 'měkké -j'],
  ['Matěj', 'male', 'Matěji', 'měkké -j'],
  ['Němec', 'male', 'Němče', 'měkké -c'],
  ['Hrubý', 'male', 'Hrubý', 'přídavné -ý'],
  ['Černý', 'male', 'Černý', 'přídavné -ý'],
  ['Novotný', 'male', 'Novotný', 'přídavné -ý'],
  ['Veselý', 'male', 'Veselý', 'přídavné -ý'],
  ['Krejčí', 'male', 'Krejčí', 'přídavné -í'],
  ['Jiří', 'male', 'Jiří', 'měkké -í'],
  ['Janů', 'male', 'Janů', 'nesklonné -ů'],
  ['Svoboda', 'male', 'Svobodo', 'mužské -a'],
  ['Procházka', 'male', 'Procházko', 'mužské -a'],
  ['Kučera', 'male', 'Kučero', 'mužské -a'],
  ['Honza', 'male', 'Honzo', 'mužské -a'],
  ['Nováková', 'female', 'Nováková', 'ženské -ová'],
  ['Procházková', 'female', 'Procházková', 'ženské -ová'],
  ['Svobodová', 'female', 'Svobodová', 'ženské -ová'],
  ['Krásná', 'female', 'Krásná', 'ženské -á'],
  ['Černá', 'female', 'Černá', 'ženské -á'],
  ['Anna', 'female', 'Anno', 'ženské -a'],
  ['Jana', 'female', 'Jano', 'ženské -a'],
  ['Monika', 'female', 'Moniko', 'ženské -a'],
  ['Kateřina', 'female', 'Kateřino', 'ženské -a'],
  ['Marie', 'female', 'Marie', 'ženské -ie'],
  ['Lucie', 'female', 'Lucie', 'ženské -ie'],
  ['Alice', 'female', 'Alice', 'ženské -e'],
];

describe('cs vocative — benchmark set', () => {
  it('covers all 46 benchmark names', () => {
    expect(CASES).toHaveLength(46);
  });

  for (const [name, gender, expected, pattern] of CASES) {
    it(`${name} (${pattern}) → ${expected}`, () => {
      expect(vocative(name, gender)).toBe(expected);
    });
  }
});

describe('cs vocative — contract preserved from the previous implementation', () => {
  it('transforms only the first token of a multi-word input', () => {
    expect(vocative('Petr Novák', 'male')).toBe('Petře Novák');
  });

  it('returns empty and whitespace-only input untouched', () => {
    expect(vocative('')).toBe('');
    expect(vocative('   ')).toBe('   ');
  });

  it('preserves capitalisation', () => {
    // The `vokativ` package lowercases its output; czech-vocative does not,
    // and this renders straight into a subject line.
    expect(vocative('Novák', 'male')).toBe('Nováku');
  });

  it('works without an explicit gender', () => {
    expect(vocative('Petr')).toBe('Petře');
    expect(vocative('Jana')).toBe('Jano');
    expect(vocative('Nováková')).toBe('Nováková');
  });
});

describe('cs inferGender', () => {
  it('classifies -ová surnames as female', () => {
    // The three-line heuristic this replaced tested `endsWith('a')`, false for
    // "Nováková" — it ends in "á". Every -ová surname, the most common
    // feminine form in Czech, came back 'male'.
    expect(inferGender('Nováková')).toBe('female');
    expect(inferGender('Procházková')).toBe('female');
    expect(inferGender('Krásná')).toBe('female');
  });

  it('classifies common given names', () => {
    expect(inferGender('Jana')).toBe('female');
    expect(inferGender('Petr')).toBe('male');
    expect(inferGender('Novotný')).toBe('male');
  });

  it('returns unknown for empty input', () => {
    expect(inferGender('')).toBe('unknown');
    expect(inferGender('   ')).toBe('unknown');
  });
});
