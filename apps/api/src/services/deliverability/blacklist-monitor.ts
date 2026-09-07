/**
 * DNS-based IP blocklist monitor.
 *
 * Checks each dedicated IP against the industry-standard DNSBL zones and
 * records how many of them list it, so the pre-send Go/No-Go can refuse a
 * campaign that would go out from a listed address.
 *
 * ─── What an answer means ────────────────────────────────────────────────────
 *
 * This used to be one line — "any resolution means listed" — and that is not
 * how a DNSBL answers. The zones reply in two disjoint ranges:
 *
 *   127.0.0.x        a listing, x saying which dataset
 *   127.255.255.x    the query was refused and nothing was looked up:
 *                      .252  malformed zone name
 *                      .254  asked via a public/open resolver
 *                      .255  past the fair-use query volume
 *
 * The second range is the one that mattered. Spamhaus will not answer the free
 * mirrors for a query arriving through a public resolver — 1.1.1.1 and 8.8.8.8
 * included, which is the default on most hosts — and says so with .254.
 * Counting that as a listing does not produce a near-miss: it reports EVERY
 * address in the account as blacklisted on Spamhaus, and it does so at the
 * exact moment somebody is deciding whether a campaign may go out.
 *
 * So a refused query is its own outcome, and so is a zone that did not answer
 * at all. The old `catch {}` folded NXDOMAIN, SERVFAIL and timeout into one
 * silence, which meant a blocklist that was down reported every IP as clean.
 * A blocklist we could not reach is not a clean IP; it is no answer, and
 * `inconclusive` says so out loud rather than letting a zero stand in for it.
 *
 * ─── Query volume ────────────────────────────────────────────────────────────
 *
 * The free mirrors are fair-use and the fairness is measured per querying IP,
 * so the cadence is not a tuning knob: six zones × the number of dedicated IPs
 * every six hours is what queues/index.ts schedules, and why that queue is
 * 'sparse'. Barracuda additionally requires the querying address to be
 * registered with them before it answers at all — a deployment step, not a
 * code one. Until it is done that zone refuses, and now says so instead of
 * inventing a listing.
 */

import dns from 'node:dns/promises';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { dedicatedIps } from '../../db/schema/index.js';

// ─── DNSBL zones to query ─────────────────────────────────────────────────────

export const DNSBL_ZONES = [
  { name: 'spamhaus_zen', zone: 'zen.spamhaus.org' },
  { name: 'barracuda_brbl', zone: 'b.barracudacentral.org' },
  { name: 'sorbs_dnsbl', zone: 'dnsbl.sorbs.net' },
  { name: 'uceprotect_l1', zone: 'dnsbl-1.uceprotect.net' },
  { name: 'spamcop', zone: 'bl.spamcop.net' },
  { name: 'validity_rp', zone: 'bl.score.senderscore.com' },
] as const;

/**
 * How long one zone gets before we call it unreachable.
 *
 * `dns.resolve4` otherwise inherits c-ares' defaults, which retry; six zones
 * behind one slow resolver then hold the sweep open far longer than anyone
 * watching it expects. Short, single-try, and a miss is reported as a miss
 * rather than waited out.
 */
const ZONE_TIMEOUT_MS = 5_000;

// ─── Answer classification ────────────────────────────────────────────────────

export type DnsblVerdict =
  | { kind: 'listed'; returnCode: string }
  | { kind: 'rejected'; returnCode: string; reason: string }
  | { kind: 'unknown' };

/** Why a 127.255.255.x answer came back, in the words an operator needs. */
const REFUSAL_REASONS: Record<string, string> = {
  '127.255.255.252': 'typing error in the DNSBL zone name',
  '127.255.255.254': 'query made via a public/open resolver',
  '127.255.255.255': 'excessive number of queries',
};

/**
 * Turn the A records a zone returned into a verdict.
 *
 * Anything outside the two documented ranges is `unknown`, not `listed`: a
 * zone that has been repurposed, or a resolver that hijacks NXDOMAIN into an
 * ad server, would otherwise manufacture a blacklisting out of a stranger's
 * DNS. An empty answer is `unknown` for the same reason.
 */
export function classifyDnsblAnswer(addrs: readonly string[]): DnsblVerdict {
  const code = addrs[0];
  if (!code) return { kind: 'unknown' };

  const reason = REFUSAL_REASONS[code];
  if (reason) return { kind: 'rejected', returnCode: code, reason };
  if (code.startsWith('127.255.255.')) {
    return { kind: 'rejected', returnCode: code, reason: 'query refused by the zone' };
  }
  if (code.startsWith('127.0.0.')) return { kind: 'listed', returnCode: code };

  return { kind: 'unknown' };
}

// ─── Checking one address ─────────────────────────────────────────────────────

export interface ZoneNote {
  zone: string;
  name: string;
  detail: string;
}

export interface BlacklistCheckResult {
  ip: string;
  /** Zones that actually list this address. */
  listings: Array<{ zone: string; name: string; returnCode: string }>;
  /** Zones that refused to answer the query (127.255.255.x). */
  rejected: ZoneNote[];
  /** Zones that did not answer at all — timeout, SERVFAIL, resolver error. */
  unreachable: ZoneNote[];
  totalListings: number;
  /**
   * True when at least one zone gave no usable answer. `totalListings` is then
   * a floor rather than a count: something may be listing this address on a
   * zone we could not read. Anything acting on the number has to be able to
   * tell "nothing lists it" from "we could not tell".
   */
  inconclusive: boolean;
  checkedAt: string;
}

