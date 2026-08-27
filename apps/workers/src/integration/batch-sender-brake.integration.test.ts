/**
 * The brake, driven through a real BullMQ worker against a real Postgres,
 * Redis and API.
 *
 * Testing this with a stubbed job would prove nothing that matters. The whole
 * mechanism is BullMQ's: whether `moveToDelayed` from inside a processor
 * actually puts the job back, whether the retry budget survives it, and whether
 * a delayed job stays silent about completion. So this runs the real
 * `processBatchSender` inside a real `Worker`, on its own queue so nothing else
 * in the suite is affected.
 *
 * Until this existed, pausing a campaign changed a column and stopped nothing:
 * the batches already on the queue went out regardless, and so did the batches
 * of a campaign that had been cancelled.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { processBatchSender } from '../jobs/batch-sender.js';
import { connection, mtaQueues, type BatchSenderJobData } from '../queues/index.js';

const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

const QUEUE = `wi-brake-${randomUUID().slice(0, 8)}`;
let queue: Queue<BatchSenderJobData>;
let worker: Worker<BatchSenderJobData>;
let orgId: string;
let listId: string;
let contactId: string;
const campaignIds: string[] = [];

/** `getState()` is async; comparing the promise to a string is always false. */
async function isDelayed(jobId: string) {
  const j = await queue.getJob(jobId);
  return (await j?.getState()) === 'delayed';
}

/** Wait for a predicate, polling — BullMQ state changes are not synchronous. */
async function until(what: string, fn: () => Promise<boolean>, ms = 15_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for: ${what}`);
}

async function campaignRow(id: string) {
  const [r] = await sql<
    { status: string; pending_batches: number | null; total_sent: number }[]
  >`SELECT status, pending_batches, total_sent FROM campaigns WHERE id = ${id}`;
  return r!;
}

async function ledgerRow(campaignId: string, batchKey: string) {
  const [r] = await sql<
    { completed_at: Date | null; sent_count: number | null }[]
  >`SELECT completed_at, sent_count FROM campaign_dispatch_batches
     WHERE campaign_id = ${campaignId} AND batch_key = ${batchKey}`;
  return r!;
}

/** A campaign already in `sending` with one batch armed and on the ledger. */
async function armedCampaign(dispatchId: string) {
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO campaigns (org_id, name, subject, from_name, from_email, list_id,
                           content, type, status, planned_recipients, pending_batches)
    VALUES (${orgId}, ${'wi-brake-' + randomUUID().slice(0, 8)}, 'Brake test', 'Shop',
            'orders@shop.cz', ${listId}, ${sql.json({ html: '<p>Hi</p>' })}, 'email',
            'sending', 1, 1)
    RETURNING id
  `;
  const id = c!.id;
  campaignIds.push(id);
  await sql`
    INSERT INTO campaign_dispatch_batches (campaign_id, org_id, dispatch_id, batch_key, enqueued_at)
    VALUES (${id}, ${orgId}, ${dispatchId}, '0', now())
  `;
  return id;
}

function jobData(campaignId: string, dispatchId: string): BatchSenderJobData {
  return {
    campaignId,
    orgId,
    batchIndex: 0,
    dispatchId,
    batchKey: '0',
    contactIds: [contactId],
    content: { html: '<p>Hello</p><a href="{{unsubscribe_url}}">Unsubscribe</a>' },
    subject: 'Brake integration test',
    fromName: 'ForgeMsg Test',
    fromEmail: 'test@forgemsg.test',
    priority: 3,
    stream: 'broadcast',
  } as BatchSenderJobData;
}

