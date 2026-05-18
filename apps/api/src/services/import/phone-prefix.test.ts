import { describe, it, expect } from 'vitest';
import { parsePhonePrefix } from './phone-prefix.js';

describe('parsePhonePrefix — CZ mobile', () => {
  it('parses O2 CZ mobile (+420601)', () => {
    const r = parsePhonePrefix('+420601123456');
    expect(r.country).toBe('CZ');
    expect(r.type).toBe('mobile');
    expect(r.operator).toBe('O2');
    expect(r.isValid).toBe(true);
    expect(r.normalized).toBe('+420601123456');
  });

  it('parses T-Mobile CZ mobile (+420721)', () => {
    const r = parsePhonePrefix('+420721000000');
    expect(r.operator).toBe('T-Mobile');
    expect(r.type).toBe('mobile');
  });

  it('parses Vodafone CZ mobile (+420777)', () => {
    const r = parsePhonePrefix('+420777654321');
    expect(r.operator).toBe('Vodafone');
    expect(r.type).toBe('mobile');
    expect(r.isValid).toBe(true);
  });

  it('parses Vodafone CZ mobile in 79x range', () => {
    const r = parsePhonePrefix('+420799123456');
    expect(r.operator).toBe('Vodafone');
  });

  it('normalizes 00420 prefix to +420', () => {
    const r = parsePhonePrefix('00420601123456');
    expect(r.normalized).toBe('+420601123456');
    expect(r.isValid).toBe(true);
  });

  it('returns isValid=false for CZ number with wrong digit count', () => {
    const r = parsePhonePrefix('+42060112345'); // 8 digits, not 9
    expect(r.isValid).toBe(false);
    expect(r.country).toBe('CZ');
  });
});

describe('parsePhonePrefix — CZ landline', () => {
  it('recognises Praha (2) region', () => {
    const r = parsePhonePrefix('+420212345678');
    expect(r.type).toBe('landline');
    expect(r.region).toBe('Praha');
    expect(r.district).toBe('Praha');
    expect(r.isValid).toBe(true);
  });

  it('recognises Plzeňský region (37)', () => {
    const r = parsePhonePrefix('+420371234567');
    expect(r.region).toBe('Plzeňský');
    expect(r.type).toBe('landline');
  });

  it('recognises Jihomoravský (5 prefix)', () => {
    const r = parsePhonePrefix('+420512345678');
    expect(r.region).toBe('Jihomoravský');
  });

  it('recognises Moravskoslezský (55 prefix)', () => {
    const r = parsePhonePrefix('+420551234567');
    expect(r.region).toBe('Moravskoslezský');
  });

  it('recognises Středočeský kraj (311 prefix)', () => {
    const r = parsePhonePrefix('+420311234567');
    expect(r.type).toBe('landline');
    expect(r.region).toBe('Středočeský');
  });

  it('recognises Středočeský kraj (317 prefix)', () => {
    const r = parsePhonePrefix('+420317654321');
    expect(r.region).toBe('Středočeský');
  });

  it('recognises Vysočina (56 prefix)', () => {
    const r = parsePhonePrefix('+420566123456');
    expect(r.type).toBe('landline');
    expect(r.region).toBe('Vysočina');
  });

  it('recognises O2 mobile in 702 range (does not match landline)', () => {
    const r = parsePhonePrefix('+420702123456');
    expect(r.type).toBe('mobile');
    expect(r.operator).toBe('O2');
    expect(r.region).toBeNull();
  });
});

describe('parsePhonePrefix — SK mobile', () => {
  it('parses Orange SK (+421900)', () => {
    const r = parsePhonePrefix('+421901234567');
    expect(r.country).toBe('SK');
    expect(r.type).toBe('mobile');
    expect(r.operator).toBe('Orange');
    expect(r.isValid).toBe(true);
  });

  it('parses T-Mobile SK (+421910)', () => {
    const r = parsePhonePrefix('+421910123456');
    expect(r.operator).toBe('T-Mobile');
  });

  it('parses O2 SK (+421906)', () => {
    const r = parsePhonePrefix('+421906123456');
    expect(r.operator).toBe('O2');
  });

  it('returns isValid=false for unknown SK prefix', () => {
    const r = parsePhonePrefix('+421999123456');
    expect(r.isValid).toBe(false);
    expect(r.country).toBe('SK');
  });
});

describe('parsePhonePrefix — edge cases', () => {
  it('returns isValid=false for empty string', () => {
    const r = parsePhonePrefix('');
    expect(r.isValid).toBe(false);
  });

  it('returns country=null for unknown international number', () => {
    const r = parsePhonePrefix('+44 7700 900123');
    expect(r.country).toBeNull();
    expect(r.isValid).toBe(false);
  });

  it('strips spaces and dashes during normalisation', () => {
    const r = parsePhonePrefix('+420 601 123 456');
    expect(r.normalized).toBe('+420601123456');
    expect(r.isValid).toBe(true);
  });

  it('handles null-ish input gracefully', () => {
    // @ts-expect-error testing runtime robustness
    const r = parsePhonePrefix(null);
    expect(r.isValid).toBe(false);
  });
});
