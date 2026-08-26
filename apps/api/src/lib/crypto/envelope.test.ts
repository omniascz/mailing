/**
 * The envelope helper, on its own.
 *
 * These are the properties the DKIM wiring leans on, asserted where they are
 * cheap to assert: that a round trip is lossless, that every wrong-key path
 * throws instead of returning something, that the AAD actually binds, and that
 * no error message carries the material it failed on.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  DATA_PREFIX,
  WRAP_PREFIX,
  EnvelopeDecryptionError,
  EnvelopeKeyError,
  decryptWithDek,
  encryptWithDek,
  generateDek,
  getMasterKey,
  keysEqual,
  unwrapDek,
  wrapDek,
} from './envelope.js';

const AAD = 'domain-1:selector-1';
const OTHER_AAD = 'domain-2:selector-1';
const SECRET = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----\n';
const ENV_VAR = 'ENVELOPE_TEST_KEY';

const before = process.env[ENV_VAR];
afterEach(() => {
  if (before === undefined) delete process.env[ENV_VAR];
  else process.env[ENV_VAR] = before;
});

describe('data layer', () => {
  it('round-trips a secret unchanged', () => {
    const dek = generateDek();
    const blob = encryptWithDek(SECRET, dek, AAD);
    expect(blob.startsWith(DATA_PREFIX)).toBe(true);
    expect(decryptWithDek(blob, dek, AAD)).toBe(SECRET);
  });

  it('does not leave the plaintext recoverable from the blob', () => {
    const blob = encryptWithDek(SECRET, generateDek(), AAD);
    expect(blob).not.toContain('BEGIN PRIVATE KEY');
    // The base64 body decoded as text must not contain the PEM either — a
    // check that would catch an accidental pass-through implementation.
    const decoded = Buffer.from(blob.slice(DATA_PREFIX.length), 'base64').toString('latin1');
    expect(decoded).not.toContain('BEGIN PRIVATE KEY');
  });

  it('produces a different ciphertext each time (fresh IV)', () => {
    const dek = generateDek();
    expect(encryptWithDek(SECRET, dek, AAD)).not.toBe(encryptWithDek(SECRET, dek, AAD));
  });

  it('throws on the wrong DEK rather than returning anything', () => {
    const blob = encryptWithDek(SECRET, generateDek(), AAD);
    expect(() => decryptWithDek(blob, generateDek(), AAD)).toThrow(EnvelopeDecryptionError);
  });

  it('throws when the AAD does not match — a ciphertext is bound to its row', () => {
    const dek = generateDek();
    const blob = encryptWithDek(SECRET, dek, AAD);
    expect(() => decryptWithDek(blob, dek, OTHER_AAD)).toThrow(EnvelopeDecryptionError);
  });

  it('throws on a tampered tag', () => {
    const dek = generateDek();
    const blob = encryptWithDek(SECRET, dek, AAD);
    const raw = Buffer.from(blob.slice(DATA_PREFIX.length), 'base64');
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0xff;
    const tampered = DATA_PREFIX + raw.toString('base64');
    expect(() => decryptWithDek(tampered, dek, AAD)).toThrow(EnvelopeDecryptionError);
  });

  it('refuses a value that was never encrypted instead of passing it through', () => {
    // The whole point of the exercise: hipaa.ts:80 returns the input when it
    // cannot decrypt, which hands the caller a plaintext secret and calls it
    // success. This must do the opposite.
    expect(() => decryptWithDek(SECRET, generateDek(), AAD)).toThrow(EnvelopeDecryptionError);
  });

  it('refuses a truncated blob', () => {
    expect(() => decryptWithDek(`${DATA_PREFIX}AAAA`, generateDek(), AAD)).toThrow(
      EnvelopeDecryptionError,
    );
  });

  it('refuses a DEK of the wrong length', () => {
    expect(() => encryptWithDek(SECRET, randomBytes(16), AAD)).toThrow(EnvelopeKeyError);
  });
});

describe('wrap layer', () => {
  it('round-trips a DEK', () => {
    const master = randomBytes(32);
    const dek = generateDek();
    const wrapped = wrapDek(dek, master, AAD);
    expect(wrapped.startsWith(WRAP_PREFIX)).toBe(true);
    expect(keysEqual(unwrapDek(wrapped, master, AAD), dek)).toBe(true);
  });

  it('throws on the wrong master key', () => {
    const wrapped = wrapDek(generateDek(), randomBytes(32), AAD);
    expect(() => unwrapDek(wrapped, randomBytes(32), AAD)).toThrow(EnvelopeDecryptionError);
  });

  it('throws when the wrapped DEK is moved to another row', () => {
    const master = randomBytes(32);
    const wrapped = wrapDek(generateDek(), master, AAD);
    expect(() => unwrapDek(wrapped, master, OTHER_AAD)).toThrow(EnvelopeDecryptionError);
  });

  it('will not unwrap a data blob as a DEK — the prefixes are not interchangeable', () => {
    const master = randomBytes(32);
    const data = encryptWithDek(SECRET, master, AAD);
    expect(() => unwrapDek(data, master, AAD)).toThrow(EnvelopeDecryptionError);
  });
});

describe('getMasterKey', () => {
  beforeEach(() => {
    process.env[ENV_VAR] = 'a'.repeat(64);
  });

  it('returns 32 bytes for version 1', () => {
    expect(getMasterKey(ENV_VAR, 1)).toHaveLength(32);
  });

  it(
    'throws for any other version — rotation is not implemented, and silently ' +
      'falling back to v1 would look like corruption',
    () => {
      expect(() => getMasterKey(ENV_VAR, 2)).toThrow(EnvelopeKeyError);
    },
  );

  it('throws when the variable is absent — never returns null for a caller to ignore', () => {
    delete process.env[ENV_VAR];
    expect(() => getMasterKey(ENV_VAR, 1)).toThrow(EnvelopeKeyError);
  });

  it('throws when the variable is not 64 hex characters', () => {
    process.env[ENV_VAR] = 'not-hex';
    expect(() => getMasterKey(ENV_VAR, 1)).toThrow(EnvelopeKeyError);
    process.env[ENV_VAR] = 'a'.repeat(63);
    expect(() => getMasterKey(ENV_VAR, 1)).toThrow(EnvelopeKeyError);
  });
});

describe('error messages carry no material', () => {
  // Errors end up in logs and in bug reports. A message that helpfully echoes
  // the ciphertext or the key it failed on turns every log aggregator into a
  // second copy of the secret store.
  const master = randomBytes(32);
  const dek = generateDek();

  function messageOf(fn: () => unknown): string {
    try {
      fn();
    } catch (err) {
      const e = err as Error;
      return `${e.message} ${String((e as { cause?: unknown }).cause ?? '')}`;
    }
    throw new Error('expected a throw');
  }

  it('leaks neither ciphertext nor key on a failed data decrypt', () => {
    const blob = encryptWithDek(SECRET, dek, AAD);
    const msg = messageOf(() => decryptWithDek(blob, generateDek(), AAD));
    expect(msg).not.toContain(blob);
    expect(msg).not.toContain(blob.slice(DATA_PREFIX.length, DATA_PREFIX.length + 16));
    expect(msg).not.toContain(dek.toString('hex'));
    expect(msg).not.toContain(dek.toString('base64'));
  });

  it('leaks neither the wrapped DEK nor the master key on a failed unwrap', () => {
    const wrapped = wrapDek(dek, master, AAD);
    const msg = messageOf(() => unwrapDek(wrapped, randomBytes(32), AAD));
    expect(msg).not.toContain(wrapped);
    expect(msg).not.toContain(master.toString('hex'));
  });

  it('leaks the key value from getMasterKey neither by name nor by content', () => {
    process.env[ENV_VAR] = 'zz'.repeat(32); // right length, not hex
    const msg = messageOf(() => getMasterKey(ENV_VAR, 1));
    expect(msg).toContain(ENV_VAR); // the NAME is the useful part
    expect(msg).not.toContain('zz'.repeat(32));
  });
});
