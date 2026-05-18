/**
 * SMS Coupon Merge Tags — #38
 *
 * Resolves `{{coupon_code:batchId}}` merge tags in SMS body text.
 * When found, assigns a unique coupon code from the named batch to
 * the contact (idempotent — returns existing assignment if already done).
 *
 * Usage in SMS content:
 *   "Sleva 20% jen pro tebe: {{coupon_code:550e8400-e29b-41d4-a716-446655440000}}"
 *   → "Sleva 20% jen pro tebe: PROMO-XK92F"
 */

import { assignCodeToContact } from '../coupons/index.js';

const COUPON_TAG_RE = /\{\{coupon_code:([0-9a-f-]{36})\}\}/gi;

/**
 * Replace all `{{coupon_code:<batchId>}}` placeholders in `content` with
 * a real coupon code assigned to this contact.
 *
 * @param content   Raw SMS template text
 * @param orgId     Org scoping (for isolation)
 * @param contactId Contact to assign codes to
 * @returns Rendered SMS text with codes substituted
 */
export async function resolveCouponMergeTags(
  content: string,
  orgId: string,
  contactId: string,
): Promise<string> {
  const batchIds = new Set<string>();
  let match: RegExpExecArray | null;

  // Collect unique batch IDs referenced in the template
  const re = new RegExp(COUPON_TAG_RE.source, 'gi');
  while ((match = re.exec(content)) !== null) {
    if (match[1]) batchIds.add(match[1]);
  }

  if (batchIds.size === 0) return content;

  // Assign a code per batch (parallel, idempotent)
  const assignments = await Promise.all(
    [...batchIds].map(async (batchId) => {
      const code = await assignCodeToContact(orgId, batchId, contactId);
      return [batchId, code.code] as const;
    }),
  );

  const codeMap = new Map(assignments);

  // Replace all placeholders
  return content.replace(
    /\{\{coupon_code:([0-9a-f-]{36})\}\}/gi,
    (_, batchId: string) => codeMap.get(batchId) ?? '',
  );
}
