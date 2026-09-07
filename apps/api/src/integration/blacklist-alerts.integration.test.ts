/**
 * A blocklist listing leaves the process, once.
 *
 * The sweep has run on a six-hourly cron since it was written and told nobody
 * anything: it set `dedicated_ips.blacklist_count` and logged a line in a
 * worker. On a shared pool a listing is the most expensive thing you can be
 * unaware of — every tenant on the pool pays for it while it stands.
 *
 * Everything here runs against the real table in forgemsg_itest2. The DNS side
 * is injected, because a test whose verdict depends on what Spamhaus says about
 * 198.51.100.1 today is a test that fails on a Tuesday for reasons nobody can
 * reproduce. The SEND side is injected too, and that seam is doing real work
 * rather than avoiding SMTP: the whole point of two of these cases is what
 * happens when the send throws.
 *
 * The negative control is not decoration. "Alert on everything" satisfies every
 * assertion about a listing being reported, so the same code is run twice with
 * a resolver that answers the opposite way, and the clean run must produce no
 * mail and no row.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createTestApp } from './setup/harness.js';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { organizations, dedicatedIps, ipBlacklistEvents } from '../db/schema/index.js';
import {
  refreshAllIpBlacklists,
  type BlacklistCheckDeps,
} from '../services/deliverability/blacklist-monitor.js';
import { recordAndAlert, type AlertDeps } from '../services/deliverability/blacklist-alerts.js';

const SUFFIX = randomUUID().slice(0, 8);
const IP_DIRTY = '198.51.100.41';
const IP_CLEAN = '198.51.100.42';
const ALL = [IP_DIRTY, IP_CLEAN];

let orgId: string;
let app: FastifyInstance;

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

/** Spamhaus lists everything it is asked about; the rest say no. */
const listing: BlacklistCheckDeps = {
  resolve: async (fqdn) => {
    if (fqdn.endsWith('zen.spamhaus.org')) return ['127.0.0.4'];
    throw nxdomain();
  },
};

/** THE INVERSE. Same code, opposite answer: nothing lists anything. */
const clean: BlacklistCheckDeps = {
  resolve: async () => {
    throw nxdomain();
  },
};

/** Spamhaus does not answer at all; the rest say no. */
const unreadable: BlacklistCheckDeps = {
  resolve: async (fqdn) => {
    if (fqdn.endsWith('zen.spamhaus.org')) throw timeout();
    throw nxdomain();
  },
};

interface SentMail {
  to: string;
  from: string;
  subject: string;
  text: string;
}

function recorder(): AlertDeps & { sent: SentMail[] } {
  const sent: SentMail[] = [];
  return {
    sent,
    async send(input) {
      sent.push({ to: input.to, from: input.from, subject: input.subject, text: input.text });
      return 'message-id';
    },
  };
}

const failing: AlertDeps = {
  async send() {
    throw new Error('smtp: connection refused');
  },
};

const openRows = async (ip: string) =>
  db
    .select()
    .from(ipBlacklistEvents)
    .where(sql`${ipBlacklistEvents.ipAddress} = ${ip} AND cleared_at IS NULL`);

async function wipe() {
  await db.delete(ipBlacklistEvents).where(inArray(ipBlacklistEvents.ipAddress, ALL));
  await db.delete(dedicatedIps).where(inArray(dedicatedIps.ipAddress, ALL));
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  await wipe();
  const [org] = await db
    .insert(organizations)
    .values({ name: `bl alert ${SUFFIX}`, slug: `bl-alert-${SUFFIX}` })
    .returning({ id: organizations.id });
  orgId = org!.id;
}, 60_000);

afterAll(async () => {
  await wipe();
  if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
  await app?.close();
});

beforeEach(async () => {
  await db.delete(ipBlacklistEvents).where(inArray(ipBlacklistEvents.ipAddress, ALL));
  await db.delete(dedicatedIps).where(inArray(dedicatedIps.ipAddress, ALL));
});

