/**
 * Quiet hours reach flow mail too — and never reach transactional mail.
 *
 * #135 made the send path obey the window a user can actually set, but only on
 * one stream: `fetchCappedBatch` is called under `stream === 'broadcast'`, so a
 * triggered send never asked the question at all. That is precisely the path
 * the recent work sends on — an abandoned-checkout reminder (#132) fires when
 * its `wait` node elapses, and a restock or price-drop alert (#133) fires when
 * the feed notices, which is a cron, not an hour anybody chose. Both could go
 * out at 03:00.
 *
 * This drives the real `processBatchSender` against a real Postgres, Redis and
 * API process. Asserting on the API endpoint alone would be worthless here:
 * deleting the call from the worker would leave such a test green, which is the
 * whole reason the gap existed.
 *
 * Three cases, and the middle one is what stops this being a blanket:
 *
 *   1. triggered, inside the window  -> delayed, nothing enqueued
 *   2. TRANSACTIONAL, inside the same window -> sent (#86)
 *   3. triggered, outside the window -> sent
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Job } from 'bullmq';
import { DelayedError } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { processBatchSender } from '../jobs/batch-sender.js';
import { mtaQueues, type BatchSenderJobData } from '../queues/index.js';

const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

let orgId: string;
let contactId: string;

interface Recorder {
  delayedTo: number | null;
  logs: string[];
}

/**
 * `processBatchSender` uses `.data`, `.log()`, and — on the quiet-hours path —
 * `.updateData()` and `.moveToDelayed()`. The last one is recorded rather than
 * stubbed away, because "did it actually ask to be put back" is the assertion.
 */
function fakeJob(data: BatchSenderJobData): Job<BatchSenderJobData> & Recorder {
  const rec: Recorder = { delayedTo: null, logs: [] };
  return {
    data,
    log: async (line: string) => {
      rec.logs.push(line);
    },
    updateData: async (next: BatchSenderJobData) => {
      (rec as unknown as { data: BatchSenderJobData }).data = next;
    },
    moveToDelayed: async (at: number) => {
      rec.delayedTo = at;
    },
    get delayedTo() {
      return rec.delayedTo;
    },
    get logs() {
      return rec.logs;
    },
  } as unknown as Job<BatchSenderJobData> & Recorder;
}

/** A window that certainly contains this moment, in UTC. */
function windowNow() {
  const h = new Date().getUTCHours();
  return { start: h, end: (h + 1) % 24 };
}

/** A window that certainly does not. */
function windowLater() {
  const h = new Date().getUTCHours();
  return { start: (h + 2) % 24, end: (h + 3) % 24 };
}

async function setQuietWindow(w: { start: number; end: number }) {
  await sql`DELETE FROM quiet_hours WHERE org_id = ${orgId}`;
  await sql`
    INSERT INTO quiet_hours (org_id, channel, start_hour, end_hour, timezone, enabled)
    VALUES (${orgId}, 'all', ${w.start}, ${w.end}, 'UTC', true)
  `;
}

function jobData(stream: 'triggered' | 'transactional' | 'broadcast'): BatchSenderJobData {
  return {
    campaignId: randomUUID(),
    orgId,
    batchIndex: 0,
    contactIds: [contactId],
    content: {
      html: '<p>Hello {{first_name}}</p><a href="{{unsubscribe_url}}">Unsubscribe</a>',
    },
    subject: 'Quiet hours integration test',
    fromName: 'ForgeMsg Test',
    fromEmail: 'test@forgemsg.test',
    priority: 3,
    stream,
  } as BatchSenderJobData;
}

const enqueued = async () => {
  const jobs = await mtaQueues.other.getJobs(['waiting', 'delayed', 'prioritized', 'active']);
  return jobs.map((j) => (j.data as { contactId: string }).contactId);
};

describe('quiet hours on the triggered stream (real DB + Redis + API)', () => {
  beforeAll(async () => {
    const [org] = await sql<{ id: string }[]>`
      SELECT id FROM organizations WHERE slug = 'acme-demo' LIMIT 1
    `;
    if (!org) throw new Error('[workers-integration] seed org missing');
    orgId = org.id;

    const [c] = await sql<{ id: string }[]>`
      INSERT INTO contacts (org_id, email, status)
      VALUES (${orgId}, ${`wi-qh-${randomUUID().slice(0, 8)}@test.local`}, 'active')
      RETURNING id
    `;
    contactId = c!.id;
  }, 60_000);

  afterAll(async () => {
    await sql`DELETE FROM quiet_hours WHERE org_id = ${orgId}`;
    await sql`DELETE FROM contacts WHERE id = ${contactId}`;
    await sql.end({ timeout: 5 });
  });

  it('a flow email inside the quiet window is put back, not sent', async () => {
    await mtaQueues.other.obliterate({ force: true });
    await setQuietWindow(windowNow());

    const job = fakeJob(jobData('triggered'));

    // Delaying is signalled by throwing DelayedError after moveToDelayed —
    // returning a value there makes BullMQ log "Missing lock for job", which
    // applyCampaignBrake documents from measurement.
    await expect(processBatchSender(job)).rejects.toBeInstanceOf(DelayedError);

    expect(await enqueued(), 'nothing may reach the MTA during quiet hours').toHaveLength(0);
    expect(job.delayedTo, 'the batch must be scheduled to come back').not.toBeNull();
    // The window is at most an hour wide here; the retry lands after it ends
    // rather than at some arbitrary backoff.
    expect(job.delayedTo!).toBeGreaterThan(Date.now());
    expect(job.delayedTo!).toBeLessThan(Date.now() + 25 * 3600 * 1000);
  }, 60_000);

  it('a TRANSACTIONAL email in the same window still goes out', async () => {
    // #86. A receipt or a password reset was asked for by the person receiving
    // it; holding those until morning would be a worse product than the bug.
    await mtaQueues.other.obliterate({ force: true });
    await setQuietWindow(windowNow());

    const job = fakeJob(jobData('transactional'));
    const result = (await processBatchSender(job)) as { sent: number };

    expect(job.delayedTo, 'transactional mail is never held').toBeNull();
    expect(result.sent).toBe(1);
    expect(await enqueued()).toContain(contactId);

    await mtaQueues.other.obliterate({ force: true });
  }, 60_000);

  it('a flow email outside the window goes out normally', async () => {
    await mtaQueues.other.obliterate({ force: true });
    await setQuietWindow(windowLater());

    const job = fakeJob(jobData('triggered'));
    const result = (await processBatchSender(job)) as { sent: number };

    expect(job.delayedTo).toBeNull();
    expect(result.sent).toBe(1);
    expect(await enqueued()).toContain(contactId);

    await mtaQueues.other.obliterate({ force: true });
  }, 60_000);

  it('with no quiet window configured at all, a flow email goes out', async () => {
    await mtaQueues.other.obliterate({ force: true });
    await sql`DELETE FROM quiet_hours WHERE org_id = ${orgId}`;

    const job = fakeJob(jobData('triggered'));
    const result = (await processBatchSender(job)) as { sent: number };

    expect(job.delayedTo).toBeNull();
    expect(result.sent).toBe(1);

    await mtaQueues.other.obliterate({ force: true });
  }, 60_000);
});
