/**
 * Per-purpose double opt-in (#647).
 *
 * When a contact signs up for a purpose with legalBasis='consent',
 * send a confirmation email. The contact clicks the link to confirm.
 * Only then is consent stored as granted=true.
 *
 * Flow:
 *   1. Contact subscribes → grantConsentPending() stores a pending token in Redis
 *   2. Confirmation email is sent with /gdpr/doi/confirm?token=<t> link
 *   3. Contact clicks → confirmDoiConsent() validates token, inserts granted=true consent
 */

import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import { processingPurposes, contactGdprConsents, contacts } from '../../db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { sendTransactionalEmail } from '../../lib/queues.js';

const DOI_TOKEN_TTL = 24 * 3600; // 24 hours in seconds

let _redis: {
  get(k: string): Promise<string | null>;
  set(k: string, v: string, ex: number): Promise<unknown>;
  del(k: string): Promise<unknown>;
} | null = null;

async function getRedis() {
  if (_redis) return _redis;
  const { Redis } = await import('ioredis');
  const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  _redis = {
    get: (k) => client.get(k),
    set: (k, v, ex) => client.set(k, v, 'EX', ex),
    del: (k) => client.del(k),
  };
  return _redis;
}

interface DoiPayload {
  orgId: string;
  contactId: string;
  purposeId: string;
  ipAddress?: string;
}

/**
 * Initiate per-purpose DOI: store pending token in Redis + send confirmation email.
 * Called when legalBasis='consent' on a new subscription.
 */
export async function initiatePurposeDoi(
  orgId: string,
  contactId: string,
  purposeSlug: string,
  options?: { ipAddress?: string; redirectUrl?: string },
): Promise<{ tokenKey: string }> {
  // Resolve purpose
  const [purpose] = await db
    .select()
    .from(processingPurposes)
    .where(and(eq(processingPurposes.orgId, orgId), eq(processingPurposes.slug, purposeSlug)))
    .limit(1);

  if (!purpose) throw Object.assign(new Error('Purpose not found'), { statusCode: 404 });
  if (purpose.legalBasis !== 'consent') {
    throw Object.assign(new Error('DOI is only available for consent-based purposes'), {
      statusCode: 400,
    });
  }

  // Resolve contact email
  const [contact] = await db
    .select({ email: contacts.email, firstName: contacts.firstName })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);

  if (!contact?.email) throw Object.assign(new Error('Contact has no email'), { statusCode: 422 });

  // Generate and store token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenKey = `doi:purpose:${token}`;
  const payload: DoiPayload = {
    orgId,
    contactId,
    purposeId: purpose.id,
    ipAddress: options?.ipAddress,
  };

  const redis = await getRedis();
  await redis.set(tokenKey, JSON.stringify(payload), DOI_TOKEN_TTL);

  // Build confirmation URL
  const baseUrl = process.env.APP_BASE_URL ?? 'https://app.forgemsg.com';
  const confirmUrl = new URL('/gdpr/doi/confirm', baseUrl);
  confirmUrl.searchParams.set('token', token);
  if (options?.redirectUrl) confirmUrl.searchParams.set('redirect', options.redirectUrl);

  // Send confirmation email
  const firstName = contact.firstName ?? '';
  await sendTransactionalEmail({
    to: contact.email,
    from: process.env.SYSTEM_EMAIL_FROM ?? 'noreply@forgemsg.com',
    fromName: process.env.SYSTEM_EMAIL_FROM_NAME ?? 'ForgeMsg',
    subject: `Potvrzení souhlasu — ${purpose.name}`,
    html: buildDoiEmailHtml(purpose.name, firstName, confirmUrl.toString()),
    text: `Potvrďte souhlas s účelem "${purpose.name}" kliknutím na odkaz: ${confirmUrl.toString()}`,
    orgId,
    contactId,
  });

  return { tokenKey };
}

/**
 * Confirm DOI consent from clicked email link.
 * Returns the purpose slug so caller can redirect appropriately.
 */
export async function confirmDoiConsent(
  token: string,
  ipAddress?: string,
): Promise<{ purposeSlug: string; contactId: string }> {
  const redis = await getRedis();
  const tokenKey = `doi:purpose:${token}`;
  const raw = await redis.get(tokenKey);

  if (!raw) throw Object.assign(new Error('Token expired or invalid'), { statusCode: 410 });

  const payload = JSON.parse(raw) as DoiPayload;

  // Load purpose for metadata
  const [purpose] = await db
    .select({ slug: processingPurposes.slug, retentionDays: processingPurposes.retentionDays })
    .from(processingPurposes)
    .where(eq(processingPurposes.id, payload.purposeId))
    .limit(1);

  if (!purpose) throw Object.assign(new Error('Purpose no longer exists'), { statusCode: 404 });

  const expiresAt = purpose.retentionDays
    ? new Date(Date.now() + purpose.retentionDays * 86_400_000)
    : null;

  // Insert confirmed consent
  await db.insert(contactGdprConsents).values({
    orgId: payload.orgId,
    contactId: payload.contactId,
    purposeId: payload.purposeId,
    granted: true,
    source: 'doi_email',
    consentText: 'Souhlas potvrzen kliknutím na odkaz v potvrzovacím e-mailu',
    ipAddress: ipAddress ?? payload.ipAddress ?? null,
    expiresAt,
  });

  // Consume token (one-time use)
  await redis.del(tokenKey);

  return { purposeSlug: purpose.slug, contactId: payload.contactId };
}

// ─── Email template ───────────────────────────────────────────────────────────

function buildDoiEmailHtml(purposeName: string, firstName: string, confirmUrl: string): string {
  const greeting = firstName ? `Dobrý den, ${firstName},` : 'Dobrý den,';
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <p>${greeting}</p>
  <p>Požádali jste o souhlas se zpracováním vašich osobních údajů pro účel: <strong>${purposeName}</strong>.</p>
  <p>Pro potvrzení klikněte na tlačítko níže. Odkaz je platný 24 hodin.</p>
  <p style="text-align:center;margin:32px 0">
    <a href="${confirmUrl}"
       style="background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold">
      Potvrdit souhlas
    </a>
  </p>
  <p style="font-size:12px;color:#666">
    Pokud jste o souhlas nepožádali, tento e-mail ignorujte.
    Odkaz: ${confirmUrl}
  </p>
</body>
</html>`;
}
