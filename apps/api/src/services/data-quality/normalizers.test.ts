import { describe, it, expect } from 'vitest';
import {
  normaliseEmail,
  normalisePhone,
  normaliseName,
  normaliseCountry,
  normaliseContact,
} from './normalizers.js';

describe('normaliseEmail', () => {
  it('lower-cases and trims', () => {
    expect(normaliseEmail('  Jane@EXAMPLE.com ')).toEqual({ value: 'jane@example.com', changed: true });
  });

  it('reports changed=false when already canonical', () => {
    expect(normaliseEmail('jane@example.com')).toEqual({ value: 'jane@example.com', changed: false });
  });

  it('returns null for missing @', () => {
    expect(normaliseEmail('no-at-sign')).toEqual({ value: null, changed: true });
  });

  it('passes through null/undefined unchanged', () => {
    expect(normaliseEmail(null)).toEqual({ value: null, changed: false });
    expect(normaliseEmail(undefined)).toEqual({ value: null, changed: false });
  });

  it('returns null for empty string', () => {
    expect(normaliseEmail('')).toEqual({ value: null, changed: false });
  });

  it('returns null for whitespace-only', () => {
    expect(normaliseEmail('   ')).toEqual({ value: null, changed: true });
  });
});

describe('normalisePhone', () => {
  it('keeps a clean E.164 number', () => {
    expect(normalisePhone('+420123456789', '420')).toEqual({ value: '+420123456789', changed: false });
  });

  it('strips formatting on E.164 input', () => {
    expect(normalisePhone('+420 (123) 456-789', '420')).toEqual({ value: '+420123456789', changed: true });
  });

  it('drops 00 international prefix', () => {
    expect(normalisePhone('00420123456789', '420')).toEqual({ value: '+420123456789', changed: true });
  });

  it('prepends default country dial code on naked national numbers', () => {
    expect(normalisePhone('123456789', '420')).toEqual({ value: '+420123456789', changed: true });
  });

  it('rejects non-numeric content', () => {
    expect(normalisePhone('abc', '420')).toEqual({ value: null, changed: true });
  });

  it('rejects too short / too long', () => {
    expect(normalisePhone('+1234567', '420')).toEqual({ value: null, changed: true }); // 7 digits
    expect(normalisePhone('+1234567890123456', '420')).toEqual({ value: null, changed: true }); // 16 digits
  });

  it('strips a + from the dial code arg', () => {
    expect(normalisePhone('123456789', '+420')).toEqual({ value: '+420123456789', changed: true });
  });

  it('passes through null/undefined unchanged', () => {
    expect(normalisePhone(null, '420')).toEqual({ value: null, changed: false });
    expect(normalisePhone(undefined, '420')).toEqual({ value: null, changed: false });
  });
});

describe('normaliseName', () => {
  it('title-cases lowercase input', () => {
    expect(normaliseName('jane doe')).toEqual({ value: 'Jane Doe', changed: true });
  });

  it('handles already-titlecased input as no-op', () => {
    expect(normaliseName('Jane Doe')).toEqual({ value: 'Jane Doe', changed: false });
  });

  it('handles hyphenated names', () => {
    expect(normaliseName('anne-marie')).toEqual({ value: 'Anne-Marie', changed: true });
  });

  it("handles apostrophe surnames (O'Brien)", () => {
    expect(normaliseName("o'brien")).toEqual({ value: "O'Brien", changed: true });
  });

  it('handles Mc surnames', () => {
    expect(normaliseName('mcdonald')).toEqual({ value: 'McDonald', changed: true });
  });

  it('handles Mac surnames', () => {
    expect(normaliseName('macgregor')).toEqual({ value: 'MacGregor', changed: true });
  });

  it('lowercases SHOUTING input', () => {
    expect(normaliseName('JANE DOE')).toEqual({ value: 'Jane Doe', changed: true });
  });

  it('preserves Czech diacritics', () => {
    expect(normaliseName('JIŘÍ NOVÁK')).toEqual({ value: 'Jiří Novák', changed: true });
  });

  it('passes through null/undefined unchanged', () => {
    expect(normaliseName(null)).toEqual({ value: null, changed: false });
  });

  it('returns null for whitespace-only', () => {
    expect(normaliseName('   ')).toEqual({ value: null, changed: true });
  });
});

describe('normaliseCountry', () => {
  it('upper-cases a 2-letter code', () => {
    expect(normaliseCountry('cz')).toEqual({ value: 'CZ', changed: true });
    expect(normaliseCountry('CZ')).toEqual({ value: 'CZ', changed: false });
  });

  it('maps a 3-letter code to alpha-2', () => {
    expect(normaliseCountry('CZE')).toEqual({ value: 'CZ', changed: true });
    expect(normaliseCountry('SVK')).toEqual({ value: 'SK', changed: true });
    expect(normaliseCountry('USA')).toEqual({ value: 'US', changed: true });
  });

  it('maps English country names', () => {
    expect(normaliseCountry('Czech Republic')).toEqual({ value: 'CZ', changed: true });
    expect(normaliseCountry('Czechia')).toEqual({ value: 'CZ', changed: true });
    expect(normaliseCountry('United States of America')).toEqual({ value: 'US', changed: true });
  });

  it('maps Czech country names', () => {
    expect(normaliseCountry('Česká republika')).toEqual({ value: 'CZ', changed: true });
    expect(normaliseCountry('Slovensko')).toEqual({ value: 'SK', changed: true });
  });

  it('returns null for unknown', () => {
    expect(normaliseCountry('Atlantis')).toEqual({ value: null, changed: true });
    expect(normaliseCountry('XYZ')).toEqual({ value: null, changed: true });
  });

  it('returns null for empty / whitespace', () => {
    expect(normaliseCountry('')).toEqual({ value: null, changed: false });
    expect(normaliseCountry('  ')).toEqual({ value: null, changed: true });
  });
});

describe('normaliseContact aggregator', () => {
  it('normalises every present field and reports changes', () => {
    const r = normaliseContact({
      email: '  Jane@Example.COM ',
      phone: '+420 123 456 789',
      firstName: 'jane',
      lastName: "o'brien",
      country: 'czech republic',
    });
    expect(r.patch).toEqual({
      email: 'jane@example.com',
      phone: '+420123456789',
      firstName: 'Jane',
      lastName: "O'Brien",
      country: 'CZ',
    });
    expect(r.changed.sort()).toEqual(['country', 'email', 'firstName', 'lastName', 'phone']);
  });

  it('skips fields that are not present in the patch (vs. undefined)', () => {
    const r = normaliseContact({ email: 'a@b.com' });
    expect(r.patch).toEqual({ email: 'a@b.com' });
    expect(r.changed).toEqual([]);
    expect('phone' in r.patch).toBe(false);
  });

  it('treats explicit null as a write to clear the field', () => {
    const r = normaliseContact({ email: null });
    expect('email' in r.patch).toBe(true);
    expect(r.patch.email).toBeNull();
  });
});
