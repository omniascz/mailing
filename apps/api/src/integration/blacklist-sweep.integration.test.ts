/**
 * What the sweep is allowed to write to dedicated_ips.blacklist_count.
 *
 * That column is read by exactly one thing that matters: `classifyBlacklist`
 * in the pre-send Go/No-Go, which decides whether a campaign may go out. So
 * the sweep writing a zero has the same effect as a clean bill of health, and
 * it must only do that when the zones actually said so.
 *
 * Two directions, both asserted here against the real table:
 *
 *   a sweep that read nothing must not lower a count that is already there —
 *   otherwise a Spamhaus outage silently clears a listing an operator has not
 *   fixed, and the next campaign goes out from the listed address.
 *
 *   a sweep that DID read a listing must write it even when other zones were
 *   unreadable — that direction only ever adds caution.
 *
 * The resolver is injected rather than reached over the network. A test whose
 * verdict depends on what Spamhaus says about 198.51.100.1 today is a test
 * that fails on a Tuesday for reasons nobody can reproduce.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { organizations, dedicatedIps } from '../db/schema/index.js';
import {
  refreshAllIpBlacklists,
  refreshIpBlacklist,
  type BlacklistCheckDeps,
} from '../services/deliverability/blacklist-monitor.js';

const SUFFIX = randomUUID().slice(0, 8);
const IP_CLEAN = '198.51.100.31';
const IP_LISTED = '198.51.100.32';
const ALL = [IP_CLEAN, IP_LISTED];

let orgId: string;

const nxdomain = () => {
  const e = new Error('queryA ENOTFOUND') as NodeJS.ErrnoException;
  e.code = 'ENOTFOUND';
  return e;
};

/** Every zone says "not listed". */
const allClean: BlacklistCheckDeps = {
  resolve: async () => {
    throw nxdomain();
  },
};

/** Every zone refuses the query the way Spamhaus does behind a public resolver. */
const allRefused: BlacklistCheckDeps = {
  resolve: async () => ['127.255.255.254'],
};

/** Spamhaus lists it; the rest refuse. */
const listedButPartial: BlacklistCheckDeps = {
  resolve: async (fqdn) =>
    fqdn.endsWith('zen.spamhaus.org') ? ['127.0.0.4'] : ['127.255.255.254'],
};

const countOf = async (ip: string) =>
  (await db.select().from(dedicatedIps).where(eq(dedicatedIps.ipAddress, ip)))[0]?.blacklistCount;

async function cleanup() {
  await db.delete(dedicatedIps).where(inArray(dedicatedIps.ipAddress, ALL));
  if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
}

beforeAll(async () => {
  await db.delete(dedicatedIps).where(inArray(dedicatedIps.ipAddress, ALL));
  const [org] = await db
    .insert(organizations)
    .values({ name: `blsweep ${SUFFIX}`, slug: `blsweep-${SUFFIX}` })
    .returning({ id: organizations.id });
  orgId = org!.id;
}, 60_000);

afterAll(cleanup);

describe('the sweep over dedicated_ips', () => {
  it('NEGATIVE CONTROL: an address no zone lists is not recorded as listed', async () => {
    await db.delete(dedicatedIps).where(inArray(dedicatedIps.ipAddress, ALL));
    await db
      .insert(dedicatedIps)
      .values({ ipAddress: IP_CLEAN, orgId, status: 'active', blacklistCount: 0 });

    const summary = await refreshAllIpBlacklists(allClean);

    expect(summary.checked).toBeGreaterThanOrEqual(1);
    expect(summary.listed, 'a clean address was reported as listed').toBe(0);
    expect(summary.inconclusive, 'NXDOMAIN from every zone is a conclusive answer').toBe(0);
    expect(await countOf(IP_CLEAN)).toBe(0);
  });

  it('a real listing is written', async () => {
    await db.delete(dedicatedIps).where(inArray(dedicatedIps.ipAddress, ALL));
    await db
      .insert(dedicatedIps)
      .values({ ipAddress: IP_LISTED, orgId, status: 'active', blacklistCount: 0 });

    await refreshAllIpBlacklists(listedButPartial);

    expect(
      await countOf(IP_LISTED),
      'a listing found on one zone was dropped because other zones were unreadable',
    ).toBe(1);
  });

  it('a sweep that could read nothing does not clear a listing that is already recorded', async () => {
    await db.delete(dedicatedIps).where(inArray(dedicatedIps.ipAddress, ALL));
    await db
      .insert(dedicatedIps)
      .values({ ipAddress: IP_LISTED, orgId, status: 'active', blacklistCount: 3 });

    const summary = await refreshAllIpBlacklists(allRefused);

    expect(summary.listed).toBe(0);
    expect(summary.inconclusive, 'every zone refused and the sweep called it conclusive').toBe(1);
    expect(
      await countOf(IP_LISTED),
      'an unreadable sweep overwrote a recorded listing with a clean zero',
    ).toBe(3);
  });

  it('the single-IP refresh follows the same rule', async () => {
    await db.delete(dedicatedIps).where(inArray(dedicatedIps.ipAddress, ALL));
    await db
      .insert(dedicatedIps)
      .values({ ipAddress: IP_LISTED, orgId, status: 'active', blacklistCount: 2 });

    const result = await refreshIpBlacklist(IP_LISTED, allRefused);

    expect(result.totalListings).toBe(0);
    expect(result.inconclusive).toBe(true);
    expect(await countOf(IP_LISTED)).toBe(2);
  });

  it('a clean re-check DOES clear a stale count, because that answer was read', async () => {
    await db.delete(dedicatedIps).where(inArray(dedicatedIps.ipAddress, ALL));
    await db
      .insert(dedicatedIps)
      .values({ ipAddress: IP_CLEAN, orgId, status: 'active', blacklistCount: 4 });

    await refreshIpBlacklist(IP_CLEAN, allClean);

    expect(
      await countOf(IP_CLEAN),
      'a delisting that every zone confirmed was not written back',
    ).toBe(0);
  });
});
