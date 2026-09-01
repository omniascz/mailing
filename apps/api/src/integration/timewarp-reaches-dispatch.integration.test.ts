/**
 * Time-warp survives the trip from the route to the splitter job.
 *
 * Everything downstream of that job already worked and nobody could use it:
 * campaign-splitter forwards `timewarp` to every batch job, batch-sender turns
 * it into a per-contact BullMQ `delay` (batch-sender.ts:483), and the API has
 * both an internal and an authenticated scheduler. The break was a single
 * missing line in enqueueCampaignSend — the seventh time in this repo that a
 * built feature had no path to it.
 *
 * These drive the real HTTP layer into real Postgres and then read what
 * enqueueCampaignSend actually put on the queue, because the value being lost
 * WAS a property of the enqueued job, not of the database.
 *
 * WHAT THESE TESTS CANNOT SEE
 *  - They stop at the splitter job. That campaign-splitter forwards the field
 *    to batch jobs and that batch-sender turns it into a delay are properties
 *    of @forgemsg/workers, which this package cannot import; they are covered
 *    by the workers' own suite and by reading batch-sender.ts:270 and :483.
 *  - They do not assert the schedule itself. What hour a given contact ends up
 *    with is computeTimewarpSchedule's job and is exercised through
 *    /api/v1/internal/timewarp/schedule.
 *  - They do not prove a contact with no timezone RECEIVES anything — only
 *    that the config carries a fallback zone, which is what decides it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp, login } from './setup/harness.js';
import { db } from '../db/client.js';
import { campaigns, contacts, lists, contactLists, sendingDomains } from '../db/schema/index.js';

interface Enqueued {
  name: string;
  data: Record<string, unknown>;
}

/**
 * A verified sending domain of our own.
 *
 * enqueueCampaignSend refuses an unverified From before it enqueues anything
 * (from-domain.ts:112), and the seed ships no sending domain — so without this
 * every dispatch below would fail on the guard rather than on what it tests.
 */
const SEND_DOMAIN = `tw-${randomUUID().slice(0, 8)}.test`;

