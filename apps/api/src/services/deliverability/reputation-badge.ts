/**
 * Public sender-reputation badge (#440).
 *
 * Resolves an opt-in, verified sending domain (across tenants) by hostname and
 * returns a coarse, privacy-safe deliverability summary for public display —
 * the transparency counterpart to the authenticated §17-J health-score.
 *
 * Only domains with `publicBadgeEnabled = true` AND `isVerified = true` are
 * exposed. Raw send volumes and per-provider internals are never returned.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { sendingDomains } from '../../db/schema/domains.js';
import { computeOrgHealth } from './health-score.js';
import { buildPublicBadge, type PublicReputationBadge } from './pure.js';

/** Default reporting window for the public badge. */
const BADGE_WINDOW_DAYS = 30;

/**
 * Look up a domain's public reputation badge. Returns `null` when the domain
 * is unknown, unverified, or has not opted in — callers map that to 404 so we
 * never confirm the existence of a private/opted-out domain.
 */
export async function getPublicReputationBadge(
  domain: string,
  now: Date = new Date(),
): Promise<PublicReputationBadge | null> {
  const host = domain.trim().toLowerCase();
  if (!host) return null;

  const [row] = await db
    .select({
      orgId: sendingDomains.orgId,
      domain: sendingDomains.domain,
      isVerified: sendingDomains.isVerified,
      warmupStatus: sendingDomains.warmupStatus,
      publicBadgeEnabled: sendingDomains.publicBadgeEnabled,
    })
    .from(sendingDomains)
    .where(and(eq(sendingDomains.domain, host), eq(sendingDomains.publicBadgeEnabled, true)))
    .limit(1);

  if (!row || !row.isVerified) return null;

  const health = await computeOrgHealth({
    orgId: row.orgId,
    domain: row.domain,
    days: BADGE_WINDOW_DAYS,
  });

  return buildPublicBadge({
    domain: row.domain,
    score: health.score,
    grade: health.grade,
    bounceRate: health.components.bounceRate,
    complaintRate: health.components.complaintRate,
    warmupStatus: row.warmupStatus,
    verified: row.isVerified,
    windowDays: health.windowDays,
    updatedAt: now.toISOString(),
  });
}