describe('a listing is announced', () => {
  it('END TO END: a swept address that is listed produces a row and one mail', async () => {
    await db.insert(dedicatedIps).values({ ipAddress: IP_DIRTY, orgId, status: 'active' });

    const sweep = await refreshAllIpBlacklists(listing);
    expect(sweep.listed, 'the sweep did not see the listing').toBeGreaterThanOrEqual(1);

    const mail = recorder();
    const summary = await recordAndAlert(sweep.details, mail);

    expect(summary.opened).toBeGreaterThanOrEqual(1);
    expect(summary.notified).toBeGreaterThanOrEqual(1);
    expect(summary.sendFailed).toBe(false);

    expect(mail.sent, 'no alert was sent for a real listing').toHaveLength(1);
    expect(mail.sent[0]!.text).toContain(IP_DIRTY);
    expect(mail.sent[0]!.text).toContain('zen.spamhaus.org');
    // Recipient and sender are the same system address by decision: there is no
    // operator column to route to, and mailing the org's users would tell
    // everyone in the account about an infrastructure fault they cannot act on.
    expect(mail.sent[0]!.to).toBe(mail.sent[0]!.from);

    const rows = await openRows(IP_DIRTY);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.zone).toBe('zen.spamhaus.org');
    expect(
      rows[0]!.notifiedAt,
      'notified_at was not stamped after a successful send',
    ).not.toBeNull();
  });

  it('NEGATIVE CONTROL: the same code with the opposite answer reports nothing', async () => {
    await db.insert(dedicatedIps).values({ ipAddress: IP_CLEAN, orgId, status: 'active' });

    const sweep = await refreshAllIpBlacklists(clean);
    expect(sweep.listed).toBe(0);
    expect(sweep.inconclusive, 'NXDOMAIN everywhere is a conclusive answer').toBe(0);

    const mail = recorder();
    const summary = await recordAndAlert(sweep.details, mail);

    expect(mail.sent, 'a clean address was reported').toHaveLength(0);
    expect(summary.opened).toBe(0);
    expect(summary.notified).toBe(0);
    expect(await openRows(IP_CLEAN), 'a clean address opened a finding').toHaveLength(0);
  });
});

describe('it is announced once', () => {
  it('two sweeps over the same standing listing send one mail, not two', async () => {
    await db.insert(dedicatedIps).values({ ipAddress: IP_DIRTY, orgId, status: 'active' });

    const first = recorder();
    await recordAndAlert((await refreshAllIpBlacklists(listing)).details, first);
    expect(first.sent).toHaveLength(1);

    const second = recorder();
    const summary = await recordAndAlert((await refreshAllIpBlacklists(listing)).details, second);

    expect(second.sent, 'the same standing listing was announced twice').toHaveLength(0);
    expect(summary.opened, 'a standing listing opened a second row').toBe(0);
    expect(summary.notified).toBe(0);
    expect(await openRows(IP_DIRTY)).toHaveLength(1);
  });

  it('a failed send does NOT stamp notified_at, so the next sweep tries again', async () => {
    await db.insert(dedicatedIps).values({ ipAddress: IP_DIRTY, orgId, status: 'active' });

    const summary = await recordAndAlert((await refreshAllIpBlacklists(listing)).details, failing);
    expect(summary.sendFailed).toBe(true);
    expect(summary.notified).toBe(0);

    const afterFailure = await openRows(IP_DIRTY);
    expect(afterFailure).toHaveLength(1);
    expect(
      afterFailure[0]!.notifiedAt,
      'a finding was marked announced although the send threw — the listing would never be reported',
    ).toBeNull();

    // The point of leaving it null: the next run owes the same alert.
    const retry = recorder();
    const second = await recordAndAlert((await refreshAllIpBlacklists(listing)).details, retry);
    expect(retry.sent, 'the retry did not send the alert that was owed').toHaveLength(1);
    expect(second.notified).toBe(1);
    expect((await openRows(IP_DIRTY))[0]!.notifiedAt).not.toBeNull();
  });
});

