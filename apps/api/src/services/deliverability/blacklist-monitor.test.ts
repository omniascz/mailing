/**
 * What a DNSBL answer actually means.
 *
 * The check treated any A record as a listing — "Any resolution means listed"
 * — and swallowed every lookup error into the same silence as NXDOMAIN. Both
 * halves are wrong, and they fail in opposite directions:
 *
 *   127.255.255.254 and .255 are not listings. Spamhaus returns them to say
 *   the query itself was refused: .254 for a query arriving via a public or
 *   open resolver, .255 for one past the fair-use volume. A deployment that
 *   resolves through 1.1.1.1 or 8.8.8.8 — which is the default on most hosts —
 *   gets .254 for every address it asks about, so every IP in the account
 *   reads as listed on Spamhaus. That is not a near-miss; it is the answer
 *   inverted, and it arrives at exactly the moment an operator would be told.
 *
 *   A timeout or SERVFAIL is not a clean IP. The old `catch {}` made "the
 *   zone did not answer" indistinguishable from "the zone said no", so a
 *   blocklist that was down reported everything as fine.
 *
 * Both are asserted here rather than through the network, because a test whose
 * verdict depends on what Spamhaus says about 198.51.100.1 today is a test
 * that fails on a Tuesday for reasons no one can reproduce.
 */
import { describe, it, expect } from 'vitest';
import { classifyDnsblAnswer, checkIpBlacklists, DNSBL_ZONES } from './blacklist-monitor.js';

describe('classifyDnsblAnswer', () => {
  it('reads the 127.0.0.x codes as listings', () => {
    for (const code of ['127.0.0.2', '127.0.0.3', '127.0.0.4', '127.0.0.10', '127.0.0.11']) {
      expect(classifyDnsblAnswer([code]), code).toEqual({ kind: 'listed', returnCode: code });
    }
  });

  it('reads 127.255.255.254 as a refused query, not a listing', () => {
    expect(classifyDnsblAnswer(['127.255.255.254'])).toEqual({
      kind: 'rejected',
      returnCode: '127.255.255.254',
      reason: 'query made via a public/open resolver',
    });
  });

  it('reads 127.255.255.255 as a refused query, not a listing', () => {
    expect(classifyDnsblAnswer(['127.255.255.255'])).toEqual({
      kind: 'rejected',
      returnCode: '127.255.255.255',
      reason: 'excessive number of queries',
    });
  });

  it('reads 127.255.255.252 as a refused query, not a listing', () => {
    expect(classifyDnsblAnswer(['127.255.255.252']).kind).toBe('rejected');
  });

  it('treats an answer outside both ranges as inconclusive rather than as a listing', () => {
    // A zone that starts wildcarding, or one that has been repurposed, answers
    // with something we have no meaning for. Counting it would manufacture a
    // listing out of a stranger's DNS.
    expect(classifyDnsblAnswer(['10.0.0.1']).kind).toBe('unknown');
  });

  it('treats an empty answer as inconclusive', () => {
    expect(classifyDnsblAnswer([]).kind).toBe('unknown');
  });
});

/** A resolver stub: zone suffix → what the lookup does. */
function resolverFor(answers: Record<string, string[] | Error>) {
  return async (fqdn: string): Promise<string[]> => {
    for (const [suffix, answer] of Object.entries(answers)) {
      if (fqdn.endsWith(suffix)) {
        if (answer instanceof Error) throw answer;
        return answer;
      }
    }
    const nx = new Error('queryA ENOTFOUND') as NodeJS.ErrnoException;
    nx.code = 'ENOTFOUND';
    throw nx;
  };
}

const nxdomain = () => {
  const e = new Error('queryA ENOTFOUND') as NodeJS.ErrnoException;
  e.code = 'ENOTFOUND';
  return e;
};

const timeout = () => {
  const e = new Error('queryA ETIMEOUT') as NodeJS.ErrnoException;
  e.code = 'ETIMEOUT';
  return e;
};

describe('checkIpBlacklists', () => {
  it('NEGATIVE CONTROL: an address no zone lists is not reported', async () => {
    const res = await checkIpBlacklists('198.51.100.7', {
      resolve: resolverFor({}), // every zone NXDOMAINs
    });
    expect(res.totalListings).toBe(0);
    expect(res.listings).toEqual([]);
    expect(res.rejected).toEqual([]);
    expect(res.unreachable).toEqual([]);
    expect(res.inconclusive).toBe(false);
  });

  it('a real listing is reported, and only on the zone that gave it', async () => {
    const res = await checkIpBlacklists('198.51.100.8', {
      resolve: resolverFor({ 'zen.spamhaus.org': ['127.0.0.4'] }),
    });
    expect(res.totalListings).toBe(1);
    expect(res.listings.map((l) => l.name)).toEqual(['spamhaus_zen']);
    expect(res.listings[0]!.returnCode).toBe('127.0.0.4');
  });

  it('a refused query is NOT counted as a listing', async () => {
    const res = await checkIpBlacklists('198.51.100.9', {
      resolve: resolverFor({ 'zen.spamhaus.org': ['127.255.255.254'] }),
    });
    expect(res.totalListings, 'a blocked query was counted as a blacklisting').toBe(0);
    expect(res.rejected.map((r) => r.name)).toEqual(['spamhaus_zen']);
    expect(res.inconclusive, 'a refused query leaves the answer inconclusive').toBe(true);
  });

  it('a zone that does not answer is inconclusive, not clean', async () => {
    const res = await checkIpBlacklists('198.51.100.10', {
      resolve: resolverFor({ 'bl.spamcop.net': timeout() }),
    });
    expect(res.totalListings).toBe(0);
    expect(res.unreachable.map((u) => u.name)).toEqual(['spamcop']);
    expect(res.inconclusive, 'a blocklist that did not answer was reported as a clean result').toBe(
      true,
    );
  });

  it('NXDOMAIN is a clean answer and leaves the result conclusive', async () => {
    const res = await checkIpBlacklists('198.51.100.11', {
      resolve: resolverFor({ 'zen.spamhaus.org': nxdomain() }),
    });
    expect(res.inconclusive).toBe(false);
    expect(res.unreachable).toEqual([]);
  });

  it('asks every configured zone exactly once, with the address reversed', async () => {
    const asked: string[] = [];
    await checkIpBlacklists('192.0.2.13', {
      resolve: async (fqdn) => {
        asked.push(fqdn);
        throw nxdomain();
      },
    });
    expect(asked).toHaveLength(DNSBL_ZONES.length);
    for (const z of DNSBL_ZONES) {
      expect(asked, z.zone).toContain(`13.2.0.192.${z.zone}`);
    }
  });

  it('refuses an address it cannot reverse rather than asking a malformed name', async () => {
    const asked: string[] = [];
    const res = await checkIpBlacklists('2001:db8::1', {
      resolve: async (fqdn) => {
        asked.push(fqdn);
        throw nxdomain();
      },
    });
    // IPv4 reversal on an IPv6 literal produces a name that is not the address
    // being asked about; any answer to it would be about something else.
    expect(asked, 'a malformed name was sent to the zones').toEqual([]);
    expect(res.inconclusive).toBe(true);
    expect(res.totalListings).toBe(0);
  });
});
