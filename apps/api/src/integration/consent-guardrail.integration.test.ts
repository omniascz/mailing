/**
 * GDPR consent guardrail, through the real HTTP layer into real Postgres.
 *
 * These exercise /api/v1/internal/consent/check-batch — the endpoint
 * batch-sender calls once per batch to decide who is dropped from the
 * recipient list. A contact appearing in `blocked` is a contact the worker
 * will not enqueue.
 *
 * Scope limit, stated plainly: these tests cover the decision, not the
 * worker loop that consumes it. batch-sender lives in @forgemsg/workers and
 * talks to this endpoint over HTTP, so it is not reachable from this suite.
 * Removing the fetch from batch-sender would NOT fail these tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestApp, login } from './setup/harness.js';
import { db } from '../db/client.js';
import { env } from '../config/env.js';
import { processingPurposes, contactGdprConsents, contacts } from '../db/schema/index.js';

interface CheckResponse {
  data: {
    blocked: string[];
    reasons: Record<string, string>;
    featureEnabled: boolean;
    configError?: boolean;
  };
}

describe('GDPR consent guardrail (authenticated, real DB)', () => {
  let app: FastifyInstance;
  let orgId: string;
  let contactId: string;
  let purposeId: string;

  /** Ask the endpoint the same question batch-sender asks. */
  async function check(purpose: string | null): Promise<CheckResponse['data']> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/consent/check-batch',
      // /internal/* is behind a shared-secret guard; env.ts supplies the dev
      // default when INTERNAL_API_SECRET is unset, which is what the test env has.
      headers: { 'x-internal-secret': env.INTERNAL_API_SECRET ?? '' },
      payload: { orgId, contactIds: [contactId], processingPurposeId: purpose },
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as CheckResponse).data;
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();

    const session = await login(app);
    orgId = session.orgId;

    const [seeded] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.orgId, orgId))
      .limit(1);
    if (!seeded) throw new Error('[integration] seed produced no contacts');
    contactId = seeded.id;

    const [purpose] = await db
      .insert(processingPurposes)
      .values({
        orgId,
        name: 'Marketing emails (test)',
        slug: `marketing-test-${randomUUID().slice(0, 8)}`,
        legalBasis: 'consent',
        archived: false,
      })
      .returning({ id: processingPurposes.id });
    if (!purpose) throw new Error('[integration] could not create processing purpose');
    purposeId = purpose.id;
  });

  afterAll(async () => {
    // Leave the seeded DB as we found it — later runs reuse it.
    if (purposeId) {
      await db.delete(contactGdprConsents).where(eq(contactGdprConsents.purposeId, purposeId));
      await db.delete(processingPurposes).where(eq(processingPurposes.id, purposeId));
    }
    await app?.close();
  });

  /** Replace this contact's consent row for the purpose under test. */
  async function setConsent(fields: {
    granted: boolean;
    revokedAt?: Date | null;
    expiresAt?: Date | null;
  }) {
    await db.delete(contactGdprConsents).where(eq(contactGdprConsents.purposeId, purposeId));
    await db.insert(contactGdprConsents).values({
      orgId,
      contactId,
      purposeId,
      granted: fields.granted,
      source: 'integration_test',
      grantedAt: new Date(Date.now() - 86_400_000),
      revokedAt: fields.revokedAt ?? null,
      expiresAt: fields.expiresAt ?? null,
    });
  }

  it('a contact whose consent was revoked is not among the recipients', async () => {
    await setConsent({ granted: true, revokedAt: new Date(Date.now() - 3_600_000) });

    const data = await check(purposeId);

    expect(data.featureEnabled).toBe(true);
    expect(data.blocked).toContain(contactId);
    expect(data.reasons[contactId]).toBe('consent_revoked');
  });

  it('a contact whose consent expired is not among the recipients', async () => {
    await setConsent({ granted: true, expiresAt: new Date(Date.now() - 3_600_000) });

    const data = await check(purposeId);

    expect(data.featureEnabled).toBe(true);
    expect(data.blocked).toContain(contactId);
    expect(data.reasons[contactId]).toBe('consent_expired');
  });

  it('a contact with valid consent IS among the recipients', async () => {
    // Control. Without this, the two tests above would also pass against an
    // endpoint that blocks everyone unconditionally.
    await setConsent({ granted: true, expiresAt: new Date(Date.now() + 86_400_000) });

    const data = await check(purposeId);

    expect(data.featureEnabled).toBe(true);
    expect(data.blocked).not.toContain(contactId);
    expect(data.reasons[contactId]).toBeUndefined();
  });

  it('an org with no configured purposes sends to everyone (feature off)', async () => {
    // Archive the only purpose → the org no longer enforces purposes at all.
    await db
      .update(processingPurposes)
      .set({ archived: true })
      .where(eq(processingPurposes.id, purposeId));

    try {
      const data = await check(null);

      expect(data.featureEnabled).toBe(false);
      expect(data.blocked).toEqual([]);
    } finally {
      await db
        .update(processingPurposes)
        .set({ archived: false })
        .where(eq(processingPurposes.id, purposeId));
    }
  });
});