describe('time-warp reaches the splitter job (real HTTP, real DB)', () => {
  let app: FastifyInstance;
  let token: string;
  let orgId: string;
  let listId: string;
  const createdCampaigns: string[] = [];
  const createdContacts: string[] = [];

  /**
   * The splitter queue, with `add` replaced so we can read what dispatch put
   * on it. Nothing else in the process enqueues onto it during a test.
   */
  let enqueued: Enqueued[] = [];

  async function makeCampaign(body: Record<string, unknown>): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: `timewarp ${randomUUID().slice(0, 8)}`,
        type: 'email',
        subject: 'Time-warp probe',
        fromName: 'ForgeMsg',
        fromEmail: `probe@${SEND_DOMAIN}`,
        content: { blocks: [] },
        listId,
        ...body,
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const id = (res.json() as { data: { id: string } }).data.id;
    createdCampaigns.push(id);
    return id;
  }

  /** Run the dispatch the way the Send button and the cron both do. */
  async function dispatch(campaignId: string) {
    enqueued = [];
    const { enqueueCampaignSend } = await import('../services/campaigns/dispatch.js');
    await enqueueCampaignSend(orgId, campaignId);
    return enqueued;
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
    const session = await login(app);
    token = session.token;
    orgId = session.orgId;

    await db.insert(sendingDomains).values({
      orgId,
      domain: SEND_DOMAIN,
      isVerified: true,
      dkimVerified: true,
      spfVerified: true,
    });

    const [l] = await db
      .insert(lists)
      .values({ orgId, name: `timewarp ${randomUUID().slice(0, 8)}` })
      .returning({ id: lists.id });
    listId = l!.id;

    const [c] = await db
      .insert(contacts)
      .values({
        orgId,
        email: `timewarp-${randomUUID().slice(0, 8)}@test.local`,
        status: 'active',
      })
      .returning({ id: contacts.id });
    createdContacts.push(c!.id);
    await db.insert(contactLists).values({ contactId: c!.id, listId });

    // Intercept the splitter queue rather than mock the module: this is the
    // object dispatch.ts holds a reference to, so replacing `add` on it is the
    // narrowest way to read what was enqueued.
    const queues = await import('../lib/queues.js');
    const q = queues.campaignSplitterQueue as unknown as {
      add: (name: string, data: Record<string, unknown>, opts?: unknown) => Promise<unknown>;
    };
    const real = q.add.bind(q);
    void real;
    q.add = async (name, data) => {
      enqueued.push({ name, data });
      return { id: 'intercepted' };
    };
  }, 120_000);

  afterAll(async () => {
    if (createdCampaigns.length > 0) {
      await db.delete(campaigns).where(inArray(campaigns.id, createdCampaigns));
    }
    if (createdContacts.length > 0) {
      await db.delete(contacts).where(inArray(contacts.id, createdContacts));
    }
    if (listId) await db.delete(lists).where(eq(lists.id, listId));
    await db.delete(sendingDomains).where(eq(sendingDomains.domain, SEND_DOMAIN));
    await app.close();
  }, 60_000);

  it('the route accepts and stores a time-warp setting', async () => {
    const id = await makeCampaign({
      timewarp: { enabled: true, localHour: 9, fallbackTimezone: 'Europe/Prague' },
    });
    const [row] = await db
      .select({ tw: campaigns.timewarp })
      .from(campaigns)
      .where(eq(campaigns.id, id));
    expect(row?.tw).toMatchObject({ enabled: true, localHour: 9 });
  });

  it('the route rejects an hour outside 0-23', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'bad hour',
        type: 'email',
        listId,
        timewarp: { enabled: true, localHour: 24 },
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('dispatch puts it on the splitter job', async () => {
    // The assertion the whole change exists for. Before the fix this field was
    // absent from the enqueued job whatever the campaign said.
    const id = await makeCampaign({
      timewarp: { enabled: true, localHour: 9, fallbackTimezone: 'Europe/Prague' },
    });
    const jobs = await dispatch(id);

    expect(jobs).toHaveLength(1);
    const tw = jobs[0]!.data.timewarp as Record<string, unknown> | undefined;
    expect(tw, 'timewarp did not reach the splitter job').toBeDefined();
    expect(tw).toMatchObject({ enabled: true, localHour: 9 });
  });

  it('a campaign without time-warp sends none, so the default is unchanged', async () => {
    const id = await makeCampaign({});
    const jobs = await dispatch(id);
    expect(jobs[0]!.data.timewarp).toBeUndefined();
  });

  it('enabled:false is treated as off, not as "on with hour 0"', async () => {
    // The stored shape carries `enabled`, and a config with enabled:false but a
    // localHour would otherwise sail through and schedule everyone at midnight.
    const id = await makeCampaign({ timewarp: { enabled: false, localHour: 9 } });
    const jobs = await dispatch(id);
    expect(jobs[0]!.data.timewarp).toBeUndefined();
  });

  it('a contact with no timezone still gets a fallback zone, never a skip', async () => {
    // The decision this encodes: unknown timezone means "send at localHour in
    // the fallback", never "send nothing". The fallback has to be present in
    // the dispatched config for the worker to apply it.
    const id = await makeCampaign({ timewarp: { enabled: true, localHour: 9 } });
    const jobs = await dispatch(id);
    const tw = jobs[0]!.data.timewarp as Record<string, unknown>;
    expect(tw.fallbackTimezone).toBe('Europe/Prague');
  });

  it('the org can override the fallback zone', async () => {
    const id = await makeCampaign({
      timewarp: { enabled: true, localHour: 7, fallbackTimezone: 'Europe/Berlin' },
    });
    const jobs = await dispatch(id);
    expect((jobs[0]!.data.timewarp as Record<string, unknown>).fallbackTimezone).toBe(
      'Europe/Berlin',
    );
  });

  it('the anchor day is the campaign schedule, not whenever the batch runs', async () => {
    // baseDate defaults inside the worker to `new Date()`. For a scheduled
    // campaign that makes the anchor depend on which batch runs first, and a
    // batch starting at 23:58 would anchor the next day for everyone in it.
    const scheduledAt = new Date(Date.now() + 3 * 3_600_000);
    const id = await makeCampaign({
      timewarp: { enabled: true, localHour: 9 },
      scheduledAt: scheduledAt.toISOString(),
    });
    const jobs = await dispatch(id);
    const tw = jobs[0]!.data.timewarp as Record<string, unknown>;
    expect(new Date(tw.baseDate as string).getTime()).toBe(scheduledAt.getTime());
  });

  it('holiday options travel too, with their documented defaults', async () => {
    const id = await makeCampaign({
      timewarp: { enabled: true, localHour: 9, skipHolidays: true, holidayCountry: 'sk' },
    });
    const jobs = await dispatch(id);
    expect(jobs[0]!.data.timewarp).toMatchObject({ skipHolidays: true, holidayCountry: 'sk' });

    const plain = await makeCampaign({ timewarp: { enabled: true, localHour: 9 } });
    const plainJobs = await dispatch(plain);
    expect(plainJobs[0]!.data.timewarp).toMatchObject({
      skipHolidays: false,
      holidayCountry: 'cz',
    });
  });
});