/** Seam so the tests can drive the classification without asking the network. */
export interface BlacklistCheckDeps {
  resolve(fqdn: string): Promise<string[]>;
}

/** Single-try, short-timeout resolver. */
function defaultResolve(fqdn: string): Promise<string[]> {
  const resolver = new dns.Resolver({ timeout: ZONE_TIMEOUT_MS, tries: 1 });
  return resolver.resolve4(fqdn);
}

/** NXDOMAIN is an answer — "not listed". Everything else is a failure to ask. */
function isNotListed(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOTFOUND' || code === 'ENODATA';
}

/** Reverse an IPv4 address for DNSBL lookup. Null when it is not IPv4. */
export function reverseIpv4(ip: string): string | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
  }
  return parts.reverse().join('.');
}

/** Check a single IP against all DNSBL zones. */
export async function checkIpBlacklists(
  ip: string,
  deps: BlacklistCheckDeps = { resolve: defaultResolve },
): Promise<BlacklistCheckResult> {
  const reversed = reverseIpv4(ip);
  if (reversed === null) {
    // These zones are IPv4-only in this form. Splitting an IPv6 literal on '.'
    // builds a name that is not the address being asked about, so any answer
    // to it would be about something else entirely. Refuse rather than ask.
    return {
      ip,
      listings: [],
      rejected: [],
      unreachable: DNSBL_ZONES.map((z) => ({
        zone: z.zone,
        name: z.name,
        detail: 'not an IPv4 address; these zones cannot be queried for it',
      })),
      totalListings: 0,
      inconclusive: true,
      checkedAt: new Date().toISOString(),
    };
  }

  const listings: BlacklistCheckResult['listings'] = [];
  const rejected: ZoneNote[] = [];
  const unreachable: ZoneNote[] = [];

  await Promise.all(
    DNSBL_ZONES.map(async ({ name, zone }) => {
      const fqdn = `${reversed}.${zone}`;
      let addrs: string[];
      try {
        addrs = await deps.resolve(fqdn);
      } catch (err) {
        if (isNotListed(err)) return; // the zone said no
        unreachable.push({
          zone,
          name,
          detail: (err as NodeJS.ErrnoException).code ?? (err as Error).message,
        });
        return;
      }

      const verdict = classifyDnsblAnswer(addrs);
      if (verdict.kind === 'listed') {
        listings.push({ zone, name, returnCode: verdict.returnCode });
      } else if (verdict.kind === 'rejected') {
        rejected.push({ zone, name, detail: `${verdict.returnCode} — ${verdict.reason}` });
      } else {
        unreachable.push({ zone, name, detail: `unrecognised answer ${addrs.join(',')}` });
      }
    }),
  );

  return {
    ip,
    listings,
    rejected,
    unreachable,
    totalListings: listings.length,
    inconclusive: rejected.length > 0 || unreachable.length > 0,
    checkedAt: new Date().toISOString(),
  };
}

// ─── Sweeps ───────────────────────────────────────────────────────────────────

export interface BlacklistSweepSummary {
  checked: number;
  listed: number;
  /** Addresses whose answer was incomplete — see BlacklistCheckResult.inconclusive. */
  inconclusive: number;
  details: BlacklistCheckResult[];
}

/** Refresh blacklist_count for all active dedicated IPs. */
export async function refreshAllIpBlacklists(
  deps?: BlacklistCheckDeps,
): Promise<BlacklistSweepSummary> {
  const ips = await db
    .select({ id: dedicatedIps.id, ipAddress: dedicatedIps.ipAddress })
    .from(dedicatedIps)
    .where(sql`${dedicatedIps.status} IN ('active', 'warming')`);

  const results = await Promise.all(ips.map((row) => checkIpBlacklists(row.ipAddress, deps)));

  // Persist counts back to dedicated_ips.
  //
  // blacklistCount only. This used to stamp reputationUpdatedAt as well, which
  // made "we counted DNSBL listings" indistinguishable from "we computed a
  // reputation score" — and nothing computes the latter, so the timestamp was
  // the one thing suggesting the 0.00 score meant something.
  //
  // A sweep that came back with no listings AND no usable answer writes
  // nothing: pre-send reads this number to decide whether a campaign may go
  // out, and a zone we could not read must not be recorded as a clean bill of
  // health. A real listing is always written, including when other zones were
  // unreadable — that direction is safe.
  await Promise.all(
    ips.map((row, i) => {
      const r = results[i]!;
      if (r.inconclusive && r.totalListings === 0) return Promise.resolve();
      return db
        .update(dedicatedIps)
        .set({ blacklistCount: r.totalListings })
        .where(eq(dedicatedIps.id, row.id));
    }),
  );

  return {
    checked: ips.length,
    listed: results.filter((r) => r.totalListings > 0).length,
    inconclusive: results.filter((r) => r.inconclusive).length,
    details: results,
  };
}

/** Check a single IP by address and persist result. */
export async function refreshIpBlacklist(
  ipAddress: string,
  deps?: BlacklistCheckDeps,
): Promise<BlacklistCheckResult> {
  const result = await checkIpBlacklists(ipAddress, deps);

  if (!(result.inconclusive && result.totalListings === 0)) {
    await db
      .update(dedicatedIps)
      .set({ blacklistCount: result.totalListings, reputationUpdatedAt: new Date() })
      .where(eq(dedicatedIps.ipAddress, ipAddress));
  }

  return result;
}
