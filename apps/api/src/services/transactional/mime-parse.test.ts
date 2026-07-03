import { describe, it, expect } from 'vitest';
import {
  parseRawMime,
  parseAddress,
  parseAddressList,
  decodeRfc2047,
} from './mime-parse.js';

describe('parseAddress', () => {
  it('parses Name <email> and bare email', () => {
    expect(parseAddress('Ada Lovelace <ada@example.com>')).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(parseAddress('bob@example.com')).toEqual({ name: null, email: 'bob@example.com' });
    expect(parseAddress('"Doe, John" <john@x.com>').email).toBe('john@x.com');
  });
});

describe('parseAddressList', () => {
  it('splits a comma list honouring angle brackets/quotes', () => {
    expect(parseAddressList('a@x.com, "B, C" <b@x.com>, c@x.com')).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
    ]);
  });
});

describe('decodeRfc2047', () => {
  it('decodes B and Q encoded words', () => {
    expect(decodeRfc2047('=?UTF-8?B?SGVsbG8=?=')).toBe('Hello');
    expect(decodeRfc2047('=?UTF-8?Q?Hi_there=21?=')).toBe('Hi there!');
  });
});

describe('parseRawMime', () => {
  it('parses a simple text message', () => {
    const raw = [
      'From: Ada <ada@example.com>',
      'To: bob@example.com',
      'Subject: Hello',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Hello world',
    ].join('\r\n');
    const p = parseRawMime(raw);
    expect(p.from).toBe('ada@example.com');
    expect(p.fromName).toBe('Ada');
    expect(p.to).toEqual(['bob@example.com']);
    expect(p.subject).toBe('Hello');
    expect(p.text).toBe('Hello world');
    expect(p.html).toBeNull();
  });

  it('parses multipart/alternative with text + html', () => {
    const raw = [
      'From: a@x.com',
      'To: b@x.com, c@x.com',
      'Subject: Multi',
      'Content-Type: multipart/alternative; boundary="BND"',
      '',
      '--BND',
      'Content-Type: text/plain',
      '',
      'plain body',
      '--BND',
      'Content-Type: text/html',
      '',
      '<p>html body</p>',
      '--BND--',
    ].join('\r\n');
    const p = parseRawMime(raw);
    expect(p.to).toEqual(['b@x.com', 'c@x.com']);
    expect(p.text).toBe('plain body');
    expect(p.html).toBe('<p>html body</p>');
  });

  it('decodes quoted-printable + base64 parts and RFC2047 subject', () => {
    const raw = [
      'From: a@x.com',
      'To: b@x.com',
      'Subject: =?UTF-8?B?UMWZw61qZW1uw6k=?=',
      'Content-Type: multipart/alternative; boundary="B"',
      '',
      '--B',
      'Content-Type: text/plain',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'Caf=C3=A9',
      '--B',
      'Content-Type: text/html',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('<b>hi</b>').toString('base64'),
      '--B--',
    ].join('\r\n');
    const p = parseRawMime(raw);
    expect(p.subject).toBe('Příjemné');
    expect(p.text).toBe('Café');
    expect(p.html).toBe('<b>hi</b>');
  });

  it('passes through unmapped headers, drops structural ones', () => {
    const raw = [
      'From: a@x.com',
      'To: b@x.com',
      'Subject: H',
      'X-Custom: keepme',
      'Reply-To: reply@x.com',
      'Content-Type: text/plain',
      '',
      'body',
    ].join('\r\n');
    const p = parseRawMime(raw);
    expect(p.headers['X-Custom']).toBe('keepme');
    expect(p.headers['Content-Type']).toBeUndefined();
    expect(p.headers['From']).toBeUndefined();
    expect(p.replyTo).toBe('reply@x.com');
  });
});
