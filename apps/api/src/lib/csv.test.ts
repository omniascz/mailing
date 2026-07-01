import { describe, it, expect } from 'vitest';
import { escapeCsvField, toCsv } from './csv.js';

describe('escapeCsvField', () => {
  it('passes through simple values', () => {
    expect(escapeCsvField('hello')).toBe('hello');
    expect(escapeCsvField(42)).toBe('42');
  });

  it('quotes fields with commas, quotes, or newlines', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('he said "hi"')).toBe('"he said ""hi"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('renders null/undefined as empty', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('serialises dates and objects', () => {
    expect(escapeCsvField(new Date('2026-07-01T00:00:00.000Z'))).toBe('2026-07-01T00:00:00.000Z');
    expect(escapeCsvField({ a: 1 })).toBe('"{""a"":1}"');
  });
});

describe('toCsv', () => {
  it('serialises rows with explicit columns', () => {
    const csv = toCsv(
      [
        { email: 'a@x.com', opens: 3 },
        { email: 'b@x.com', opens: 0 },
      ],
      [
        { header: 'Email', value: 'email' },
        { header: 'Opens', value: 'opens' },
      ],
    );
    expect(csv).toBe('Email,Opens\r\na@x.com,3\r\nb@x.com,0');
  });

  it('supports accessor functions', () => {
    const csv = toCsv([{ a: 1, b: 2 }], [{ header: 'Sum', value: (r) => r.a + r.b }]);
    expect(csv).toBe('Sum\r\n3');
  });

  it('infers columns from keys when omitted', () => {
    const csv = toCsv([{ x: 1, y: 2 }]);
    expect(csv.split('\r\n')[0]).toBe('x,y');
  });

  it('escapes values in body rows', () => {
    const csv = toCsv([{ name: 'Doe, John' }], [{ header: 'Name', value: 'name' }]);
    expect(csv).toBe('Name\r\n"Doe, John"');
  });
});
