/**
 * The STO refresh produces predictions, and a time-warp send uses them.
 *
 * #116 made time-warp reachable and STO rode in with it: computeTimewarpSchedule
 * prefers a contact's own predicted hour over the campaign's local hour when a
 * prediction exists with confidence >= 0.3. Nothing wrote those predictions —
 * `computeContactSendTime` had only on-demand HTTP callers — so the table
 * stayed empty and the branch never ran. This is the cron that fills it.
 *
 * The assertions go all the way: the refresh runs, rows appear in
 * contact_send_time_predictions, and the SAME contact then gets a different
 * send time out of computeTimewarpSchedule than the cohort's local hour. Not
 * "the function was called" — the value has to change what the send path
 * decides.
 *
 * WHAT THESE TESTS CANNOT SEE
 *  - They call refreshStalePredictions() directly rather than through BullMQ.
 *    That the daily-triggers worker reaches
 *    /api/v1/internal/send-optimization/refresh-predictions is a property of
 *    @forgemsg/workers, which this package cannot import.
 *  - They do not measure the cap. STO_REFRESH_LIMIT is asserted as a number
 *    the code agrees with, not by making 10 000 contacts.
 *  - They say nothing about prediction QUALITY. Whether an hour derived from
 *    an open history is a good hour is sto-pure.ts's business and is unit
 *    tested there; here it only has to be USED.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { campaigns, contacts, organizations, emailEvents } from '../db/schema/index.js';
import {
  refreshStalePredictions,
  orgsUsingTimewarp,
  STO_REFRESH_LIMIT,
} from '../services/send-optimization/refresh-predictions.js';
import { computeTimewarpSchedule } from '../services/send-optimization/index.js';

/** The hour, in UTC, this contact's opens all land on. */
const OPEN_HOUR_UTC = 6;
/** The cohort hour a campaign would use for everyone without a prediction. */
const COHORT_LOCAL_HOUR = 15;

