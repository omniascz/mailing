/**
 * The three send-path decisions, and the four routes, that a Date in a raw
 * sql`` fragment was breaking.
 *
 * These assert on the ANSWER, not just on the absence of a throw. That
 * distinction is the whole point here: before the fix `canSend` threw, the
 * internal frequency route turned that into a 500, and batch-sender's
 * `if (!res.ok) return []` read the 500 as "nobody is capped" and sent to
 * everyone. A test that only checked "does not throw" would have passed on
 * a function that always answered `allowed: true`, which is exactly the
 * failure mode that was live.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp, login } from './setup/harness.js';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import {
  contacts,
  contactSendLog,
  smartSendingRules,
  workflowEvents,
  emailEvents,
} from '../db/schema/index.js';
import { canSend } from '../services/smart-sending/index.js';
import { hasContactConverted } from '../services/workflows/conversion-suppression.js';
import { getContactSendHour } from '../services/sending/send-time-optimization.js';

let app: FastifyInstance;
let cookie: string;
let orgId: string;

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

/** Contacts this suite created, cleaned up at the end. */
const created: string[] = [];

async function makeContact(label: string): Promise<string> {
  const [row] = await db
    .insert(contacts)
    .values({
      orgId,
      email: `sqlenc-${label}-${randomUUID().slice(0, 8)}@test.local`,
      status: 'active',
    })
    .returning({ id: contacts.id });
  created.push(row!.id);
  return row!.id;
}

