/**
 * Envelope encryption for secrets held at rest in Postgres.
 *
 * Deliberately domain-neutral. DKIM private keys are the first column to use
 * it, but they are not the last: an audit of the schemas counted around thirty
 * more columns holding a secret in plaintext — OAuth refresh tokens, TOTP
 * seeds, webhook HMAC secrets, ERP passwords, VAPID keys. Nothing in this
 * module knows what it is wrapping.
 *
 * ─── The shape ────────────────────────────────────────────────────────────────
 *
 *   master key (environment)  --wraps-->  DEK (per row)  --encrypts-->  secret
 *
 * The master key never touches the database — that is the whole point of the
 * exercise. A dump, a backup or a read replica yields ciphertext and a wrapped
 * DEK, and neither is worth anything without the environment of a running
 * process.
 *
 * Both layers are AES-256-GCM with a fresh 12-byte IV stored inline:
 *
 *   dk1:base64( iv[12] | ciphertext | authTag[16] )   -- data under the DEK
 *   dw1:base64( iv[12] | ciphertext | authTag[16] )   -- DEK under the master key
 *
 * The prefixes are version tags, not decoration. They are what lets a reader
 * tell an encrypted value from a legacy plaintext one without guessing, and
 * what a future format change would bump.
 *
 * ─── Associated data ──────────────────────────────────────────────────────────
 *
 * Every call takes an `aad` — a stable string identifying the row the
 * ciphertext belongs to. It is authenticated but not encrypted, and it binds
 * the ciphertext to its row: an attacker who can write to the database cannot
 * copy another tenant's dk1/dw1 pair onto a row they control and have the
 * application decrypt it for them. Without it, envelope encryption protects the
 * bytes but not which record they belong to.
 *
 * ─── Failure ──────────────────────────────────────────────────────────────────
 *
 * There is no fallback in this file, in either direction. The precedent it
 * departs from is services/compliance/hipaa.ts:80 — `if (!key) return value`,
 * which turns a misconfigured deployment into silent plaintext on read. Here a
 * missing key on write throws, and a missing or wrong key on read throws.
 * Refusing to work is a bug report; quietly handling a secret in the clear is
 * an incident nobody notices.
 *
 * Error messages never interpolate key material, DEK, AAD or ciphertext — they
 * end up in logs, and a log line is not a place to leak what the encryption was
 * for.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

/** Data encrypted under a DEK. */
export const DATA_PREFIX = 'dk1:';
/** A DEK wrapped by a master key. */
export const WRAP_PREFIX = 'dw1:';

const IV_BYTES = 12;
const TAG_BYTES = 16;
/** AES-256 — both the master key and every DEK. */
export const KEY_BYTES = 32;

/**
 * Decryption failed: no key, the wrong key, a corrupted blob, a value that was
 * never encrypted, or a ciphertext lifted from another row.
 *
 * A distinct class rather than a bare Error because callers must be able to
 * tell it apart from "there is no secret here". Those two answers look the same
 * to a `catch {}` and mean opposite things.
 */
export class EnvelopeDecryptionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EnvelopeDecryptionError';
  }
}

/** The environment cannot supply a usable master key. Thrown on read AND write. */
export class EnvelopeKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvelopeKeyError';
  }
}

function assertKey(key: Buffer, what: string): void {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new EnvelopeKeyError(`${what} must be ${KEY_BYTES} bytes.`);
  }
}

/** A fresh DEK. One per row — never shared, never derived. */
export function generateDek(): Buffer {
  return randomBytes(KEY_BYTES);
}

function seal(plaintext: Buffer, key: Buffer, aad: string, prefix: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return prefix + Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString('base64');
}

