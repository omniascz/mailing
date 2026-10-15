/**
 * The URL prefix of an org's tracking and unsubscribe links.
 *
 * Resolution:
 *  1. Look up the org's verified sending domain (return_path_verified=true).
 *  2. If found AND mailSubdomain is set → https://{mailSubdomain}.
 *     The customer's DNS CNAME points this subdomain to our tracking
 *     edge, so the open/click endpoints serve normally but the URL the
 *     recipient sees is on their own brand.
 *  3. Otherwise → the default TRACKING_BASE_URL.
 *
 * One function for both senders of these links. batch-sender asks for it over
 * /api/v1/internal/tracking-domain (routes/v1/internal/tracking-domain.ts,
 * which answers with this); the inline flow e-mail builds its unsubscribe URL
 * in the API (services/workflows/inline-optout.ts) and calls it directly — so
 * the two can't name different hosts for the same org. Z157.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { sendingDomains } from '../../db/schema/index.js';

export const DEFAULT_TRACKING_BASE_URL =
  process.env.TRACKING_BASE_URL ?? 'https://track.example.invalid';

export async function resolveTrackingBaseUrl(
  orgId: string,
): Promise<{ baseUrl: string; branded: boolean }> {
  // Pick the first verified domain with a mailSubdomain. An org can have
  // multiple sending domains; we currently use the first verified one as
  // the tracking host. Future Sprint B.6 follow-up could expose
  // per-campaign domain selection.
  const [row] = await db
    .select({
      mailSubdomain: sendingDomains.mailSubdomain,
      returnPathVerified: sendingDomains.returnPathVerified,
    })
    .from(sendingDomains)
    .where(and(eq(sendingDomains.orgId, orgId), eq(sendingDomains.returnPathVerified, true)))
    .limit(1);

  if (row?.mailSubdomain && row.returnPathVerified) {
    return { baseUrl: `https://${row.mailSubdomain}`, branded: true };
  }
  return { baseUrl: DEFAULT_TRACKING_BASE_URL, branded: false };
}
