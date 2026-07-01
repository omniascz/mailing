/**
 * Reusable double opt-in confirmation sender. Generates a DOI token (same
 * `doi:<token>` Redis key + `{contactId,listId,orgId}` payload the
 * `GET /api/v1/confirm/:token` handler consumes) and emails the confirmation
 * link. Used by signup-form submits with `doubleOptIn` enabled.
 */

import crypto from 'node:crypto';
import { redis } from '../../lib/redis.js';
import { sendTransactionalEmail } from '../../lib/queues.js';

const DOI_TTL = 60 * 60 * 48; // 48h — must match subscriptions route

export async function sendListDoiConfirmation(opts: {
  orgId: string;
  contactId: string;
  listId: string;
  email: string;
  listName: string;
  firstName?: string | null;
}): Promise<void> {
  const token = crypto.randomUUID();
  await redis.setex(
    `doi:${token}`,
    DOI_TTL,
    JSON.stringify({ contactId: opts.contactId, listId: opts.listId, orgId: opts.orgId }),
  );
  const apiPublicUrl = process.env.API_PUBLIC_URL ?? process.env.APP_URL ?? 'http://localhost:3001';
  const confirmUrl = `${apiPublicUrl}/api/v1/confirm/${token}`;
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : 'Hi,';
  await sendTransactionalEmail({
    to: opts.email,
    from: process.env.DOI_FROM_EMAIL ?? 'no-reply@example.com',
    fromName: opts.listName,
    subject: `Confirm your subscription to ${opts.listName}`,
    html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:24px;color:#1e293b">
<p style="font-size:16px">${greeting}</p>
<p style="font-size:16px">You signed up to receive emails from <strong>${opts.listName}</strong>. Click below to confirm.</p>
<p style="margin:32px 0"><a href="${confirmUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Confirm subscription</a></p>
<p style="font-size:13px;color:#64748b">If you didn't sign up, ignore this — no further messages will arrive. The link expires in 48 hours.</p>
</body></html>`,
    text: `${greeting}\n\nYou signed up to receive emails from ${opts.listName}. Confirm here:\n${confirmUrl}\n\nLink expires in 48 hours.`,
    orgId: opts.orgId,
    contactId: opts.contactId,
  }).catch(() => {});
}