function open(blob: string, key: Buffer, aad: string, prefix: string): Buffer {
  if (typeof blob !== 'string' || !blob.startsWith(prefix)) {
    // The most likely cause is a row written before encryption landed. Saying
    // so is the difference between "run the backfill" and an afternoon in a
    // debugger; returning the value unchanged, which is what the HIPAA helper
    // does, would hand the caller a plaintext secret and call it success.
    throw new EnvelopeDecryptionError(
      `Value is not ${prefix}-encrypted. A row written before encryption was ` +
        `enabled reads like this — run the backfill rather than reading it as plaintext.`,
    );
  }
  const combined = Buffer.from(blob.slice(prefix.length), 'base64');
  if (combined.length < IV_BYTES + TAG_BYTES) {
    throw new EnvelopeDecryptionError('Encrypted value is truncated or corrupt.');
  }
  const iv = combined.subarray(0, IV_BYTES);
  const authTag = combined.subarray(combined.length - TAG_BYTES);
  const ciphertext = combined.subarray(IV_BYTES, combined.length - TAG_BYTES);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    // GCM cannot distinguish "wrong key" from "wrong AAD" from "tampered
    // bytes", and neither can we. Node's own message ("unable to authenticate
    // data") carries no key material, but it is rewritten anyway so nothing
    // downstream depends on the wording of a crypto library's error.
    throw new EnvelopeDecryptionError(
      'Authenticated decryption failed: wrong key, wrong record, or altered ciphertext.',
      { cause: err instanceof Error ? err.message : undefined },
    );
  }
}

/** Encrypt a secret under its row's DEK. Returns `dk1:...`. */
export function encryptWithDek(plaintext: string, dek: Buffer, aad: string): string {
  assertKey(dek, 'DEK');
  return seal(Buffer.from(plaintext, 'utf8'), dek, aad, DATA_PREFIX);
}

/** Decrypt a `dk1:...` value. Throws — never returns the input unchanged. */
export function decryptWithDek(blob: string, dek: Buffer, aad: string): string {
  assertKey(dek, 'DEK');
  return open(blob, dek, aad, DATA_PREFIX).toString('utf8');
}

/** Wrap a DEK with the master key. Returns `dw1:...`. */
export function wrapDek(dek: Buffer, masterKey: Buffer, aad: string): string {
  assertKey(dek, 'DEK');
  assertKey(masterKey, 'master key');
  return seal(dek, masterKey, aad, WRAP_PREFIX);
}

/** Unwrap a `dw1:...` DEK with the master key. Throws on the wrong master key. */
export function unwrapDek(blob: string, masterKey: Buffer, aad: string): Buffer {
  assertKey(masterKey, 'master key');
  const dek = open(blob, masterKey, aad, WRAP_PREFIX);
  if (dek.length !== KEY_BYTES) {
    throw new EnvelopeDecryptionError('Unwrapped DEK has the wrong length.');
  }
  return dek;
}

/**
 * The master key for a given version, read from the environment at use time.
 *
 * Read here rather than through config/env.ts on purpose. env.ts validates the
 * variable at boot so a bad deployment dies immediately with a readable
 * message; this reads `process.env` per call so tests can exercise the
 * wrong-key path without rebuilding the config module. hipaa.ts:39 does the
 * same, for the same reason.
 *
 * `version` is the row's `master_key_version`. Rotation is NOT implemented:
 * only version 1 resolves, and anything else is a loud error rather than a
 * silent fall back to v1 — which would decrypt nothing and look like
 * corruption. When rotation lands this function grows a lookup and nothing else
 * in the codebase has to change; that is why the version travels with the row
 * from the start.
 *
 * @param envVarName which variable holds the key. A parameter rather than a
 *   hard-coded name, because this module is meant to serve the next column too.
 */
export function getMasterKey(envVarName: string, version: number): Buffer {
  if (version !== 1) {
    throw new EnvelopeKeyError(
      `Unsupported master key version ${version} for ${envVarName}. ` +
        `Only version 1 exists; master key rotation is not implemented.`,
    );
  }
  const hex = process.env[envVarName];
  if (!hex) {
    throw new EnvelopeKeyError(
      `${envVarName} is not set — refusing to read or write an encrypted secret ` +
        `without it. Set it to 64 hex characters (32 bytes).`,
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new EnvelopeKeyError(`${envVarName} must be exactly 64 hex characters (32 bytes).`);
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Whether two keys are the same, without a timing side channel.
 *
 * Used by the boot-time guard that refuses to start production on the
 * development default. Constant-time is arguably overkill for a comparison
 * against a value committed to this repository, but one operand is a real key
 * and that is not a habit worth making exceptions to.
 */
export function keysEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