describe('STO prediction refresh (real DB)', () => {
  let orgId: string;
  const madeContacts: string[] = [];
  const madeCampaigns: string[] = [];

  async function makeContact(opens: number): Promise<string> {
    const [c] = await db
      .insert(contacts)
      .values({
        orgId,
        email: `sto-refresh-${randomUUID().slice(0, 8)}@test.local`,
        status: 'active',
      })
      .returning({ id: contacts.id });
    madeContacts.push(c!.id);

    if (opens > 0) {
      // All at one hour, so the fitted best hour is unambiguous. Enough of them
      // that the empirical-Bayes shrinkage in sto-pure.ts still clears 0.3 —
      // four opens does not, measured.
      await db.insert(emailEvents).values(
        Array.from({ length: opens }, () => ({
          orgId,
          contactId: c!.id,
          eventType: 'open' as const,
          createdAt: new Date(Date.UTC(2026, 7, 20, OPEN_HOUR_UTC, 0, 0)),
        })),
      );
    }
    return c!.id;
  }

  /** A campaign with time-warp on, which is what makes the org eligible. */
  async function makeTimewarpCampaign(enabled: boolean): Promise<string> {
    const [c] = await db
      .insert(campaigns)
      .values({
        orgId,
        name: `sto ${randomUUID().slice(0, 8)}`,
        type: 'email',
        status: 'draft',
        timewarp: { enabled, localHour: COHORT_LOCAL_HOUR },
      })
      .returning({ id: campaigns.id });
    madeCampaigns.push(c!.id);
    return c!.id;
  }

  async function predictionFor(contactId: string) {
    const rows = (await db.execute<{ b: number; c: number; s: number }>(sql`
      SELECT best_hour_utc::int AS b, confidence::float AS c, sample_size::int AS s
      FROM contact_send_time_predictions WHERE contact_id = ${contactId}
    `)) as unknown as Array<{ b: number; c: number; s: number }>;
    return rows[0] ?? null;
  }

  beforeAll(async () => {
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, 'acme-demo'));
    if (!org) throw new Error('seed org acme-demo missing — run `pnpm seed`');
    orgId = org.id;
  }, 60_000);

  beforeEach(async () => {
    // Every test decides for itself whether the org is eligible, so no campaign
    // may survive from the last one.
    if (madeCampaigns.length > 0) {
      await db.delete(campaigns).where(inArray(campaigns.id, madeCampaigns));
      madeCampaigns.length = 0;
    }
    if (madeContacts.length > 0) {
      await db.execute(
        sql`DELETE FROM contact_send_time_predictions WHERE contact_id = ANY(${sql.param(madeContacts)})`,
      );
      await db.delete(emailEvents).where(inArray(emailEvents.contactId, madeContacts));
      await db.delete(contacts).where(inArray(contacts.id, madeContacts));
      madeContacts.length = 0;
    }
  }, 60_000);

  afterAll(async () => {
    if (madeCampaigns.length > 0) {
      await db.delete(campaigns).where(inArray(campaigns.id, madeCampaigns));
    }
    if (madeContacts.length > 0) {
      await db.execute(
        sql`DELETE FROM contact_send_time_predictions WHERE contact_id = ANY(${sql.param(madeContacts)})`,
      );
      await db.delete(emailEvents).where(inArray(emailEvents.contactId, madeContacts));
      await db.delete(contacts).where(inArray(contacts.id, madeContacts));
    }
  }, 60_000);

  it('an org with no time-warp campaign is not touched', async () => {
    // The scoping decision, asserted: predictions are read on the send path
    // only inside computeTimewarpSchedule, so an org that never time-warps
    // would be paying for rows nothing reads.
    const contactId = await makeContact(40);
    await makeTimewarpCampaign(false);

    const out = await refreshStalePredictions();
    expect((await orgsUsingTimewarp()).includes(orgId)).toBe(false);
    expect(await predictionFor(contactId)).toBeNull();
    expect(out.orgs).toBe(0);
  });

  it('one campaign with time-warp on makes the org eligible', async () => {
    await makeTimewarpCampaign(true);
    expect(await orgsUsingTimewarp()).toContain(orgId);
  });

  it('the refresh writes a prediction where there was none', async () => {
    const contactId = await makeContact(40);
    await makeTimewarpCampaign(true);

    expect(await predictionFor(contactId), 'a prediction existed before the run').toBeNull();
    const out = await refreshStalePredictions();

    const pred = await predictionFor(contactId);
    expect(pred, 'the run wrote no prediction').not.toBeNull();
    expect(pred!.b).toBe(OPEN_HOUR_UTC);
    expect(out.refreshed).toBeGreaterThan(0);
    expect(out.failed).toBe(0);
  });

  it('and the send path then schedules that contact at their own hour', async () => {
    // The assertion the whole change exists for. Without a prediction every
    // contact gets the cohort's local hour; with one, this contact does not.
    const contactId = await makeContact(40);
    await makeTimewarpCampaign(true);

    const base = new Date(Date.UTC(2026, 8, 1, 3, 0, 0));
    const before = await computeTimewarpSchedule(
      [contactId],
      base,
      COHORT_LOCAL_HOUR,
      'Europe/Prague',
      { orgId },
    );
    const cohortHour = before.get(contactId)!.getUTCHours();

    await refreshStalePredictions();

    const after = await computeTimewarpSchedule(
      [contactId],
      base,
      COHORT_LOCAL_HOUR,
      'Europe/Prague',
      { orgId },
    );
    expect(after.get(contactId)!.getUTCHours()).toBe(OPEN_HOUR_UTC);
    expect(after.get(contactId)!.getUTCHours()).not.toBe(cohortHour);
  });

  it('a contact with no opens gets a low-confidence prediction the send path ignores', async () => {
    // Nobody is skipped and nothing throws — the contact simply keeps the
    // cohort hour, which is the documented fallback.
    const contactId = await makeContact(0);
    await makeTimewarpCampaign(true);

    await refreshStalePredictions();

    const pred = await predictionFor(contactId);
    expect(pred, 'no prediction row was written').not.toBeNull();
    expect(pred!.c).toBeLessThan(0.3);

    const base = new Date(Date.UTC(2026, 8, 1, 3, 0, 0));
    const sched = await computeTimewarpSchedule(
      [contactId],
      base,
      COHORT_LOCAL_HOUR,
      'Europe/Prague',
      { orgId },
    );
    // 15:00 Europe/Prague in September is 13:00 UTC.
    expect(sched.get(contactId)!.getUTCHours()).toBe(13);
  });

  it('running it twice changes nothing the second time', async () => {
    const contactId = await makeContact(40);
    await makeTimewarpCampaign(true);

    await refreshStalePredictions();
    const first = await predictionFor(contactId);
    await refreshStalePredictions();
    const second = await predictionFor(contactId);

    expect(second!.b).toBe(first!.b);
    expect(second!.s).toBe(first!.s);
  });

  it('the limit is a number the code agrees with', async () => {
    // Guards against the cap being edited to 0 or NaN, which would make the
    // job a no-op that still reports success.
    expect(STO_REFRESH_LIMIT).toBeGreaterThan(0);
    expect(Number.isInteger(STO_REFRESH_LIMIT)).toBe(true);
  });

  it('honours a smaller limit, so a run cannot be unbounded', async () => {
    await makeContact(40);
    await makeContact(40);
    await makeContact(40);
    await makeTimewarpCampaign(true);

    const out = await refreshStalePredictions(2);
    expect(out.refreshed).toBeLessThanOrEqual(2);
  });
});
