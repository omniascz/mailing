import { describe, it, expect } from 'vitest';
import { parseCsvString, detectFormat } from './parser.js';
import { detectColumnMapping } from './column-detect.js';
import { validateRow } from './validator.js';
import { parsePhonePrefix } from './phone-prefix.js';

describe('parseCsvString', () => {
  it('parses headers and rows with trimmed values', () => {
    const csv = 'Email, Phone, First Name\n  alice@example.com ,+420602123456,Alice\nbob@test.cz,+420777000111,Bob';
    const { columns, rows } = parseCsvString(csv);
    expect(columns).toEqual(['Email', 'Phone', 'First Name']);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.Email).toBe('alice@example.com');
    expect(rows[0]!['First Name']).toBe('Alice');
  });

  it('skips empty lines', () => {
    const csv = 'email\nalice@example.com\n\n\nbob@example.com\n';
    const { rows } = parseCsvString(csv);
    expect(rows).toHaveLength(2);
  });
});

describe('detectFormat', () => {
  it('recognizes csv and xlsx extensions', () => {
    expect(detectFormat('users.csv')).toBe('csv');
    expect(detectFormat('UserList.XLSX')).toBe('xlsx');
    expect(detectFormat('data.tsv')).toBe('csv');
    expect(detectFormat('image.png')).toBeNull();
  });
});

describe('detectColumnMapping', () => {
  it('maps common english header variations', () => {
    const mapping = detectColumnMapping(['Email Address', 'Phone Number', 'First Name', 'Surname', 'Notes']);
    expect(mapping['Email Address']).toBe('email');
    expect(mapping['Phone Number']).toBe('phone');
    expect(mapping['First Name']).toBe('first_name');
    expect(mapping.Surname).toBe('last_name');
    expect(mapping.Notes).toBe('ignore');
  });

  it('maps czech diacritics', () => {
    const mapping = detectColumnMapping(['Jméno', 'Příjmení', 'Telefon']);
    expect(mapping['Jméno']).toBe('first_name');
    expect(mapping['Příjmení']).toBe('last_name');
    expect(mapping.Telefon).toBe('phone');
  });

  it('does not double-claim a field', () => {
    const mapping = detectColumnMapping(['email', 'e-mail']);
    const values = Object.values(mapping);
    const emailCount = values.filter((v) => v === 'email').length;
    expect(emailCount).toBe(1);
  });
});

describe('validateRow', () => {
  const mapping = {
    Email: 'email' as const,
    Phone: 'phone' as const,
    First: 'first_name' as const,
  };

  it('accepts a valid row and enriches phone data', () => {
    const result = validateRow({ Email: 'alice@example.com', Phone: '+420602123456', First: 'Alice' }, mapping);
    expect(result.ok).toBe(true);
    expect(result.row?.email).toBe('alice@example.com');
    expect(result.row?.phoneInfo?.operator).toBe('O2');
    expect(result.row?.phoneInfo?.type).toBe('mobile');
  });

  it('rejects a row missing both email and phone', () => {
    const result = validateRow({ Email: '', Phone: '', First: 'Ghost' }, mapping);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('email or phone'))).toBe(true);
  });

  it('rejects an invalid email but keeps phone', () => {
    const result = validateRow({ Email: 'not-an-email', Phone: '+420602123456', First: 'X' }, mapping);
    expect(result.ok).toBe(false);
    expect(result.row?.email).toBeNull();
    expect(result.row?.phone).toBeTruthy();
  });

  it('lowercases email', () => {
    const result = validateRow({ Email: 'ALICE@Example.COM', Phone: '', First: '' }, mapping);
    expect(result.row?.email).toBe('alice@example.com');
  });
});

describe('parsePhonePrefix', () => {
  it('parses CZ O2 mobile', () => {
    const r = parsePhonePrefix('+420 602 123 456');
    expect(r.isValid).toBe(true);
    expect(r.country).toBe('CZ');
    expect(r.type).toBe('mobile');
    expect(r.operator).toBe('O2');
    expect(r.normalized).toBe('+420602123456');
  });

  it('parses CZ T-Mobile mobile', () => {
    const r = parsePhonePrefix('+420737000111');
    expect(r.operator).toBe('T-Mobile');
  });

  it('parses CZ Vodafone mobile', () => {
    const r = parsePhonePrefix('+420773000111');
    expect(r.operator).toBe('Vodafone');
  });

  it('parses CZ Praha landline', () => {
    const r = parsePhonePrefix('+420234567890');
    expect(r.type).toBe('landline');
    expect(r.region).toBe('Praha');
  });

  it('normalizes 00 prefix to +', () => {
    const r = parsePhonePrefix('00420602123456');
    expect(r.normalized).toBe('+420602123456');
    expect(r.isValid).toBe(true);
  });

  it('parses SK Orange mobile', () => {
    const r = parsePhonePrefix('+421901234567');
    expect(r.country).toBe('SK');
    expect(r.operator).toBe('Orange');
  });

  it('handles unknown foreign number', () => {
    const r = parsePhonePrefix('+14155551234');
    expect(r.isValid).toBe(false);
    expect(r.country).toBeNull();
  });

  it('handles empty input', () => {
    const r = parsePhonePrefix('');
    expect(r.isValid).toBe(false);
  });
});
