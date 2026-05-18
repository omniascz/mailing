/**
 * Email coupon merge tag resolver — #87
 *
 * Resolves `{{coupon_code:batchId}}` placeholders in email HTML/text content
 * BEFORE the standard merge tag pass runs. Works identically to the SMS
 * coupon-merge service but is called on the API side during email rendering.
 *
 * Usage:
 *   const html = await resolveEmailCouponTags(rawHtml, orgId, contactId);
 *   const rendered = parseMergeTags(html, ctx);
 *
 * Syntax (case-insensitive):
 *   {{coupon_code:550e8400-e29b-41d4-a716-446655440000}}
 *
 * The tag is replaced with the contact's assigned unique code from the batch.
 * Assignment is idempotent — the same contact always gets the same code.
 */

import { assignCodeToContact } from '../coupons/index.js';

const COUPON_TAG_RE = /\{\{coupon_code:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}\}/gi;

/**
 * Pre-process email HTML/text to replace all `{{coupon_code:batchId}}` tags
 * with real coupon codes assigned to the given contact.
 *
 * @param content   Raw email HTML or plain-text string
 * @param orgId     Org ID (for multi-tenant isolation)
 * @param contactId Contact to assign codes to
 * @returns Content with all coupon tags resolved
 */
export async function resolveEmailCouponTags(
  content: string,
  orgId: string,
  contactId: string,
): Promise<string> {
  // Collect distinct batch IDs referenced in the template
  const batchIds = new Set<string>();
  const re = new RegExp(COUPON_TAG_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (match[1]) batchIds.add(match[1]);
  }

  if (batchIds.size === 0) return content;

  // Assign one code per batch in parallel (idempotent)
  const assignments = await Promise.all(
    [...batchIds].map(async (batchId) => {
      const coupon = await assignCodeToContact(orgId, batchId, contactId);
      return [batchId, coupon.code] as const;
    }),
  );

  const codeMap = new Map(assignments);

  return content.replace(
    /\{\{coupon_code:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}\}/gi,
    (_, batchId: string) => codeMap.get(batchId) ?? '',
  );
}

/**
 * Preview helper — replaces `{{coupon_code:batchId}}` with a placeholder
 * label (no DB access needed). Used in template preview / test-send flows.
 *
 * @param content  Raw email content
 * @param label    Replacement label, defaults to "[COUPON_CODE]"
 */
export function previewEmailCouponTags(content: string, label = '[COUPON_CODE]'): string {
  return content.replace(COUPON_TAG_RE, label);
}
