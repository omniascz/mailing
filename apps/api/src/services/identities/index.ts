/**
 * Email-address identity verification (SES VerifyEmailIdentity) + the
 * sandbox→production sending gate.
 *
 * A sandbox org may only send to verified recipients — a verified email
 * identity or an address under a verified sending domain. Production access is
 * requested by the org and granted by a platform admin.
 */

import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  emailIdentities,
  organizations,
  sendingDomains,
  type EmailIdentity,
} from '../../db/schema/index.js';
import { sendTransactionalEmail } from '../../lib/queues.js';
import { AppError } from '../../lib/app-error.js';
import { env } from '../../config/env.js';

const API_BASE = process.env.API_BASE_URL ?? 'https://api.forgemsg.io';

// ── Email identities ────────────────────────────────────────────────────────

export async function createEmailIdentity(orgId: string, email: string): Promise<EmailIdentity> {
  const token = crypto.randomBytes(24).toString('base64url');
  const [row] = await db
    .insert(emailIdentities)
    .values({ orgId, email: email.toLowerCase(), token, status: 'pending' })
    .onConflictDoUpdate({
      target: [emailIdentities.orgId, emailIdentities.email],
      set: { token, status: 'pending', verifiedAt: null },
    })
    .returning();

  const link = `${API_BASE}/api/v1/email-identities/confirm/${token}`;
  await sendTransactionalEmail({
    to: email,
    from: env.SYSTEM_EMAIL_FROM,
    fromName: 'ForgeMsg',
    subject: 'Verify your email address',
    html: `<p>Confirm you control <strong>${email}</strong> so it can be used with ForgeMsg.</p><p><a href="${link}">Verify this address</a></p>`,
    text: `Verify ${email}: ${link}`,
  }).catch(() => {});

  return row!;
}

export async function confirmEmailIdentity(token: string): Promise<boolean> {
  const [row] = await db
    .update(emailIdentities)
    .set({ status: 'verified', verifiedAt: new Date() })
    .where(eq(emailIdentities.token, token))
    .returning({ id: emailIdentities.id });
  return !!row;
}

export async function listEmailIdentities(
  orgId: string,
): Promise<Array<Pick<EmailIdentity, 'id' | 'email' | 'status' | 'verifiedAt' | 'createdAt'>>> {
  return db
    .select({
      id: emailIdentities.id,
      email: emailIdentities.email,
      status: emailIdentities.status,
      verifiedAt: emailIdentities.verifiedAt,
      createdAt: emailIdentities.createdAt,
    })
    .from(emailIdentities)
    .where(eq(emailIdentities.orgId, orgId));
}

export async function deleteEmailIdentity(orgId: string, id: string): Promise<void> {
  const [row] = await db
    .delete(emailIdentities)
    .where(and(eq(emailIdentities.id, id), eq(emailIdentities.orgId, orgId)))
    .returning({ id: emailIdentities.id });
  if (!row) throw AppError.notFound('EmailIdentity');
}

// ── Sandbox gate ────────────────────────────────────────────────────────────

/**
 * Pure: given the recipient list and the org's verified emails + domains,
 * return the subset of recipients NOT allowed in sandbox. Empty = all allowed.
 */
export function sandboxViolations(
  recipients: string[],
  verifiedEmails: Set<string>,
  verifiedDomains: Set<string>,
): string[] {
  return recipients.filter((r) => {
    const email = r.toLowerCase();
    if (verifiedEmails.has(email)) return false;
    const domain = email.split('@')[1] ?? '';
    if (domain && verifiedDomains.has(domain)) return false;
    return true;
  });
}

/**
 * Enforce the sandbox gate for a send. No-op when the org is in production.
 * Throws 403 listing the unverified recipients when in sandbox.
 */
export async function assertSandboxSendAllowed(orgId: string, recipients: string[]): Promise<void> {
  const [org] = await db
    .select({ sendingMode: organizations.sendingMode })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org || org.sendingMode === 'production') return;

  const [emails, domains] = await Promise.all([
    db
      .select({ email: emailIdentities.email })
      .from(emailIdentities)
      .where(and(eq(emailIdentities.orgId, orgId), eq(emailIdentities.status, 'verified'))),
    db
      .select({ domain: sendingDomains.domain })
      .from(sendingDomains)
      .where(and(eq(sendingDomains.orgId, orgId), eq(sendingDomains.isVerified, true))),
  ]);

  const bad = sandboxViolations(
    recipients,
    new Set(emails.map((e) => e.email.toLowerCase())),
    new Set(domains.map((d) => d.domain.toLowerCase())),
  );
  if (bad.length > 0) {
    throw AppError.forbidden(
      `Account is in sandbox mode — can only send to verified recipients. Unverified: ${bad.slice(0, 5).join(', ')}. Verify them or request production access.`,
    );
  }
}

/**
 * Gate bulk sends (campaigns) in sandbox mode. Unlike transactional sends we
 * cannot verify a whole list/segment at dispatch time, so a non-production org
 * is blocked from firing campaigns entirely until it has production access.
 */
export async function assertBulkSendAllowed(orgId: string): Promise<void> {
  const [org] = await db
    .select({ sendingMode: organizations.sendingMode })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (org && org.sendingMode !== 'production') {
    throw AppError.forbidden(
      'Account is in sandbox mode — bulk campaigns are disabled. Request production access to send to a list.',
    );
  }
}

// ── Production access ───────────────────────────────────────────────────────

export async function requestProductionAccess(
  orgId: string,
  details: { useCase: string; website?: string; expectedVolume?: string },
): Promise<void> {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  await db
    .update(organizations)
    .set({
      settings: {
        ...settings,
        productionAccessRequest: {
          ...details,
          requestedAt: new Date().toISOString(),
          status: 'pending',
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

/** Platform-admin grant. Flips the org to production. */
export async function grantProductionAccess(orgId: string): Promise<void> {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const req = (settings.productionAccessRequest as Record<string, unknown> | undefined) ?? {};
  await db
    .update(organizations)
    .set({
      sendingMode: 'production',
      settings: {
        ...settings,
        productionAccessRequest: {
          ...req,
          status: 'approved',
          approvedAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}
