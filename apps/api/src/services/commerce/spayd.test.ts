import { describe, it, expect } from 'vitest';
import { buildSpaydString } from './spayd.js';

describe('buildSpaydString', () => {
  it('builds a minimal SPAYD string with IBAN + amount', () => {
    const spayd = buildSpaydString({
      iban: 'CZ6520100000002301234567',
      amount: 1234.5,
    });
    expect(spayd).toBe('SPD*1.0*ACC:CZ6520100000002301234567*AM:1234.50*CC:CZK');
  });

  it('includes optional symbols and message', () => {
    const spayd = buildSpaydString({
      iban: 'CZ6520100000002301234567',
      amount: 500,
      variableSymbol: '20260424',
      constantSymbol: '0308',
      message: 'Faktura 20260424',
    });
    expect(spayd).toContain('X-VS:20260424');
    expect(spayd).toContain('X-KS:0308');
    expect(spayd).toContain('MSG:Faktura 20260424');
  });

  it('normalizes IBAN whitespace and casing', () => {
    const spayd = buildSpaydString({
      iban: 'cz65 2010 0000 0023 0123 4567',
      amount: 1,
    });
    expect(spayd).toContain('ACC:CZ6520100000002301234567');
  });

  it('defaults currency to CZK', () => {
    const spayd = buildSpaydString({ iban: 'CZ6520100000002301234567', amount: 1 });
    expect(spayd).toContain('CC:CZK');
  });

  it('formats due date as YYYYMMDD', () => {
    const spayd = buildSpaydString({
      iban: 'CZ6520100000002301234567',
      amount: 1,
      dueDate: new Date('2026-05-08T00:00:00Z'),
    });
    expect(spayd).toContain('DT:20260508');
  });

  it('truncates and sanitises message forbidden chars', () => {
    const longMsg = 'A'.repeat(80) + '*:bad';
    const spayd = buildSpaydString({
      iban: 'CZ6520100000002301234567',
      amount: 1,
      message: longMsg,
    });
    // No `*` or `:` should appear inside the message payload
    const msgSegment = spayd.split('*').find((p) => p.startsWith('MSG:'))!;
    expect(msgSegment.slice(4).length).toBeLessThanOrEqual(60);
    expect(msgSegment.slice(4)).not.toMatch(/[*:]/);
  });

  it('rejects invalid IBAN', () => {
    expect(() => buildSpaydString({ iban: '1234', amount: 1 })).toThrow();
  });

  it('rejects negative amounts', () => {
    expect(() => buildSpaydString({ iban: 'CZ6520100000002301234567', amount: -1 })).toThrow();
  });

  it('rejects non-numeric variable symbol', () => {
    expect(() =>
      buildSpaydString({
        iban: 'CZ6520100000002301234567',
        amount: 1,
        variableSymbol: 'abc',
      }),
    ).toThrow();
  });

  it('rejects variable symbols longer than 10 digits', () => {
    expect(() =>
      buildSpaydString({
        iban: 'CZ6520100000002301234567',
        amount: 1,
        variableSymbol: '12345678901',
      }),
    ).toThrow();
  });
});
