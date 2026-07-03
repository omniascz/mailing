/**
 * Templated send resolution (SES SendTemplatedEmail). Resolves a stored
 * template id + merge vars into subject/html/text — previously `templateId` was
 * accepted by the transactional API but never resolved.
 */

import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { templates } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { renderEmail, renderPlainText, parseMergeTags } from '@forgemsg/editor/render';
import type { EmailSchema } from '@forgemsg/editor/schema';

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

const DEFAULT_GLOBAL_STYLES = {
  backgroundColor: '#f3f4f6',
  contentBackgroundColor: '#ffffff',
  fontFamily: 'Arial, Helvetica, sans-serif',
  linkColor: '#2563eb',
  textColor: '#111827',
  contentWidth: 600,
};

/**
 * Render a stored template (org-owned or a public built-in) with the given
 * merge vars. Merge vars resolve `{{key}}` tags (via the contact.customFields
 * fallback the editor merge engine uses).
 */
export async function renderStoredTemplate(
  orgId: string,
  templateId: string,
  mergeVars: Record<string, string> = {},
): Promise<RenderedTemplate> {
  const [tpl] = await db
    .select({
      subject: templates.subject,
      preheader: templates.preheader,
      blocks: templates.blocks,
      globalStyles: templates.globalStyles,
    })
    .from(templates)
    .where(
      and(
        eq(templates.id, templateId),
        isNull(templates.deletedAt),
        // org-owned OR a shared/public built-in
        or(eq(templates.orgId, orgId), isNull(templates.orgId), eq(templates.isPublic, 'true')),
      ),
    )
    .limit(1);

  if (!tpl) throw AppError.badRequest(`Unknown templateId: ${templateId}`);

  const email = {
    subject: tpl.subject ?? '',
    preheader: tpl.preheader ?? '',
    globalStyles: { ...DEFAULT_GLOBAL_STYLES, ...(tpl.globalStyles ?? {}) },
    blocks: tpl.blocks ?? [],
  } as unknown as EmailSchema;

  const context = { contact: { customFields: mergeVars } };
  const { html } = renderEmail(email, { context });
  const text = renderPlainText(email, { context });
  const subject = parseMergeTags(tpl.subject ?? '', context);

  return { subject, html, text };
}