beforeAll(async () => {
  const [org] = await sql<{ id: string }[]>`
    SELECT id FROM organizations WHERE slug = 'acme-demo' LIMIT 1
  `;
  if (!org) throw new Error('[workers-integration] seed org missing');
  orgId = org.id;

  const [list] = await sql<{ id: string }[]>`
    INSERT INTO lists (org_id, name) VALUES (${orgId}, ${'wi-brake-' + randomUUID().slice(0, 8)})
    RETURNING id
  `;
  listId = list!.id;

  const [contact] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, status)
    VALUES (${orgId}, ${'wi-brake-' + randomUUID().slice(0, 8) + '@test.local'}, 'active')
    RETURNING id
  `;
  contactId = contact!.id;

  queue = new Queue<BatchSenderJobData>(QUEUE, { connection });
  await queue.obliterate({ force: true }).catch(() => {});
  worker = new Worker<BatchSenderJobData>(QUEUE, processBatchSender, {
    connection,
    concurrency: 1,
  });
  await worker.waitUntilReady();
});

afterAll(async () => {
  await worker?.close();
  await queue?.obliterate({ force: true }).catch(() => {});
  await queue?.close();
  if (campaignIds.length) {
    await sql`DELETE FROM campaigns WHERE id = ANY(${sql.array(campaignIds)}::uuid[])`;
  }
  await sql`DELETE FROM contacts WHERE id = ${contactId}`;
  await sql`DELETE FROM lists WHERE id = ${listId}`;
  await sql.end({ timeout: 5 });
});

describe('the batch-sender brake (real worker, real queue)', () => {
  it('(a)(d)(g) a paused campaign puts the batch back, unattempted and unreported', async () => {
    await mtaQueues.other.obliterate({ force: true });
    const dispatchId = `brake-a-${randomUUID().slice(0, 8)}`;
    const campaignId = await armedCampaign(dispatchId);
    await sql`UPDATE campaigns SET status = 'paused', paused_reason = 'operator' WHERE id = ${campaignId}`;

    const job = await queue.add('b', jobData(campaignId, dispatchId), {
      attempts: 3,
      backoff: { type: 'fixed', delay: 100 },
    });

    // (a) The job goes back to the queue instead of running. Asserted on THIS
    // job's state rather than a queue-wide count — another test's delayed job
    // would satisfy a count and let this one race past.
    await until('this job to be delayed', () => isDelayed(job.id!));

    const after = await queue.getJob(job.id!);
    // (d) Being put back is not a failed attempt. If it were, a campaign paused
    // three times would exhaust its retries and the batch would die.
    expect(after!.attemptsMade).toBe(0);
    expect(after!.data.pauseDelays).toBe(1);

    // (a) Nothing was handed to the MTA.
    const mtaJobs = await mtaQueues.other.getJobs(['waiting', 'delayed', 'prioritized', 'active']);
    expect(mtaJobs).toHaveLength(0);

    // (g) The invariant: a delayed batch has NOT reported. If it had, the
    // counter would reach zero and the campaign would close while paused.
    expect((await ledgerRow(campaignId, '0')).completed_at).toBeNull();
    expect((await campaignRow(campaignId)).pending_batches).toBe(1);

    // Do not leave it waiting: the next test runs on the same queue.
    await after!.remove();
  });

  it('(b) resuming lets the same job through, and the campaign closes', async () => {
    await mtaQueues.other.obliterate({ force: true });
    const dispatchId = `brake-b-${randomUUID().slice(0, 8)}`;
    const campaignId = await armedCampaign(dispatchId);
    await sql`UPDATE campaigns SET status = 'paused' WHERE id = ${campaignId}`;

    const job = await queue.add('b', jobData(campaignId, dispatchId), { attempts: 3 });
    await until('this job to be delayed', () => isDelayed(job.id!));

    // The operator resumes. The delay is minutes long by design, so the test
    // promotes the job rather than waiting for it.
    await sql`UPDATE campaigns SET status = 'sending' WHERE id = ${campaignId}`;
    await (await queue.getJob(job.id!))!.promote();

    await until('the campaign to close', async () => {
      const r = await campaignRow(campaignId);
      return r.pending_batches === null;
    });

    const r = await campaignRow(campaignId);
    // One batch, one contact, and the counter reached zero — so the closing
    // step ran and the campaign is finished rather than stuck.
    expect(r.status).toBe('sent');
    expect(r.total_sent).toBe(1);

    const mtaJobs = await mtaQueues.other.getJobs(['waiting', 'delayed', 'prioritized', 'active']);
    expect(mtaJobs).toHaveLength(1);
    await mtaQueues.other.obliterate({ force: true });
  });

  it('(f) a cancelled campaign drops the batch and still reports it', async () => {
    await mtaQueues.other.obliterate({ force: true });
    const dispatchId = `brake-f-${randomUUID().slice(0, 8)}`;
    const campaignId = await armedCampaign(dispatchId);
    await sql`UPDATE campaigns SET status = 'cancelled' WHERE id = ${campaignId}`;

    await queue.add('b', jobData(campaignId, dispatchId), { attempts: 3 });

    await until('the batch to report', async () => {
      return (await ledgerRow(campaignId, '0')).completed_at !== null;
    });

    // Nothing was sent...
    const mtaJobs = await mtaQueues.other.getJobs(['waiting', 'delayed', 'prioritized', 'active']);
    expect(mtaJobs).toHaveLength(0);

    // ...but the batch reported, so the counter came down. A cancelled campaign
    // whose batches stayed silent would hold its counter open forever.
    const r = await campaignRow(campaignId);
    expect(r.pending_batches).toBeNull();
    expect(r.status).toBe('cancelled');
    expect(r.total_sent).toBe(0);
  });
});
