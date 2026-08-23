/**
 * Closes the gap the API-side consent tests explicitly could not cover.
 *
 * Those tests prove the /internal/consent/check-batch endpoint returns the
 * right answer. They say nothing about whether batch-sender asks the question
 * or acts on the reply — deleting the fetch from the worker would leave them
 * green. This one drives the real processBatchSender against a real Postgres,
 * a real Redis and a real API process, and asserts on what actually landed in
 * the MTA queue.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { processBatchSender } from '../jobs/batch-sender.js';
import { mtaQueues, type BatchSenderJobData } from '../queues/index.js';

const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

let orgId: string;
let purposeId: string;
let consentedContactId: string;
let revokedContactId: string;

/** Minimal Job stand-in — processBatchSender only uses .data and .log(). */
function fakeJob(data: BatchSenderJobData): Job<BatchSenderJobData> {
  const logs: string[] = [];
  return {
    data,
    log: async (line: string) => {
      logs.push(line);
    },
    logs,
  } as unknown as Job<BatchSenderJobData> & { logs: string[] };
}

describe('batch-sender consent enforcement (real DB + Redis + API)', () => {
  beforeAll(async () => {
    const [org] = await sql<{ id: string }[]>`
      SELECT id FROM organizations WHERE slug = 'acme-demo' LIMIT 1
    `;
    if (!org) throw new Error('[workers-integration] seed org missing');
    orgId = org.id;

    const slug = `wi-consent-${randomUUID().slice(0, 8)}`;
    const [purpose] = await sql<{ id: string }[]>`
      INSERT INTO processing_purposes (org_id, slug, name, legal_basis, archived)
      VALUES (${orgId}, ${slug}, 'Workers integration purpose', 'consent', false)
      RETURNING id
    `;
    purposeId = purpose!.id;

    const mk = async (email: string) => {
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO contacts (org_id, email, status)
        VALUES (${orgId}, ${email}, 'active')
        RETURNING id
      `;
      return c!.id;
    };
    consentedContactId = await mk(`wi-ok-${randomUUID().slice(0, 8)}@test.local`);
    revokedContactId = await mk(`wi-revoked-${randomUUID().slice(0, 8)}@test.local`);

    // One live consent, one revoked.
    await sql`
      INSERT INTO contact_gdpr_consents
        (org_id, contact_id, purpose_id, granted, source, granted_at, expires_at, revoked_at)
      VALUES
        (${orgId}, ${consentedContactId}, ${purposeId}, true, 'workers_itest',
         now() - interval '1 day', now() + interval '30 days', NULL),
        (${orgId}, ${revokedContactId}, ${purposeId}, true, 'workers_itest',
         now() - interval '1 day', NULL, now() - interval '1 hour')
    `;
  });

  afterAll(async () => {
    await sql`DELETE FROM contact_gdpr_consents WHERE purpose_id = ${purposeId}`;
    await sql`DELETE FROM processing_purposes WHERE id = ${purposeId}`;
    await sql`DELETE FROM contacts WHERE id IN (${consentedContactId}, ${revokedContactId})`;
    await sql.end({ timeout: 5 });
  });

  it('skips the contact whose consent was revoked', async () => {
    // Drain first so the assertion sees only what this run produced. The
    // .test.local recipients route to the "other" ISP queue.
    await mtaQueues.other.obliterate({ force: true });

    const job = fakeJob({
      campaignId: randomUUID(),
      orgId,
      batchIndex: 0,
      contactIds: [consentedContactId, revokedContactId],
      content: { html: '<p>Hello {{first_name}}</p><a href="{{unsubscribe_url}}">Unsubscribe</a>' },
      subject: 'Consent integration test',
      fromName: 'ForgeMsg Test',
      fromEmail: 'test@forgemsg.test',
      priority: 3,
      stream: 'broadcast',
      processingPurposeId: purposeId,
    } as BatchSenderJobData);

    const result = (await processBatchSender(job)) as { sent: number; skipped: number };

    const jobs = await mtaQueues.other.getJobs(['waiting', 'delayed', 'prioritized', 'active']);
    const enqueuedContactIds = jobs.map((j) => (j.data as { contactId: string }).contactId);

    // The whole point: one job, and it is not the revoked contact's.
    expect(enqueuedContactIds).toHaveLength(1);
    expect(enqueuedContactIds).toContain(consentedContactId);
    expect(enqueuedContactIds).not.toContain(revokedContactId);

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);

    await mtaQueues.other.obliterate({ force: true });
  });
});
