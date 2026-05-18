import { describe, it, expect } from 'vitest';
import { vocative, inferGender } from './vocative.js';

describe('cs vocative', () => {
  it('applies exception table', () => {
    expect(vocative('Pavel', 'male')).toBe('Pavle');
    expect(vocative('Karel', 'male')).toBe('Karle');
    expect(vocative('Petr',  'male')).toBe('Petře');
  });

  it('handles common male rules', () => {
    expect(vocative('Tomáš', 'male')).toBe('Tomáši');
    expect(vocative('Marek', 'male')).toBe('Marku');
    expect(vocative('Honza', 'male')).toBe('Honzo');
    expect(vocative('Ondřej', 'male')).toBe('Ondřeji');
    expect(vocative('Jiří', 'male')).toBe('Jiří');
  });

  it('handles female names', () => {
    expect(vocative('Jana', 'female')).toBe('Jano');
    expect(vocative('Monika', 'female')).toBe('Moniko');
    expect(vocative('Marie', 'female')).toBe('Marie');
  });

  it('keeps surnames when given full name', () => {
    expect(vocative('Petr Novák', 'male')).toBe('Petře Novák');
  });

  it('handles empty input', () => {
    expect(vocative('')).toBe('');
    expect(vocative('   ')).toBe('   ');
  });

  it('infers gender when not provided', () => {
    expect(inferGender('Jana')).toBe('female');
    expect(inferGender('Marie')).toBe('female');
    expect(inferGender('Petr')).toBe('male');
  });
});
