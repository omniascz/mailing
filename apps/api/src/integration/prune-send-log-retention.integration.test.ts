/**
 * The retention window was inverted: the prune deleted what it was meant to keep.
 *
 * The docstring said "Garbage-collect log rows older than 30 days" and the
 * predicate was `gte(contactSendLog.sentAt, cutoff)` — sent_at GREATER than the
 * cutoff, which is everything inside the window. So the call threw away the
 * recent rows and left the thirty-day-old ones to accumulate forever.
 *
 * That is the opposite of harmless. The rows it deleted are exactly the ones
 * the fatigue cap needs: canSend() counts sends in the last day, the last week
 * and the cooldown window (services/smart-sending/index.ts), and the live send
 * path asks through POST /api/v1/internal/frequency/check-batch. Pruning the
 * fresh rows lifts the cap it is supposed to leave alone, while the rows that
 * no limit reads any more are the ones that stay.
 *
 * Every assertion here names a row by id rather than counting, because a count
 * cannot tell "deleted four, kept two" from "deleted the wrong four".
 *
 * Tenant scope is the other defect and has its own file and its own commit.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts, contactSendLog } from '../db/schema/index.js';
import { canSend } from '../services/smart-sending/index.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;

let app: FastifyInstance;
let owner: Session;
/** Rows of the retention test live on this contact. */
let agedContact: string;
/** The cap control uses a contact of its own, so the two do not interfere. */
let cappedContact: string;

const id = {
  d40: '',
  d31: '',
  d29: '',
  h1: '',
  cap1: '',
  cap2: '',
};

const rowById = async (rowId: string) =>
  (await db.select().from(contactSendLog).where(eq(contactSendLog.id, rowId)))[0];

async function seedLog(orgId: string, contactId: string, agoMs: number): Promise<string> {
  const [row] = await db
    .insert(contactSendLog)
    .values({ orgId, contactId, channel: 'email', sentAt: new Date(Date.now() - agoMs) })
    .returning({ id: contactSendLog.id });
  return row!.id;
}

const prune = async () =>
  app.inject({
    method: 'POST',
    url: '/api/v1/smart-sending/prune',
    headers: { cookie: owner.cookie },
  });

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  owner = await login(app);

  const [ac] = await db
    .insert(contacts)
    .values({ orgId: owner.orgId, email: `aged-${randomUUID().slice(0, 8)}@example.invalid` })
    .returning({ id: contacts.id });
  agedContact = ac!.id;

  const [cc] = await db
    .insert(contacts)
    .values({ orgId: owner.orgId, email: `capped-${randomUUID().slice(0, 8)}@example.invalid` })
    .returning({ id: contacts.id });
  cappedContact = cc!.id;

  // Two rows outside a 30-day window, two inside it.
  id.d40 = await seedLog(owner.orgId, agedContact, 40 * DAY);
  id.d31 = await seedLog(owner.orgId, agedContact, 31 * DAY);
  id.d29 = await seedLog(owner.orgId, agedContact, 29 * DAY);
  id.h1 = await seedLog(owner.orgId, agedContact, 1 * HOUR);

  // The cap control: two sends in the last hour is already at the default
  // maxPerDay of 2, and inside the 16-hour cooldown.
  id.cap1 = await seedLog(owner.orgId, cappedContact, 1 * HOUR);
  id.cap2 = await seedLog(owner.orgId, cappedContact, 2 * HOUR);
}, 60_000);

afterAll(async () => {
  await db.delete(contactSendLog).where(eq(contactSendLog.contactId, agedContact));
  await db.delete(contactSendLog).where(eq(contactSendLog.contactId, cappedContact));
  await db.delete(contacts).where(eq(contacts.id, agedContact));
  await db.delete(contacts).where(eq(contacts.id, cappedContact));
  await app?.close();
}, 60_000);

describe('a retention prune deletes the old rows and keeps the recent ones', () => {
  it('drops 40 and 31 days, keeps 29 days and one hour', async () => {
    const cappedBefore = await canSend(owner.orgId, cappedContact, 'email');
    expect(cappedBefore.allowed, 'control precondition: the contact must start capped').toBe(false);

    const res = await prune();
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    // Gone, named individually.
    expect(await rowById(id.d40), 'the 40-day row survived the prune').toBeUndefined();
    expect(await rowById(id.d31), 'the 31-day row survived the prune').toBeUndefined();

    // Kept — and field by field, so a prune that re-stamped sent_at instead of
    // leaving the row alone would not pass either.
    const d29 = await rowById(id.d29);
    expect(d29, 'the 29-day row is inside the window and was deleted anyway').toBeDefined();
    expect(d29!.contactId).toBe(agedContact);
    expect(d29!.channel).toBe('email');
    expect(Date.now() - d29!.sentAt.getTime()).toBeGreaterThan(28 * DAY);
    expect(Date.now() - d29!.sentAt.getTime()).toBeLessThan(30 * DAY);

    const h1 = await rowById(id.h1);
    expect(h1, 'the one-hour-old row is what the cap counts and it was deleted').toBeDefined();
    expect(Date.now() - h1!.sentAt.getTime()).toBeLessThan(2 * HOUR);

    // Negative control 1: nothing inside the retention window went.
    expect(await rowById(id.cap1)).toBeDefined();
    expect(await rowById(id.cap2)).toBeDefined();

    // Negative control 2: the fatigue cap still reads what is left, so the
    // prune did not quietly open the gate.
    const cappedAfter = await canSend(owner.orgId, cappedContact, 'email');
    expect(cappedAfter.allowed).toBe(false);
    expect(cappedAfter.reason).toBe(cappedBefore.reason);
  });

  it('is idempotent: a second prune has nothing old left to take', async () => {
    const res = await prune();
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { deleted: number } }).data.deleted).toBe(0);

    expect(await rowById(id.d29)).toBeDefined();
    expect(await rowById(id.h1)).toBeDefined();
  });
});
