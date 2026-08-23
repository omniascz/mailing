/**
 * The regression the internal-auth guard introduced, and its fix.
 *
 * Every internal fetch in this package fails open so a flaky API cannot halt a
 * send. Once the API started requiring a shared secret, a worker with the wrong
 * one got 401 on every call — and fail-open turned that into "no contacts are
 * suppressed, nobody is frequency-capped, nobody is held out, nobody lacks
 * consent". The batch would go out to everyone, silently, and look successful.
 *
 * 401/403 is therefore treated as a configuration error and thrown, which fails
 * the BullMQ job rather than sending.
 *
 * What this test observes precisely: with fail-open restored, the run RESOLVES
 * with { sent: 0, skipped: 0 } — the job is marked successful and never
 * retried. It does not enqueue here because fetchContacts is 401'd too and
 * returns an empty list, so the "sends to everyone" half of the regression only
 * shows up where contacts load but the filters do not. The half this pins down
 * is the one that hides it: a silent success.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { mtaQueues, type BatchSenderJobData } from '../queues/index.js';

const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

let orgId: string;
const contactIds: string[] = [];

function fakeJob(data: BatchSenderJobData): Job<BatchSenderJobData> {
  return {
    data,
    log: async () => {},
  } as unknown as Job<BatchSenderJobData>;
}

describe('batch-sender fails loudly when the API rejects the secret', () => {
  beforeAll(async () => {
    const [org] = await sql<{ id: string }[]>`
      SELECT id FROM organizations WHERE slug = 'acme-demo' LIMIT 1
    `;
    if (!org) throw new Error('[workers-integration] seed org missing');
    orgId = org.id;

    for (let i = 0; i < 2; i++) {
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO contacts (org_id, email, status)
        VALUES (${orgId}, ${`wi-auth-${randomUUID().slice(0, 8)}@test.local`}, 'active')
        RETURNING id
      `;
      contactIds.push(c!.id);
    }
  });

  afterAll(async () => {
    if (contactIds.length) {
      await sql`DELETE FROM contacts WHERE id = ANY(${contactIds})`;
    }
    await sql.end({ timeout: 5 });
  });

  it('throws and enqueues nothing when the internal secret is wrong', async () => {
    await mtaQueues.other.obliterate({ force: true });

    // The secret is read at module load, so the module has to be loaded fresh
    // with the wrong value rather than mutated afterwards.
    const realSecret = process.env.INTERNAL_API_SECRET;
    process.env.INTERNAL_API_SECRET = 'wrong-secret-but-still-32-chars-long-xx';
    vi.resetModules();
    let processBatchSender: (job: Job<BatchSenderJobData>) => Promise<unknown>;
    try {
      const mod = await import('../jobs/batch-sender.js');
      processBatchSender = mod.processBatchSender;
    } finally {
      process.env.INTERNAL_API_SECRET = realSecret;
    }

    const job = fakeJob({
      campaignId: randomUUID(),
      orgId,
      batchIndex: 0,
      contactIds,
      content: { html: '<p>Hello</p><a href="{{unsubscribe_url}}">Unsubscribe</a>' },
      subject: 'Auth failure integration test',
      fromName: 'ForgeMsg Test',
      fromEmail: 'test@forgemsg.test',
      priority: 3,
      stream: 'broadcast',
    } as BatchSenderJobData);

    // Must reject — a rejection is what marks the BullMQ job failed and lets it
    // retry. Resolving would mean the batch was processed with every filter off.
    await expect(processBatchSender(job)).rejects.toThrow(/rejected our credentials \(401\)/);

    // And nothing may have reached the MTA queue.
    const jobs = await mtaQueues.other.getJobs(['waiting', 'delayed', 'prioritized', 'active']);
    expect(jobs).toHaveLength(0);

    await mtaQueues.other.obliterate({ force: true });
  });
});
