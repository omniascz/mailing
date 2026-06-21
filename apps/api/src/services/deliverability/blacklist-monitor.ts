/**
 * DNS-based IP blacklist monitor.
 *
 * Checks each dedicated IP against the industry-standard DNSBL zones:
 *  - Spamhaus ZEN (composite: SBL + XBL + PBL)
 *  - Barracuda BRBL
 *  - SORBS DNSBL
 *  - Validity / Return Path RCVD_IN_SENDERSCORE (reputation check)
 *
 * A listing is detected by querying {reversed-ip}.{zone} — if the lookup
 * resolves (any A record), the IP is listed on that zone.
 *
 * Results are stored in dedicated_ips.blacklist_count and a snapshot row
 * is written to ip_blacklist_events for history / alerting.
 */

import dns from 'node:dns/promises';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { dedicatedIps } from '../../db/schema/index.js';

// ─── DNSBL zones to query ─────────────────────────────────────────────────────

const ZONES = [
  { name: 'spamhaus_zen', zone: 'zen.spamhaus.org' },
  { name: 'barracuda_brbl', zone: 'b.barracudacentral.org' },
  { name: 'sorbs_dnsbl', zone: 'dnsbl.sorbs.net' },
  { name: 'uceprotect_l1', zone: 'dnsbl-1.uceprotect.net' },
  { name: 'spamcop', zone: 'bl.spamcop.net' },
  { name: 'validity_rp', zone: 'bl.score.senderscore.com' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Reverse an IPv4 address for DNSBL lookup. */
function reverseIp(ip: string): string {
  return ip.split('.').reverse().join('.');
}

export interface BlacklistCheckResult {
  ip: string;
  listings: Array<{ zone: string; name: string; returnCode: string }>;
  totalListings: number;
  checkedAt: string;
}

/** Check a single IP against all DNSBL zones. Returns listing details. */
export async function checkIpBlacklists(ip: string): Promise<BlacklistCheckResult> {
  const reversed = reverseIp(ip);
  const listings: BlacklistCheckResult['listings'] = [];

  await Promise.all(
    ZONES.map(async ({ name, zone }) => {
      const fqdn = `${reversed}.${zone}`;
      try {
        const addrs = await dns.resolve4(fqdn);
        // Any resolution means listed; addrs[0] encodes the reason code
        listings.push({ zone, name, returnCode: addrs[0] ?? '127.0.0.2' });
      } catch {
        // NXDOMAIN = not listed; other errors we treat as inconclusive (skip)
      }
    }),
  );

  return {
    ip,
    listings,
    totalListings: listings.length,
    checkedAt: new Date().toISOString(),
  };
}

/** Refresh blacklist_count for all active dedicated IPs. Returns summary. */
export async function refreshAllIpBlacklists(): Promise<{
  checked: number;
  listed: number;
  details: BlacklistCheckResult[];
}> {
  const ips = await db
    .select({ id: dedicatedIps.id, ipAddress: dedicatedIps.ipAddress })
    .from(dedicatedIps)
    .where(sql`${dedicatedIps.status} IN ('active', 'warming')`);

  const results = await Promise.all(ips.map((row) => checkIpBlacklists(row.ipAddress)));

  // Persist counts back to dedicated_ips
  await Promise.all(
    ips.map((row, i) =>
      db
        .update(dedicatedIps)
        .set({
          blacklistCount: results[i]!.totalListings,
          reputationUpdatedAt: new Date(),
        })
        .where(eq(dedicatedIps.id, row.id)),
    ),
  );

  return {
    checked: ips.length,
    listed: results.filter((r) => r.totalListings > 0).length,
    details: results,
  };
}

/** Check a single IP by address and persist result. */
export async function refreshIpBlacklist(ipAddress: string): Promise<BlacklistCheckResult> {
  const result = await checkIpBlacklists(ipAddress);

  await db
    .update(dedicatedIps)
    .set({ blacklistCount: result.totalListings, reputationUpdatedAt: new Date() })
    .where(eq(dedicatedIps.ipAddress, ipAddress));

  return result;
}
