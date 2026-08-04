/**
 * SMTP submission credentials — issue, list, revoke, and validate the
 * username/password pairs customers use to relay mail through the port-587
 * submission server. Passwords are shown once at creation and stored bcrypt-hashed.
 */

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { smtpCredentials, type SmtpCredential } from '../../db/schema/smtp-credentials.js';
import { AppError } from '../../lib/app-error.js';

export interface NewSmtpCredential {
  id: string;
  username: string;
  /** Plaintext password — returned ONCE at creation, never retrievable again. */
  password: string;
  label: string | null;
}

/** Issue a new SMTP credential for an org. */
export async function createSmtpCredential(
  orgId: string,
  label?: string,
): Promise<NewSmtpCredential> {
  const username = `fms_${crypto.randomBytes(9).toString('hex')}`; // 22 chars
  const password = crypto.randomBytes(24).toString('base64url'); // 32 chars
  const passwordHash = await bcrypt.hash(password, 10);
  const [row] = await db
    .insert(smtpCredentials)
    .values({ orgId, username, passwordHash, label: label ?? null })
    .returning({ id: smtpCredentials.id, label: smtpCredentials.label });
  return { id: row!.id, username, password, label: row!.label };
}

/** List an org's SMTP credentials (never returns the hash/password). */
export async function listSmtpCredentials(
  orgId: string,
): Promise<
  Array<Pick<SmtpCredential, 'id' | 'username' | 'label' | 'active' | 'lastUsedAt' | 'createdAt'>>
> {
  return db
    .select({
      id: smtpCredentials.id,
      username: smtpCredentials.username,
      label: smtpCredentials.label,
      active: smtpCredentials.active,
      lastUsedAt: smtpCredentials.lastUsedAt,
      createdAt: smtpCredentials.createdAt,
    })
    .from(smtpCredentials)
    .where(eq(smtpCredentials.orgId, orgId))
    .orderBy(desc(smtpCredentials.createdAt));
}

/** Revoke (delete) an SMTP credential. */
export async function deleteSmtpCredential(orgId: string, id: string): Promise<void> {
  const [row] = await db
    .delete(smtpCredentials)
    .where(and(eq(smtpCredentials.id, id), eq(smtpCredentials.orgId, orgId)))
    .returning({ id: smtpCredentials.id });
  if (!row) throw AppError.notFound('SmtpCredential');
}

/**
 * Validate an SMTP AUTH attempt. Returns the orgId on success, null otherwise.
 * Called by the Go submission server via the internal auth endpoint.
 */
export async function validateSmtpCredential(
  username: string,
  password: string,
): Promise<string | null> {
  const [row] = await db
    .select({
      id: smtpCredentials.id,
      orgId: smtpCredentials.orgId,
      passwordHash: smtpCredentials.passwordHash,
      active: smtpCredentials.active,
    })
    .from(smtpCredentials)
    .where(eq(smtpCredentials.username, username))
    .limit(1);
  if (!row || !row.active) return null;
  const ok = await bcrypt.compare(password, row.passwordHash);
  if (!ok) return null;
  // Best-effort last-used stamp.
  await db
    .update(smtpCredentials)
    .set({ lastUsedAt: new Date() })
    .where(eq(smtpCredentials.id, row.id))
    .catch(() => {});
  return row.orgId;
}
