/**
 * A contact who asked to leave does not get the campaign — whichever way they
 * asked.
 *
 * `suppressions` was the only store the send path consulted. Four of the
 * fourteen unsubscribe paths — the contacts API, Resend-compat, the SMS keyword
 * handler and importers — set `contacts.status` and nothing else, and
 * resolveAudience lets 'unsubscribed' through on the assumption that
 * suppressions would catch it. So those people kept receiving campaigns, and
 * the product reported them as unsubscribed the whole time.
 *
 * This drives the real processBatchSender against a real Postgres, Redis and
 * API and asserts on what landed in the MTA queue, because the failure mode
 * being guarded against is exactly "the filter is not wired to the send".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { processBatchSender } from '../jobs/batch-sender.js';
import { mtaQueues, type BatchSenderJobData } from '../queues/index.js';

const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

let orgId: string;
let activeId: string;
let flaggedOnlyId: string;
let bouncedId: string;

function fakeJob(data: BatchSenderJobData): Job<BatchSenderJobData> {
  return { data, log: async () => {} } as unknown as Job<BatchSenderJobData>;
}

async function mkContact(status: string): Promise<string> {
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, status)
    VALUES (${orgId}, ${`unsub-bs-${randomUUID().slice(0, 10)}@test.local`}, ${status})
    RETURNING id
  `;
  return c!.id;
}

describe('batch-sender skips contacts flagged unsubscribed (real DB + Redis + API)', () => {
  beforeAll(async () => {
    const [org] = await sql<{ id: string }[]>`
      SELECT id FROM organizations WHERE slug = 'acme-demo' LIMIT 1
    `;
    if (!org) throw new Error('[workers-integration] seed org missing');
    orgId = org.id;

    activeId = await mkContact('active');
    // The hole: flagged, but with no suppression row anywhere.
    flaggedOnlyId = await mkContact('unsubscribed');
    bouncedId = await mkContact('bounced');
  }, 60_000);

  afterAll(async () => {
    await sql`DELETE FROM contacts WHERE id IN (${activeId}, ${flaggedOnlyId}, ${bouncedId})`;
    await sql.end({ timeout: 5 });
  });

  it('does not enqueue a contact whose status is unsubscribed, with no suppression', async () => {
    await mtaQueues.other.obliterate({ force: true });

    // Nothing in suppressions — that is the whole point of the case.
    const [supp] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM suppressions s
      JOIN contacts c ON lower(c.email) = s.email
      WHERE c.id = ${flaggedOnlyId}
    `;
    expect(Number(supp!.n)).toBe(0);

    const result = (await processBatchSender(
      fakeJob({
        campaignId: randomUUID(),
        orgId,
        batchIndex: 0,
        contactIds: [activeId, flaggedOnlyId],
        content: { html: '<p>Hello</p><a href="{{unsubscribe_url}}">Unsubscribe</a>' },
        subject: 'Unsubscribed filter test',
        fromName: 'ForgeMsg Test',
        fromEmail: 'test@forgemsg.test',
        priority: 3,
        stream: 'broadcast',
      } as BatchSenderJobData),
    )) as { sent: number; skipped: number };

    const jobs = await mtaQueues.other.getJobs(['waiting', 'delayed', 'prioritized', 'active']);
    const enqueued = jobs.map((j) => (j.data as { contactId: string }).contactId);

    expect(enqueued).toContain(activeId);
    expect(enqueued).not.toContain(flaggedOnlyId);
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);

    await mtaQueues.other.obliterate({ force: true });
  }, 120_000);

  it('still delivers transactional mail to an unsubscribed contact', async () => {
    // A receipt or a password reset rests on contract, not marketing consent —
    // the same reason the suppression check is skipped for this stream. Putting
    // the filter in /internal/contacts/batch would have broken this.
    await mtaQueues.other.obliterate({ force: true });

    const result = (await processBatchSender(
      fakeJob({
        campaignId: randomUUID(),
        orgId,
        batchIndex: 0,
        contactIds: [flaggedOnlyId],
        // No opt-out in the body on purpose: transactional mail must go out
        // without one, and the send-path guard must let it.
        content: { html: '<p>Your receipt</p>' },
        subject: 'Receipt',
        fromName: 'ForgeMsg Test',
        fromEmail: 'test@forgemsg.test',
        priority: 1,
        stream: 'transactional',
      } as BatchSenderJobData),
    )) as { sent: number; skipped: number };

    const jobs = await mtaQueues.other.getJobs(['waiting', 'delayed', 'prioritized', 'active']);
    const enqueued = jobs.map((j) => (j.data as { contactId: string }).contactId);

    expect(enqueued).toContain(flaggedOnlyId);
    expect(result.sent).toBe(1);

    await mtaQueues.other.obliterate({ force: true });
  }, 120_000);

  it('refuses a raw-HTML marketing campaign whose body has no opt-out', async () => {
    // The renderer cannot help here: a legacy { html } campaign never reaches
    // renderEmail, so there is nothing to append a compliance footer to. The
    // send path is the only place left, and it refuses the whole batch rather
    // than dropping the contact — the same violation for the other recipients
    // is still a violation.
    await mtaQueues.other.obliterate({ force: true });

    await expect(
      processBatchSender(
        fakeJob({
          campaignId: randomUUID(),
          orgId,
          batchIndex: 0,
          // A deliverable contact: an unsubscribed one is filtered out before
          // the render, so the guard would never be reached.
          contactIds: [activeId],
          content: { html: '<p>Buy our things</p>' },
          subject: 'Sale',
          fromName: 'ForgeMsg Test',
          fromEmail: 'test@forgemsg.test',
          priority: 3,
          stream: 'broadcast',
        } as BatchSenderJobData),
      ),
    ).rejects.toThrow(/no unsubscribe link/);

    const jobs = await mtaQueues.other.getJobs(['waiting', 'delayed', 'prioritized', 'active']);
    expect(jobs, 'nothing may be enqueued from a refused batch').toHaveLength(0);

    await mtaQueues.other.obliterate({ force: true });
  }, 120_000);

  it('a bounced contact with no suppression row gets no campaign, and still gets transactional mail', async () => {
    // This used to assert the opposite — "the filter covers 'unsubscribed'
    // only", on the assumption that every bounce arrives with a row. POST/PUT
    // /contacts set the status with none, so the status is now refused too
    // (bounced-status.integration.test.ts walks that to the engine). A
    // transactional message is not: the status adds nothing a row does not.
    await mtaQueues.other.obliterate({ force: true });

    const marketing = (await processBatchSender(
      fakeJob({
        campaignId: randomUUID(),
        orgId,
        batchIndex: 0,
        contactIds: [bouncedId, activeId],
        content: { html: '<p>Hello</p><a href="{{unsubscribe_url}}">Unsubscribe</a>' },
        subject: 'Bounced refused',
        fromName: 'ForgeMsg Test',
        fromEmail: 'test@forgemsg.test',
        priority: 3,
        stream: 'broadcast',
      } as BatchSenderJobData),
    )) as { sent: number; skipped: number };

    let jobs = await mtaQueues.other.getJobs(['waiting', 'delayed', 'prioritized', 'active']);
    let enqueued = jobs.map((j) => (j.data as { contactId: string }).contactId);
    expect(enqueued).not.toContain(bouncedId);
    expect(enqueued, 'the active control must be enqueued').toContain(activeId);
    expect(marketing.sent).toBe(1);
    expect(marketing.skipped).toBe(1);
    await mtaQueues.other.obliterate({ force: true });

    const receipt = (await processBatchSender(
      fakeJob({
        campaignId: randomUUID(),
        orgId,
        batchIndex: 0,
        contactIds: [bouncedId],
        content: { html: '<p>Your receipt</p>' },
        subject: 'Receipt',
        fromName: 'ForgeMsg Test',
        fromEmail: 'test@forgemsg.test',
        priority: 1,
        stream: 'transactional',
      } as BatchSenderJobData),
    )) as { sent: number; skipped: number };

    jobs = await mtaQueues.other.getJobs(['waiting', 'delayed', 'prioritized', 'active']);
    enqueued = jobs.map((j) => (j.data as { contactId: string }).contactId);
    expect(enqueued).toContain(bouncedId);
    expect(receipt.sent).toBe(1);

    await mtaQueues.other.obliterate({ force: true });
  }, 120_000);
});