describe('values that used to break the driver (authenticated, real DB)', () => {
  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
    const session = await login(app);
    cookie = session.cookie;
    orgId = session.orgId;
  });

  afterAll(async () => {
    for (const id of created) {
      await db.delete(contactSendLog).where(eq(contactSendLog.contactId, id));
      await db.delete(workflowEvents).where(eq(workflowEvents.contactId, id));
      await db.delete(emailEvents).where(eq(emailEvents.contactId, id));
      await db.delete(contacts).where(eq(contacts.id, id));
    }
    await db.delete(smartSendingRules).where(eq(smartSendingRules.orgId, orgId));
  });

  // ── canSend ───────────────────────────────────────────────────────────────
  describe('canSend', () => {
    /**
     * Install the rule this test depends on and prove it took effect.
     *
     * Done per test rather than in a beforeAll: without the read-back a missing
     * rule silently falls through to DEFAULTS (2/day, 16 h cooldown), and the
     * assertions then measure the defaults instead of the fixture — which is
     * how the first version of this test reported "cooldown" for a case that
     * was about the daily cap.
     */
    async function setEmailRule(maxPerDay: number, cooldownHours: number) {
      await db.delete(smartSendingRules).where(eq(smartSendingRules.orgId, orgId));
      await db.insert(smartSendingRules).values({
        orgId,
        channel: 'email',
        maxPerDay,
        maxPerWeek: 50,
        cooldownHours,
        enabled: true,
      });
      const [check] = await db
        .select()
        .from(smartSendingRules)
        .where(and(eq(smartSendingRules.orgId, orgId), eq(smartSendingRules.channel, 'email')));
      expect(check, 'the fixture rule must exist, or DEFAULTS silently apply').toBeTruthy();
      expect(check!.cooldownHours).toBe(cooldownHours);
    }

    it('allows a contact with no send history', async () => {
      await setEmailRule(2, 0);
      const contactId = await makeContact('under');
      const res = await canSend(orgId, contactId, 'email');
      expect(res.allowed).toBe(true);
    });

    it('allows a contact one send below the daily cap', async () => {
      await setEmailRule(2, 0);
      const contactId = await makeContact('one-below');
      // Explicitly in the past. With sent_at defaulting to the DATABASE clock,
      // a row can land a millisecond after the JS `now` canSend computed, and
      // `cooldownHours: 0` then reads as "sent in the future" and reports a
      // cooldown. That is a real sharp edge in canSend, not something the
      // fixture should paper over — but it is not what this test is about.
      await db
        .insert(contactSendLog)
        .values({ orgId, contactId, channel: 'email', sentAt: minutesAgo(30) });
      const res = await canSend(orgId, contactId, 'email');
      expect(res.allowed).toBe(true);
    });

    it('refuses a contact at the daily cap, and says which cap', async () => {
      await setEmailRule(2, 0);
      const contactId = await makeContact('at-cap');
      await db.insert(contactSendLog).values([
        { orgId, contactId, channel: 'email', sentAt: minutesAgo(30) },
        { orgId, contactId, channel: 'email', sentAt: minutesAgo(20) },
      ]);
      const res = await canSend(orgId, contactId, 'email');
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe('daily_cap');
    });

    it('counts only the channel asked about', async () => {
      await setEmailRule(2, 0);
      // Two SMS sends must not cap the email channel — the query filters on
      // `channel`, and a broken filter would look like a working cap.
      const contactId = await makeContact('other-channel');
      await db.insert(contactSendLog).values([
        { orgId, contactId, channel: 'sms', sentAt: minutesAgo(30) },
        { orgId, contactId, channel: 'sms', sentAt: minutesAgo(20) },
      ]);
      expect((await canSend(orgId, contactId, 'email')).allowed).toBe(true);
    });

    it('ignores sends older than the window', async () => {
      await setEmailRule(2, 0);
      const contactId = await makeContact('old-sends');
      const old = new Date(Date.now() - 40 * 86_400_000);
      await db.insert(contactSendLog).values([
        { orgId, contactId, channel: 'email', sentAt: old },
        { orgId, contactId, channel: 'email', sentAt: old },
      ]);
      // The daily window is what the Date parameters select. If those had not
      // been encoded, this query is the one that threw.
      expect((await canSend(orgId, contactId, 'email')).allowed).toBe(true);
    });
  });

  // ── hasContactConverted ───────────────────────────────────────────────────
  describe('hasContactConverted', () => {
    it('is false for a contact with no matching event', async () => {
      const contactId = await makeContact('no-conv');
      const since = new Date(Date.now() - 86_400_000);
      expect(await hasContactConverted({ orgId, contactId, eventName: 'purchase', since })).toBe(
        false,
      );
    });

    it('is true once the contact has the event after `since`', async () => {
      const contactId = await makeContact('converted');
      await db.insert(workflowEvents).values({ orgId, contactId, eventName: 'purchase' });
      const since = new Date(Date.now() - 86_400_000);
      expect(await hasContactConverted({ orgId, contactId, eventName: 'purchase', since })).toBe(
        true,
      );
    });

    it('is false when the event predates `since`', async () => {
      // The `since` bound is the Date parameter that used to throw, so a test
      // that never exercises the boundary would not have caught the bug.
      const contactId = await makeContact('converted-earlier');
      await db.insert(workflowEvents).values({
        orgId,
        contactId,
        eventName: 'purchase',
        createdAt: new Date(Date.now() - 10 * 86_400_000),
      });
      const since = new Date(Date.now() - 86_400_000);
      expect(await hasContactConverted({ orgId, contactId, eventName: 'purchase', since })).toBe(
        false,
      );
    });

    it('does not match a different event name', async () => {
      const contactId = await makeContact('other-event');
      await db.insert(workflowEvents).values({ orgId, contactId, eventName: 'signup' });
      const since = new Date(Date.now() - 86_400_000);
      expect(await hasContactConverted({ orgId, contactId, eventName: 'purchase', since })).toBe(
        false,
      );
    });
  });

  // ── getContactSendHour ────────────────────────────────────────────────────
  describe('getContactSendHour', () => {
    /** An open at a given UTC hour, `daysAgo` in the past. */
    async function openAt(contactId: string, hourUtc: number, daysAgo: number) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - daysAgo);
      d.setUTCHours(hourUtc, 0, 0, 0);
      await db.insert(emailEvents).values({
        orgId,
        contactId,
        eventType: 'open',
        createdAt: d,
      });
    }

    it('returns no hour for a contact with no history', async () => {
      const contactId = await makeContact('sto-empty');
      const res = await getContactSendHour(orgId, contactId);
      expect(res.sampleSize).toBe(0);
      expect(res.peakHour).toBeNull();
    });

    it('returns the hour the contact actually opens at', async () => {
      const contactId = await makeContact('sto-peak');
      // Nine opens at 14:00 UTC against one at 03:00 — the peak is unambiguous.
      for (let i = 1; i <= 9; i++) await openAt(contactId, 14, i);
      await openAt(contactId, 3, 2);

      const res = await getContactSendHour(orgId, contactId);
      expect(res.peakHour).toBe(14);
      expect(res.sampleSize).toBe(10);
      expect(res.confidence).toBeGreaterThan(0);
    });

    it('ignores opens outside the lookback window', async () => {
      // 400 days back is beyond any sane lookback; the cutoff is the Date
      // parameter that used to throw.
      const contactId = await makeContact('sto-old');
      await openAt(contactId, 9, 400);
      const res = await getContactSendHour(orgId, contactId);
      expect(res.sampleSize).toBe(0);
    });
  });

  // ── the four routes ───────────────────────────────────────────────────────
  describe('routes that answered 500', () => {
    const get = (url: string) => app.inject({ method: 'GET', url, headers: { cookie } });

    it.each([
      ['/api/v1/newsletter-analytics/growth', 'array'],
      ['/api/v1/newsletter-analytics/engagement', 'array'],
      ['/api/v1/newsletter-analytics/overview', 'object'],
    ])('%s answers with data, not 500', async (url, shape) => {
      const res = await get(url);
      expect(res.statusCode).toBe(200);
      const body = res.json() as { data: unknown };
      // growth and engagement return the raw rows; overview returns a summary
      // object. Asserting the shape keeps this from passing on `{ data: null }`.
      if (shape === 'array') expect(Array.isArray(body.data)).toBe(true);
      else expect(typeof body.data).toBe('object');
      expect(body.data).not.toBeNull();
    });

    it('GET /marketing-calendar answers with an array of entries', async () => {
      const res = await get(
        '/api/v1/marketing-calendar?from=2026-01-01T00:00:00.000Z&to=2026-12-31T00:00:00.000Z',
      );
      expect(res.statusCode).toBe(200);
      expect(Array.isArray((res.json() as { data: unknown[] }).data)).toBe(true);
    });

    it('the internal frequency route answers, so batch-sender does not fail open', async () => {
      // This is the one that mattered most: batch-sender reads a non-2xx here
      // as "nobody is capped" and sends to everyone.
      const contactId = await makeContact('freq-route');
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/internal/frequency/check-batch',
        headers: { 'x-internal-secret': env.INTERNAL_API_SECRET ?? '' },
        payload: { orgId, contactIds: [contactId], channel: 'email' },
      });
      expect(res.statusCode).toBe(200);
      expect((res.json() as { data: { capped: string[] } }).data.capped).toEqual([]);
    });

    it('and it reports a capped contact rather than an empty list', async () => {
      const contactId = await makeContact('freq-capped');
      await db.insert(smartSendingRules).values({
        orgId,
        channel: 'push',
        maxPerDay: 1,
        maxPerWeek: 50,
        cooldownHours: 0,
        enabled: true,
      });
      await db.insert(contactSendLog).values({ orgId, contactId, channel: 'push' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/internal/frequency/check-batch',
        headers: { 'x-internal-secret': env.INTERNAL_API_SECRET ?? '' },
        payload: { orgId, contactIds: [contactId], channel: 'push' },
      });
      expect(res.statusCode).toBe(200);
      expect((res.json() as { data: { capped: string[] } }).data.capped).toEqual([contactId]);

      await db
        .delete(smartSendingRules)
        .where(and(eq(smartSendingRules.orgId, orgId), eq(smartSendingRules.channel, 'push')));
    });
  });
});
