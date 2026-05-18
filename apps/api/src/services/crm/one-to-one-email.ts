/**
 * Automated 1:1 emails (#198)
 *
 * Generates a plain-text-style email that appears to come from a specific
 * sales rep's email address (not a marketing sender). Used via the
 * `send_personal_email` workflow action.
 *
 * Key differences from bulk campaign emails:
 *   - from/reply-to: rep's email address
 *   - No marketing footer / unsubscribe block
 *   - Plain-text body (HTML wrapper is minimal, no tables)
 *   - Subject is personalized merge-tag expanded
 */

export interface PersonalEmailPayload {
  orgId: string;
  contactId: string;
  workflowRunId?: string;

  /** Rep sending the email */
  fromEmail: string;
  fromName?: string;
  replyTo?: string;

  subject: string;
  /** Plain-text body — {{first_name}}, {{company}} etc. supported */
  body: string;
}

/**
 * Minimal HTML wrapper that looks like a plain-text email in mail clients.
 * No banners, tables, or marketing footers.
 */
export function buildPersonalHtml(body: string): string {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.6;max-width:600px;margin:0 auto;padding:16px">
<p>${escaped}</p>
</body>
</html>`;
}

/**
 * Substitutes {{field}} merge tags in both subject and body.
 */
export function substitutePersonalMergeTags(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => vars[key.trim()] ?? `{{${key}}}`);
}

/**
 * Build the merge-tag variable map from contact data.
 */
export function buildMergeVars(contact: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  customFields?: Record<string, unknown> | null;
}): Record<string, string> {
  const vars: Record<string, string> = {
    first_name: contact.firstName ?? '',
    last_name: contact.lastName ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    full_name: [contact.firstName, contact.lastName].filter(Boolean).join(' '),
  };

  for (const [k, v] of Object.entries(contact.customFields ?? {})) {
    vars[`custom.${k}`] = String(v ?? '');
  }

  return vars;
}