describe('a zone we could not read changes nothing', () => {
  it('an unreadable zone leaves a standing finding open and sends nothing new', async () => {
    await db.insert(dedicatedIps).values({ ipAddress: IP_DIRTY, orgId, status: 'active' });

    // Establish and announce a listing.
    const first = recorder();
    await recordAndAlert((await refreshAllIpBlacklists(listing)).details, first);
    expect(first.sent).toHaveLength(1);
    const before = await openRows(IP_DIRTY);
    expect(before).toHaveLength(1);

    // Now Spamhaus stops answering. That is not a delisting.
    const mail = recorder();
    const summary = await recordAndAlert((await refreshAllIpBlacklists(unreadable)).details, mail);

    expect(summary.cleared, 'an unanswered zone was treated as a delisting').toBe(0);
    expect(mail.sent).toHaveLength(0);
    const after = await openRows(IP_DIRTY);
    expect(after, 'the standing finding was closed by an outage').toHaveLength(1);
    expect(after[0]!.id).toBe(before[0]!.id);
  });

  it('a sweep that read nothing at all is skipped rather than acted on', async () => {
    await db.insert(dedicatedIps).values({ ipAddress: IP_CLEAN, orgId, status: 'active' });

    const allRefused: BlacklistCheckDeps = { resolve: async () => ['127.255.255.254'] };
    const sweep = await refreshAllIpBlacklists(allRefused);
    expect(sweep.inconclusive).toBeGreaterThanOrEqual(1);

    const mail = recorder();
    const summary = await recordAndAlert(sweep.details, mail);

    expect(summary.skippedInconclusive).toBeGreaterThanOrEqual(1);
    expect(summary.opened).toBe(0);
    expect(mail.sent).toHaveLength(0);
  });

  it('a zone that DID read a delisting closes the finding', async () => {
    await db.insert(dedicatedIps).values({ ipAddress: IP_DIRTY, orgId, status: 'active' });

    await recordAndAlert((await refreshAllIpBlacklists(listing)).details, recorder());
    expect(await openRows(IP_DIRTY)).toHaveLength(1);

    // Every zone answers, and none of them lists it any more.
    const summary = await recordAndAlert((await refreshAllIpBlacklists(clean)).details, recorder());
    expect(summary.cleared, 'a confirmed delisting did not close the finding').toBe(1);
    expect(await openRows(IP_DIRTY)).toHaveLength(0);
  });
});

describe('an account with nothing to check', () => {
  it('says nothing at all', async () => {
    // No dedicated IPs for this org. An empty sweep means "nothing has been
    // sent from a dedicated address", not "we have no data".
    const mail = recorder();
    const summary = await recordAndAlert([], mail);
    expect(mail.sent).toHaveLength(0);
    expect(summary).toMatchObject({ opened: 0, cleared: 0, notified: 0, sendFailed: false });
  });
});

describe('the cron path reaches the alert', () => {
  /**
   * The worker's six-hourly job does exactly one thing: POST this route. So the
   * question "does a finding leave the process on the schedule" is the question
   * "does this route reach recordAndAlert", and the answer has to come from the
   * route rather than from a grep for the import.
   *
   * Asserted on an account with no dedicated addresses, so the sweep touches no
   * DNS and the result is the same on every machine. The `alerts` field exists
   * only if the alert step ran; unwire it and the field is gone.
   */
  it('POST /internal/blacklist-check returns the alert summary, so the step ran', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/blacklist-check',
      headers: { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' },
    });

    expect(res.statusCode, res.body).toBe(200);
    const data = res.json().data as { alerts?: unknown; checked: number };
    expect(
      data.alerts,
      'the sweep route did not reach the alert step — a finding would stop at the log line again',
    ).toBeDefined();
    expect(data.alerts).toMatchObject({ opened: 0, notified: 0, sendFailed: false });
  });
});
