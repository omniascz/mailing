/**
 * POST /api/v1/smart-sending/prune deleted every organisation's send log.
 *
 * pruneSendLog() took no orgId at all — `db.delete(contactSendLog)` with a
 * date predicate and nothing else — while the route that calls it sits behind
 * app.authenticate + requireRole('admin', 'owner') and is registered as CORE
 * (apps/api/src/index.ts). So an admin of any organisation, including one that
 * signed up a minute ago, emptied `contact_send_log` for all of them.
 *
 * The damage is not only the rows. `contact_send_log` is what the smart-sending
 * fatigue cap counts: services/smart-sending/index.ts:canSend reads it for the
 * per-day, per-week and cooldown limits, and the live send path consults that
 * through POST /api/v1/internal/frequency/check-batch
 * (apps/workers/src/jobs/batch-sender.ts:1057). Deleting another tenant's log
 * lifts their fatigue cap, and the next batch goes out to contacts that should
 * have been held back.
 *
 * These assertions go through the route rather than calling the service,
 * because the route is the surface an attacker has, and they read the victim's
 * rows field by field — a refusal reported in the response body would look the
 * same from outside as one that deleted the rows first.
 *
 * What this file deliberately does NOT pin down is which of the caller's own
 * rows go: that is the retention window, a separate defect with its own
 * commit and its own case below it in git history. Here the caller's log only
 * has to shrink, which proves the delete fired and was scoped.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations, contacts, contactSendLog } from '../db/schema/index.js';

const DAY = 86_400_000;

let app: FastifyInstance;
/** The seeded org, whose owner calls the route. */
let caller: Session;
/** A second tenant that has nothing to do with that call. */
let victimOrg: string;
let victimContact: string;
let callerContact: string;

/** Row ids, so every assertion names a row instead of counting them. */
const id = {
  victimOld: '',
  victimFresh: '',
  callerOld: '',
  callerFresh: '',
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

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  caller = await login(app);

  const [org] = await db
    .insert(organizations)
    .values({ name: 'prune victim', slug: `prune-victim-${randomUUID().slice(0, 8)}` })
    .returning({ id: organizations.id });
  victimOrg = org!.id;

  const [vc] = await db
    .insert(contacts)
    .values({ orgId: victimOrg, email: `victim-${randomUUID().slice(0, 8)}@example.invalid` })
    .returning({ id: contacts.id });
  victimContact = vc!.id;

  const [cc] = await db
    .insert(contacts)
    .values({ orgId: caller.orgId, email: `caller-${randomUUID().slice(0, 8)}@example.invalid` })
    .returning({ id: contacts.id });
  callerContact = cc!.id;

  // One row on each side of a 30-day retention window, for both tenants.
  id.victimOld = await seedLog(victimOrg, victimContact, 40 * DAY);
  id.victimFresh = await seedLog(victimOrg, victimContact, 1 * DAY);
  id.callerOld = await seedLog(caller.orgId, callerContact, 40 * DAY);
  id.callerFresh = await seedLog(caller.orgId, callerContact, 1 * DAY);
}, 60_000);

afterAll(async () => {
  await db.delete(contactSendLog).where(eq(contactSendLog.orgId, victimOrg));
  await db.delete(contacts).where(eq(contacts.id, victimContact));
  await db.delete(contacts).where(eq(contacts.id, callerContact));
  await db.delete(organizations).where(eq(organizations.id, victimOrg));
  await app?.close();
}, 60_000);

describe('pruning a send log stops at the caller own organisation', () => {
  it('leaves the other tenant rows exactly as they were, and shrinks its own log', async () => {
    const victimOldBefore = await rowById(id.victimOld);
    const victimFreshBefore = await rowById(id.victimFresh);
    expect(victimOldBefore, 'fixture missing — victim rows were not seeded').toBeDefined();
    expect(victimFreshBefore).toBeDefined();
    expect(victimOldBefore!.orgId).toBe(victimOrg);
    expect(victimOldBefore!.orgId).not.toBe(caller.orgId);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/smart-sending/prune',
      headers: { cookie: caller.cookie },
    });
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    // The victim, field by field. Both rows, every column, including sent_at —
    // a prune that re-stamped rather than deleted would pass a row count.
    for (const [label, before] of [
      ['old', victimOldBefore!],
      ['fresh', victimFreshBefore!],
    ] as const) {
      const after = await rowById(before.id);
      expect(after, `victim ${label} row was deleted by another tenant prune`).toBeDefined();
      expect(after!.id).toBe(before.id);
      expect(after!.orgId).toBe(before.orgId);
      expect(after!.contactId).toBe(before.contactId);
      expect(after!.channel).toBe(before.channel);
      expect(after!.sentAt.getTime()).toBe(before.sentAt.getTime());
    }

    // And the caller did prune something of its own — otherwise "the victim is
    // untouched" would also pass for a prune that does nothing at all.
    const callerLeft = [await rowById(id.callerOld), await rowById(id.callerFresh)].filter(Boolean);
    expect(callerLeft).toHaveLength(1);
    const body = res.json() as { data: { deleted: number } };
    expect(body.data.deleted).toBeGreaterThanOrEqual(1);
  });

  it('reports only its own deletions in the count', async () => {
    // Second call: the caller's side is already pruned, the victim's rows are
    // still there, so a correctly scoped prune now has nothing left to delete.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/smart-sending/prune',
      headers: { cookie: caller.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { deleted: number } };
    expect(body.data.deleted).toBe(0);

    // Still true after a second attempt.
    expect(await rowById(id.victimOld)).toBeDefined();
    expect(await rowById(id.victimFresh)).toBeDefined();
  });
});
