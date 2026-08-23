/**
 * The other half: what the API does with what the worker sends.
 *
 * The worker's decision is pinned in apps/workers. This is the receiving end —
 * that `deferred` and `failed` reach email_events as themselves rather than
 * being folded into a bounce, and that the queries which decide whether an
 * account is in trouble do not count them.
 *
 * The real consumers are called, not re-implemented. There is no value in a
 * test that computes a bounce rate its own way and agrees with itself; the
 * point is that health-score and the auto-pause evaluator, the two things that
 * can pause a customer's sending, see the same numbers a human would.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { campaigns, contacts, emailEvents, organizations } from '../db/schema/index.js';
import { computeRecentRate } from '../services/abuse-detection/auto-pause.js';

let app: FastifyInstance;
let orgId: string;
let campaignId: string;
let contactId: string;

const SECRET = process.env.INTERNAL_API_SECRET ?? '';

/** Post one event exactly as apps/workers does. */
async function post(type: string, metadata: Record<string, unknown>) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/internal/events',
    headers: { 'x-internal-secret': SECRET },
    payload: {
      type,
      orgId,
      campaignId,
      contactId,
      messageId: `dfr-${randomUUID()}`,
      metadata,
    },
  });
  return res;
}

const rows = () =>
  db
    .select({ eventType: emailEvents.eventType, bounceType: emailEvents.bounceType })
    .from(emailEvents)
    .where(eq(emailEvents.orgId, orgId));

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();

  const [org] = await db
    .insert(organizations)
    .values({ name: 'deferred itest', slug: `deferred-itest-${randomUUID().slice(0, 8)}` })
    .returning({ id: organizations.id });
  orgId = org!.id;

  const [camp] = await db
    .insert(campaigns)
    .values({ orgId, name: 'deferred itest', subject: 's', fromEmail: 'a@forgemsg.test' })
    .returning({ id: campaigns.id });
  campaignId = camp!.id;

  const [c] = await db
    .insert(contacts)
    .values({ orgId, email: `deferred-${randomUUID().slice(0, 8)}@probe.test` })
    .returning({ id: contacts.id });
  contactId = c!.id;
}, 60_000);

afterAll(async () => {
  await db.delete(emailEvents).where(eq(emailEvents.orgId, orgId));
  await db.delete(contacts).where(eq(contacts.id, contactId));
  await db.delete(campaigns).where(eq(campaigns.id, campaignId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await app?.close();
}, 60_000);

describe('deferred and failed reach the database as themselves', () => {
  it('stores deferred with no bounce_type', async () => {
    const res = await post('deferred', { reason: 'soft_bounce', smtpCode: 451, attempt: 0 });
    expect(res.statusCode, res.body).toBe(201);

    const all = await rows();
    const deferred = all.filter((r) => r.eventType === 'deferred');
    expect(deferred).toHaveLength(1);
    // A null bounce_type is what keeps `event_type = 'bounce' AND bounce_type = …`
    // from picking it up.
    expect(deferred[0]!.bounceType).toBeNull();
  });

  it('stores failed with no bounce_type', async () => {
    const res = await post('failed', { reason: 'transport_error', error: 'i/o timeout' });
    expect(res.statusCode, res.body).toBe(201);

    const failed = (await rows()).filter((r) => r.eventType === 'failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]!.bounceType).toBeNull();
  });

  it('a real bounce still stores as bounce with its type', async () => {
    const res = await post('bounce', { bounceType: 'soft', smtpCode: 451 });
    expect(res.statusCode, res.body).toBe(201);

    const bounces = (await rows()).filter((r) => r.eventType === 'bounce');
    expect(bounces).toHaveLength(1);
    expect(bounces[0]!.bounceType).toBe('soft');
  });

  it('the auto-pause evaluator counts the bounce and neither of the others', async () => {
    // 10 sends, 1 real bounce, plus the deferred + failed written above.
    for (let i = 0; i < 10; i++) await post('send', {});

    const { rate, sampleSize } = await computeRecentRate(orgId, 'bounce');
    expect(sampleSize).toBe(10);
    // 1 bounce in 10 sends. If deferred/failed were counted this would be 30%,
    // which is over every auto-pause threshold in the table.
    expect(rate).toBe(10);
  });

  it('health-score counts the bounce and neither of the others', async () => {
    const { computeOrgHealth } = await import('../services/deliverability/health-score.js');
    const health = await computeOrgHealth({ orgId, days: 30 });
    // bounceRate is bounces/sends: 1 of 10. Counting deferred and failed would
    // treble it, and 30% is past the point where this stops being a score and
    // starts being a suspension.
    expect(health.components.bounceRate).toBeCloseTo(0.1, 5);
    expect(health.components.hardBounceRate).toBe(0);
  });
});
