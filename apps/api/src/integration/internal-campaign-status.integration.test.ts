/**
 * PATCH /api/v1/internal/campaigns/:id/status only does what the two workers
 * that call it actually do.
 *
 * `setCampaignStatusInternal` bypasses `validateTransition` on purpose — the
 * splitter performs writes the operator state machine forbids — but that made
 * the route a hole rather than a door. Measured on a real database before this
 * change: one PATCH took a campaign from `sent` back to `sending`, and another
 * did the same from `cancelled`. Both are terminal states.
 *
 * These talk to real Postgres because the point is the row, not the status
 * code: a refusal that still wrote would pass a handler-level assertion.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { campaigns, organizations } from '../db/schema/index.js';

let app: FastifyInstance;
let orgId: string;
const made: string[] = [];

const SECRET = process.env.INTERNAL_API_SECRET;
const url = (id: string) => `/api/v1/internal/campaigns/${id}/status`;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();

  const [org] = await db
    .insert(organizations)
    .values({
      name: 'internal-status itest',
      slug: `internal-status-itest-${randomUUID().slice(0, 8)}`,
    })
    .returning({ id: organizations.id });
  orgId = org!.id;
});

afterAll(async () => {
  if (made.length) await db.delete(campaigns).where(inArray(campaigns.id, made));
  if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
  await app.close();
});

async function campaignIn(status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled') {
  const [c] = await db
    .insert(campaigns)
    .values({
      orgId,
      name: `internal-status ${randomUUID().slice(0, 8)}`,
      subject: 'Probe',
      type: 'email',
      status,
    })
    .returning({ id: campaigns.id });
  made.push(c!.id);
  return c!.id;
}

async function statusOf(id: string) {
  const [row] = await db
    .select({ status: campaigns.status })
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);
  return row!.status;
}

const patch = (id: string, status: unknown) =>
  app.inject({
    method: 'PATCH',
    url: url(id),
    headers: { 'x-internal-secret': SECRET! },
    payload: { status },
  });

describe('terminal campaign statuses cannot be left through the internal route', () => {
  it('(a) sent → sending is refused, and the row is untouched', async () => {
    const id = await campaignIn('sent');

    const res = await patch(id, 'sending');

    expect(res.statusCode).toBe(400);
    // The refusal has to be the reason, not a generic validation failure.
    expect(res.json().message).toMatch(/terminal/i);
    // The row is what actually matters: a 400 that still wrote would be worse
    // than no check at all, because it would look enforced.
    expect(await statusOf(id)).toBe('sent');
  });

  it('(b) cancelled → sending is refused, and the row is untouched', async () => {
    const id = await campaignIn('cancelled');

    const res = await patch(id, 'sending');

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/terminal/i);
    expect(await statusOf(id)).toBe('cancelled');
  });

  it('sent → paused is refused too — it is the source state that is terminal', async () => {
    const id = await campaignIn('sent');

    expect((await patch(id, 'paused')).statusCode).toBe(400);
    expect(await statusOf(id)).toBe('sent');
  });
});

describe('(c) the transitions the workers actually perform still go through', () => {
  it("sending → sent — the splitter's write once every batch is enqueued", async () => {
    const id = await campaignIn('sending');

    const res = await patch(id, 'sent');

    expect(res.statusCode).toBe(200);
    expect(await statusOf(id)).toBe('sent');
  });

  it('sending → paused — ab-winner parking a test that needs a human', async () => {
    const id = await campaignIn('sending');

    const res = await patch(id, 'paused');

    expect(res.statusCode).toBe(200);
    expect(await statusOf(id)).toBe('paused');
  });

  it('sending → sending — the splitter holding it open for the winner job', async () => {
    const id = await campaignIn('sending');

    const res = await patch(id, 'sending');

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ noop: true });
    expect(await statusOf(id)).toBe('sending');
  });

  it('a replayed write after a stalled job is a no-op, not a refusal', async () => {
    const id = await campaignIn('sending');
    await patch(id, 'sent');

    // Worker died before acking; BullMQ re-runs the job and repeats the PATCH.
    const replay = await patch(id, 'sent');

    expect(replay.statusCode).toBe(200);
    expect(replay.json().data).toMatchObject({ noop: true });
    expect(await statusOf(id)).toBe('sent');
  });
});

describe('everything else is refused', () => {
  it('draft → sent cannot be forced through this route', async () => {
    const id = await campaignIn('draft');

    expect((await patch(id, 'sent')).statusCode).toBe(400);
    expect(await statusOf(id)).toBe('draft');
  });

  it('paused → sent is refused, so a deliberate pause is not erased', async () => {
    const id = await campaignIn('sending');
    await patch(id, 'paused');

    // The splitter finishing after an operator or the anomaly detector paused
    // the campaign. Refused: the pause was a decision, this write is a race.
    expect((await patch(id, 'sent')).statusCode).toBe(400);
    expect(await statusOf(id)).toBe('paused');
  });

  it('(d) an unrecognised status is a 400, not a 500', async () => {
    const id = await campaignIn('sending');

    const res = await patch(id, 'exploded');

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
    expect(await statusOf(id)).toBe('sending');
  });

  it('(d) a missing status is a 400, not a 500', async () => {
    const id = await campaignIn('sending');

    const res = await app.inject({
      method: 'PATCH',
      url: url(id),
      headers: { 'x-internal-secret': SECRET! },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(await statusOf(id)).toBe('sending');
  });

  it('an unknown campaign is a 404, not a write', async () => {
    const res = await patch(randomUUID(), 'sent');
    expect(res.statusCode).toBe(404);
  });
});
