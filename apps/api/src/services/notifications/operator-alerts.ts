/**
 * Operator alerts — emails to OPERATOR_EMAIL on platform-level events.
 *
 * Differs from regular transactional email (sendTransactionalEmail) in
 * that recipient is hard-coded to the platform operator, not a tenant
 * contact. All sends are best-effort: if the queue is down or the
 * recipient isn't configured, we log and move on — the originating
 * event (signup, abuse report) must not fail because the operator
 * couldn't be notified.
 */
import { sendTransactionalEmail } from '../../lib/queues.js';
import { env } from '../../config/env.js';

const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL;
const FROM_EMAIL = env.SYSTEM_EMAIL_FROM;

function operatorConfigured(): boolean {
  return Boolean(OPERATOR_EMAIL && OPERATOR_EMAIL.includes('@'));
}

interface SignupEventInput {
  orgName: string;
  ownerEmail: string;
  ownerName: string | null;
  orgId: string;
}

export async function notifyOperatorOfSignup(input: SignupEventInput): Promise<void> {
  if (!operatorConfigured()) return;
  try {
    await sendTransactionalEmail({
      to: OPERATOR_EMAIL!,
      from: FROM_EMAIL,
      fromName: 'Mailforge Platform',
      subject: `[Mailforge] New signup: ${input.orgName}`,
      html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:24px;color:#1e293b">
<h2>New organization signed up</h2>
<table style="border-collapse:collapse;width:100%;font-size:14px">
  <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>Org:</strong></td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${input.orgName}</td></tr>
  <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>Owner:</strong></td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${input.ownerName ?? '—'} (${input.ownerEmail})</td></tr>
  <tr><td style="padding:8px"><strong>Org ID:</strong></td><td style="padding:8px"><code>${input.orgId}</code></td></tr>
</table>
<p style="margin-top:24px"><a href="${process.env.APP_URL ?? ''}/superadmin/orgs/${input.orgId}">Open in /superadmin</a></p>
</body></html>`,
      text: `New signup\n\nOrg: ${input.orgName}\nOwner: ${input.ownerName ?? '—'} (${input.ownerEmail})\nOrg ID: ${input.orgId}\n\n${process.env.APP_URL ?? ''}/superadmin/orgs/${input.orgId}`,
    });
  } catch {
    // Best-effort: log was already emitted by sendTransactionalEmail on failure.
  }
}

interface AbuseEventInput {
  orgId: string;
  orgName: string;
  reportedAt: Date;
  reason: string;
  sourceIp?: string;
  recipient?: string;
}

export async function notifyOperatorOfAbuse(input: AbuseEventInput): Promise<void> {
  if (!operatorConfigured()) return;
  try {
    await sendTransactionalEmail({
      to: OPERATOR_EMAIL!,
      from: FROM_EMAIL,
      fromName: 'Mailforge Platform',
      subject: `[ABUSE] ${input.orgName} — ${input.reason.slice(0, 60)}`,
      html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:24px;color:#1e293b">
<h2 style="color:#dc2626">Abuse report received</h2>
<table style="border-collapse:collapse;width:100%;font-size:14px">
  <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>Org:</strong></td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${input.orgName}</td></tr>
  <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>Reason:</strong></td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${input.reason}</td></tr>
  ${input.sourceIp ? `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>Source IP:</strong></td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${input.sourceIp}</td></tr>` : ''}
  ${input.recipient ? `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>Complained recipient:</strong></td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${input.recipient}</td></tr>` : ''}
  <tr><td style="padding:8px"><strong>Reported at:</strong></td><td style="padding:8px">${input.reportedAt.toISOString()}</td></tr>
</table>
<p style="margin-top:24px"><a href="${process.env.APP_URL ?? ''}/superadmin/orgs/${input.orgId}" style="background:#dc2626;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">Open org → consider suspend</a></p>
</body></html>`,
      text: `[ABUSE] ${input.orgName}\n\nReason: ${input.reason}\n${input.sourceIp ? `Source IP: ${input.sourceIp}\n` : ''}${input.recipient ? `Recipient: ${input.recipient}\n` : ''}Reported: ${input.reportedAt.toISOString()}\n\nOpen: ${process.env.APP_URL ?? ''}/superadmin/orgs/${input.orgId}`,
      orgId: input.orgId,
    });
  } catch {
    // Best-effort.
  }
}
