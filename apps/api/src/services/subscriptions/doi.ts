/**
 * The list double opt-in confirmation — the one sender of it. Generates a DOI
 * token (the `doi:<token>` Redis key + `{contactId,listId,orgId}` payload the
 * `GET /api/v1/confirm/:token` handler consumes) and emails the confirmation
 * link. Used by POST /api/v1/lists/:listId/subscribe and by signup-form submits
 * with `doubleOptIn` enabled.
 *
 * Those two used to carry a copy each of the same mail (the route's was inline).
 * They are one function now because this mail is the only one allowed through a
 * 'manual' suppression (TransactionalPurpose in lib/queues.ts, Z148): one place
 * asks for that, so one place has to be read to know who can.
 */

import crypto from 'node:crypto';
import { redis } from '@forgemsg/shared/redis';
import { sendTransactionalEmail } from '../../lib/queues.js';
import { env } from '../../config/env.js';

const DOI_TTL = 60 * 60 * 48; // 48h — the link's own text says so

export async function sendListDoiConfirmation(opts: {
  orgId: string;
  contactId: string;
  listId: string;
  email: string;
  listName: string;
  firstName?: string | null;
  toName?: string;
}): Promise<{ token: string; confirmUrl: string }> {
  const token = crypto.randomUUID();
  await redis.setex(
    `doi:${token}`,
    DOI_TTL,
    JSON.stringify({ contactId: opts.contactId, listId: opts.listId, orgId: opts.orgId }),
  );
  const apiPublicUrl = process.env.API_PUBLIC_URL ?? process.env.APP_URL ?? 'http://localhost:3001';
  const confirmUrl = `${apiPublicUrl}/api/v1/confirm/${token}`;
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : 'Hi,';
  await sendTransactionalEmail(
    {
      to: opts.email,
      ...(opts.toName ? { toName: opts.toName } : {}),
      from: env.SYSTEM_EMAIL_FROM,
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
    },
    // The recipient asked for this mail, so a 'manual' suppression (an
    // erasure, an operator's entry, graymail) does not stop it; every other
    // reason still does (mta-sender, isSuppressed).
    { purpose: 'doi_confirmation' },
  ).catch((err: unknown) => {
    // Logged, not thrown: the token is stored and both callers answer as
    // they did before — the route with 202, the form with its message.
    console.error(
      `[doi] doi_email_enqueue_failed list=${opts.listId} org=${opts.orgId}: ${(err as Error)?.message}`,
    );
  });
  return { token, confirmUrl };
}
