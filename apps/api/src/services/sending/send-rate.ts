/**
 * Per-second send-rate limit (SES "max send rate"): the rate an org's
 * transactional mail is SENT at. The rate comes from the org's plan tier,
 * overridable via settings.maxSendRate.
 *
 * It is enforced by the MTA worker when a message is sent (workers
 * lib/org-send-rate.ts), which paces rather than refuses. It used to be a
 * fixed-window counter here, taken at acceptance, that refused the message
 * with 429 (enforceSendRate, removed in Z134).
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { organizations } from '../../db/schema/index.js';

/** Default max send rate (messages/second) by plan tier. 0 = unlimited. */
export const PLAN_SEND_RATE: Record<string, number> = {
  free: 1,
  starter: 5,
  pro: 14,
  business: 50,
  enterprise: 0, // unlimited (custom infra)
};

/** Resolve an org's per-second send rate (settings override → plan default). */
export async function getOrgSendRate(orgId: string): Promise<number> {
  const [org] = await db
    .select({ plan: organizations.plan, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return 0;
  const override = (org.settings as Record<string, unknown> | null)?.maxSendRate;
  if (typeof override === 'number' && override >= 0) return override;
  return PLAN_SEND_RATE[org.plan] ?? 0;
}
