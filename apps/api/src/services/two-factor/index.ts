/**
 * TOTP (RFC 6238) two-factor authentication — no external deps.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { twoFactorSecrets } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function generateTotpCode(secret: string, at: number = Date.now()): string {
  const counter = Math.floor(at / 30_000);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary = ((hmac[offset]! & 0x7f) << 24)
               | ((hmac[offset + 1]! & 0xff) << 16)
               | ((hmac[offset + 2]! & 0xff) << 8)
               |  (hmac[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

/** Validates current or adjacent 30-second window. */
export function verifyTotpCode(secret: string, code: string, at: number = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const expected = [-1, 0, 1].map((w) => generateTotpCode(secret, at + w * 30_000));
  return expected.some((e) => timingSafeEqual(Buffer.from(e), Buffer.from(code)));
}

export function generateBackupCodes(n = 8): string[] {
  return Array.from({ length: n }, () => randomBytes(5).toString('hex').toUpperCase());
}

export function otpAuthUrl(secret: string, label: string, issuer = 'MailForge'): string {
  const p = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?${p.toString()}`;
}

export async function beginEnrollment(userId: string, label: string) {
  const secret = generateTotpSecret();
  const codes = generateBackupCodes();
  await db.insert(twoFactorSecrets).values({
    userId, secret, backupCodes: codes, enabled: false,
  }).onConflictDoUpdate({
    target: twoFactorSecrets.userId,
    set: { secret, backupCodes: codes, enabled: false },
  });
  return { secret, otpauthUrl: otpAuthUrl(secret, label), backupCodes: codes };
}

export async function confirmEnrollment(userId: string, code: string): Promise<void> {
  const [row] = await db.select().from(twoFactorSecrets).where(eq(twoFactorSecrets.userId, userId)).limit(1);
  if (!row) throw AppError.notFound('2FA secret');
  if (!verifyTotpCode(row.secret, code)) throw AppError.badRequest('Invalid code');
  await db.update(twoFactorSecrets).set({ enabled: true }).where(eq(twoFactorSecrets.userId, userId));
}

export async function verifyForLogin(userId: string, code: string): Promise<boolean> {
  const [row] = await db.select().from(twoFactorSecrets).where(eq(twoFactorSecrets.userId, userId)).limit(1);
  if (!row?.enabled) return false;

  if (verifyTotpCode(row.secret, code)) {
    await db.update(twoFactorSecrets).set({ lastUsedAt: new Date() }).where(eq(twoFactorSecrets.userId, userId));
    return true;
  }
  // Backup code consumption
  const idx = row.backupCodes.indexOf(code.toUpperCase());
  if (idx >= 0) {
    const remaining = [...row.backupCodes];
    remaining.splice(idx, 1);
    await db.update(twoFactorSecrets).set({ backupCodes: remaining, lastUsedAt: new Date() })
      .where(eq(twoFactorSecrets.userId, userId));
    return true;
  }
  return false;
}

export async function disable(userId: string): Promise<void> {
  await db.delete(twoFactorSecrets).where(eq(twoFactorSecrets.userId, userId));
}
