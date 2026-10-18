/**
 * Per-purpose double opt-in (#647).
 *
 * When a contact signs up for a purpose with legalBasis='consent',
 * send a confirmation email. The contact clicks the link to confirm.
 * Only then is consent stored as granted=true.
 *
 * Flow:
 *   1. Contact subscribes → grantConsentPending() stores a pending token in Redis
 *   2. Confirmation email is sent with <API_PUBLIC_URL>/public/gdpr/doi/confirm?token=<t>
 *   3. Contact clicks → GET /public/gdpr/doi/confirm is a page with a button
 *      (doiTokenExists() only reads the token); the button POSTs, and
 *      confirmDoiConsent() validates token, inserts granted=true consent
 *
 * Where the button leads afterwards is only the redirectUrl the organisation
 * gave when it started, kept with the token — never anything in the link.
 */

import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import { processingPurposes, contactGdprConsents, contacts } from '../../db/schema/index.js';
import { and, eq, isNull } from 'drizzle-orm';
import { sendTransactionalEmail } from '../../lib/queues.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/app-error.js';
import { purposeDoiLimitKey, withinDoiLimit } from '../subscriptions/doi.js';

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
  /** Where the button redirects after the consent: the organisation's, from the start. */
  redirectUrl?: string;
}

/**
 * The redirect target as given at the start: an absolute http: or https: URL,
 * or an AppError 400 INVALID_REDIRECT_URL. Anything else — javascript:, a
 * relative or scheme-relative path, ftp: — the button would have sent the
 * person to, under our domain.
 */
export function parseRedirectUrl(value: unknown): string {
  let url: URL | null = null;
  try {
    url = typeof value === 'string' ? new URL(value) : null;
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new AppError({
      code: 'INVALID_REDIRECT_URL',
      message: 'redirectUrl must be an absolute http or https URL',
      statusCode: 400,
    });
  }
  // As the organisation wrote it: the Location the button answers with.
  return value as string;
}

/**
 * Initiate per-purpose DOI: store pending token in Redis + send confirmation email.
 * Called when legalBasis='consent' on a new subscription.
 */
export async function initiatePurposeDoi(
  orgId: string,
  contactId: string,
  purposeSlug: string,
  options?: { ipAddress?: string; redirectUrl?: unknown },
): Promise<{ tokenKey: string }> {
  // Checked before anything is looked up, stored or sent.
  // Absent (undefined or null) means no target, as before.
  const redirectUrl =
    options?.redirectUrl === undefined || options.redirectUrl === null
      ? undefined
      : parseRedirectUrl(options.redirectUrl);

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

  // A live contact of this organisation with an address. Another org's id, an
  // unknown one, a deleted contact and one erased (no address left) answer the
  // same 404: a deleted contact used to get the e-mail, an erased one a 500.
  const [contact] = await db
    .select({ email: contacts.email, firstName: contacts.firstName })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId), isNull(contacts.deletedAt)))
    .limit(1);

  if (!contact?.email) throw AppError.notFound('Contact');

  // Generate and store token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenKey = `doi:purpose:${token}`;

  // At most three confirmations per address and purpose in any 24 hours — the
  // list DOI's limit (Michal 14. 10.), here per purpose. Over it the start
  // answers as for a sent one, and no token is stored and no e-mail queued.
  // The log names no address. A Redis failure throws.
  if (!(await withinDoiLimit(purposeDoiLimitKey(purpose.id, contact.email), token))) {
    console.warn(`[doi] purpose_doi_rate_limited purpose=${purpose.id} org=${orgId}`);
    return { tokenKey };
  }

  const payload: DoiPayload = {
    orgId,
    contactId,
    purposeId: purpose.id,
    ipAddress: options?.ipAddress,
    ...(redirectUrl ? { redirectUrl } : {}),
  };

  const redis = await getRedis();
  await redis.set(tokenKey, JSON.stringify(payload), DOI_TOKEN_TTL);

  // The page with the button, on the API, from the same base as the list DOI's
  // link (services/subscriptions/doi.ts). It used to be APP_BASE_URL/gdpr/doi/
  // confirm, which nothing serves (404), and carried the redirect target in
  // its query, where anyone could rewrite it.
  const baseUrl = process.env.API_PUBLIC_URL ?? process.env.APP_URL ?? 'http://localhost:3001';
  const confirmUrl = new URL('/public/gdpr/doi/confirm', baseUrl);
  confirmUrl.searchParams.set('token', token);

  // Send confirmation email
  const firstName = contact.firstName ?? '';
  await sendTransactionalEmail({
    to: contact.email,
    from: env.SYSTEM_EMAIL_FROM,
    fromName: env.SYSTEM_EMAIL_FROM_NAME,
    subject: `Potvrzení souhlasu — ${purpose.name}`,
    html: buildDoiEmailHtml(purpose.name, firstName, confirmUrl.toString()),
    text: `Potvrďte souhlas s účelem "${purpose.name}" kliknutím na odkaz: ${confirmUrl.toString()}`,
    orgId,
    contactId,
  });

  return { tokenKey };
}

/** Whether a per-purpose DOI token is stored. Reads only: opening a link must not consume it. */
export async function doiTokenExists(token: string): Promise<boolean> {
  const redis = await getRedis();
  return (await redis.get(`doi:purpose:${token}`)) !== null;
}

/**
 * Confirm DOI consent from clicked email link.
 * Returns the redirect target stored at the start, if the organisation gave one.
 */
export async function confirmDoiConsent(
  token: string,
  ipAddress?: string,
): Promise<{ purposeSlug: string; orgId: string; contactId: string; redirectUrl?: string }> {
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

  return {
    purposeSlug: purpose.slug,
    orgId: payload.orgId,
    contactId: payload.contactId,
    ...(payload.redirectUrl ? { redirectUrl: payload.redirectUrl } : {}),
  };
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
