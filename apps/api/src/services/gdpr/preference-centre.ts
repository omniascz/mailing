/**
 * GDPR per-purpose preference centre (#646).
 *
 * Generates signed tokens that let contacts manage their own consents
 * without needing a user account. Tokens embed orgId + contactId + expiry,
 * signed with PREFERENCE_CENTRE_SECRET.
 *
 * URL: /preferences?token=<signed-token>
 * Response: list of purposes + current consent state + toggle buttons
 */

import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import { processingPurposes, contactGdprConsents, contacts } from '../../db/schema/index.js';
import { and, eq, desc } from 'drizzle-orm';

const SECRET = process.env.PREFERENCE_CENTRE_SECRET ?? 'preference-centre-secret-change-me';
const TOKEN_TTL_SECONDS = 7 * 24 * 3600; // 7 days

// ─── Token generation ─────────────────────────────────────────────────────────

interface TokenPayload {
  orgId: string;
  contactId: string;
  exp: number; // unix seconds
}

function sign(payload: TokenPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verify(token: string): TokenPayload | null {
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as TokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Generate a preference-centre link for a contact. */
export function generatePreferenceCentreToken(orgId: string, contactId: string): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  return sign({ orgId, contactId, exp });
}

/** Verify and decode a preference-centre token. */
export function verifyPreferenceCentreToken(token: string): TokenPayload | null {
  return verify(token);
}

export interface PurposeState {
  purposeId: string;
  slug: string;
  name: string;
  description: string | null;
  legalBasis: string;
  hasConsent: boolean;
  expiresAt: Date | null;
}

/** Load all non-archived purposes + current consent states for a contact. */
export async function getPreferenceCentreState(
  orgId: string,
  contactId: string,
): Promise<{ contact: { email: string | null; firstName: string | null }; purposes: PurposeState[] }> {
  const [contact] = await db
    .select({ email: contacts.email, firstName: contacts.firstName })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);

  if (!contact) throw Object.assign(new Error('Contact not found'), { statusCode: 404 });

  const purposes = await db
    .select()
    .from(processingPurposes)
    .where(and(eq(processingPurposes.orgId, orgId), eq(processingPurposes.archived, false)));

  const states: PurposeState[] = [];
  for (const p of purposes) {
    const [latest] = await db
      .select()
      .from(contactGdprConsents)
      .where(
        and(
          eq(contactGdprConsents.orgId, orgId),
          eq(contactGdprConsents.contactId, contactId),
          eq(contactGdprConsents.purposeId, p.id),
        ),
      )
      .orderBy(desc(contactGdprConsents.grantedAt))
      .limit(1);

    const active =
      latest &&
      latest.granted &&
      !latest.revokedAt &&
      (!latest.expiresAt || latest.expiresAt > new Date());

    states.push({
      purposeId: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      legalBasis: p.legalBasis,
      hasConsent: !!active,
      expiresAt: active && latest?.expiresAt ? latest.expiresAt : null,
    });
  }

  return { contact, purposes: states };
}

/** Grant or revoke a single purpose via preference centre. */
export async function updatePreferenceCentreConsent(
  orgId: string,
  contactId: string,
  purposeId: string,
  grant: boolean,
  ipAddress?: string,
): Promise<void> {
  const [purpose] = await db
    .select()
    .from(processingPurposes)
    .where(and(eq(processingPurposes.orgId, orgId), eq(processingPurposes.id, purposeId)))
    .limit(1);

  if (!purpose) throw Object.assign(new Error('Purpose not found'), { statusCode: 404 });

  const expiresAt = grant && purpose.retentionDays
    ? new Date(Date.now() + purpose.retentionDays * 86_400_000)
    : null;

  await db.insert(contactGdprConsents).values({
    orgId,
    contactId,
    purposeId,
    granted: grant,
    source: 'preference_centre',
    consentText: grant
      ? `Souhlas udělen přes Preference Centre`
      : `Souhlas odebrán přes Preference Centre`,
    ipAddress: ipAddress ?? null,
    revokedAt: grant ? null : new Date(),
    revokeReason: grant ? null : 'user_opt_out_preference_centre',
    expiresAt,
  });
}
