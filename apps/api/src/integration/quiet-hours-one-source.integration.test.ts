/**
 * Quiet hours: what the user sets is what the sender obeys.
 *
 * There were two independent authorities for one rule, and they pointed in
 * opposite directions:
 *
 *   - the `quiet_hours` table — has a PUT route, is what `/quiet-hours` in the
 *     dashboard displays, and the send path never read it
 *   - `org_frequency_rules.quiet_hours_start/_end` — the send path DID read
 *     these, and no HTTP route could set them: the Zod schema on
 *     PUT /api/v1/frequency-rules accepts only { channel, maxCount,
 *     periodHours }
 *
 * So the enforced setting was unreachable and the reachable setting was
 * unenforced. On top of that, the enforced one was checked inside the
 * per-rule loop, AFTER an early `rules.length === 0 → allowed`, so quiet hours
 * applied only to an org that had also configured a frequency cap.
 *
 * The tests drive the real path the worker uses —
 * POST /api/v1/internal/frequency/check-batch, the endpoint batch-sender.ts
 * calls — after setting the window through the route a user actually has.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations, contacts, quietHours } from '../db/schema/index.js';
import { checkFrequencyCap } from '../services/frequency-capping/index.js';

let app: FastifyInstance;
let session: Session;
const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];

let addr = 0;
const nextAddress = () => `198.51.100.${(addr = (addr % 200) + 1)}`;

async function makeOrg(label: string): Promise<string> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `qh ${label} ${tag}`, slug: `qh-${label}-${tag}` })
    .returning({ id: organizations.id });
  orgIds.push(org!.id);
  return org!.id;
}

async function makeContact(orgId: string, label: string): Promise<string> {
  const [c] = await db
    .insert(contacts)
    .values({ orgId, email: `${label}-${tag}@example.test`, status: 'active' })
    .returning({ id: contacts.id });
  return c!.id;
}

/** The internal endpoint batch-sender.ts calls for every broadcast batch. */
async function checkBatch(orgId: string, contactIds: string[], channel = 'email') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/internal/frequency/check-batch',
    payload: { orgId, contactIds, channel },
    headers: { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' },
    remoteAddress: nextAddress(),
  });
  return res;
}

/**
 * A window that definitely contains "now", expressed in UTC so the assertion
 * does not depend on the machine's clock. `startHour` = this hour,
 * `endHour` = an hour from now.
 */
function windowAroundNow(): { startHour: number; endHour: number } {
  const h = new Date().getUTCHours();
  return { startHour: h, endHour: (h + 1) % 24 };
}

/** A window that definitely does NOT contain "now". */
function windowAwayFromNow(): { startHour: number; endHour: number } {
  const h = new Date().getUTCHours();
  return { startHour: (h + 2) % 24, endHour: (h + 3) % 24 };
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
}, 60_000);

afterAll(async () => {
  if (orgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

describe('the window a user can set is the window the sender obeys', () => {
  it('a quiet window set through PUT /quiet-hours blocks the send', async () => {
    const orgId = session.orgId;
    const contactId = await makeContact(orgId, 'inquiet');
    const w = windowAroundNow();

    // The only route a user has for this. It writes `quiet_hours`, which the
    // send path did not read.
    const put = await app.inject({
      method: 'PUT',
      url: '/api/v1/quiet-hours',
      payload: { channel: 'all', ...w, timezone: 'UTC', enabled: true },
      headers: { cookie: session.cookie },
      remoteAddress: nextAddress(),
    });
    expect(put.statusCode, put.body).toBe(200);

    const res = await checkBatch(orgId, [contactId]);
    expect(res.statusCode, res.body).toBe(200);
    expect(
      res.json().data.capped,
      'the contact must be held back during the window the user set',
    ).toContain(contactId);

    await db.delete(quietHours).where(eq(quietHours.orgId, orgId));
  }, 60_000);

  it('outside the window the same contact goes through', async () => {
    // #86: a fix that blocks everything passes every test about blocking.
    const orgId = session.orgId;
    const contactId = await makeContact(orgId, 'outquiet');
    const w = windowAwayFromNow();

    const put = await app.inject({
      method: 'PUT',
      url: '/api/v1/quiet-hours',
      payload: { channel: 'all', ...w, timezone: 'UTC', enabled: true },
      headers: { cookie: session.cookie },
      remoteAddress: nextAddress(),
    });
    expect(put.statusCode, put.body).toBe(200);

    const res = await checkBatch(orgId, [contactId]);
    expect(res.json().data.capped, 'nobody is quiet right now').not.toContain(contactId);

    await db.delete(quietHours).where(eq(quietHours.orgId, orgId));
  }, 60_000);

  it('an org with NO frequency rule still gets its quiet hours', async () => {
    // The old check lived inside the per-rule loop, behind an early
    // `rules.length === 0 → allowed`, so a quiet window only applied to an org
    // that had also configured a frequency cap. Nothing about "be quiet at
    // night" implies "cap my volume".
    const orgId = await makeOrg('norule');
    const contactId = await makeContact(orgId, 'norule');
    const w = windowAroundNow();
    await db.insert(quietHours).values({ orgId, channel: 'all', ...w, timezone: 'UTC' });

    const out = await checkFrequencyCap({ orgId, contactId, channel: 'email' });
    expect(out.allowed, 'quiet hours do not require a frequency rule').toBe(false);
  }, 60_000);

  it('a disabled window does not block', async () => {
    const orgId = await makeOrg('disabled');
    const contactId = await makeContact(orgId, 'disabled');
    const w = windowAroundNow();
    await db
      .insert(quietHours)
      .values({ orgId, channel: 'all', ...w, timezone: 'UTC', enabled: false });

    const out = await checkFrequencyCap({ orgId, contactId, channel: 'email' });
    expect(out.allowed, '`enabled: false` is a setting, not decoration').toBe(true);
  }, 60_000);
});

describe('the reason is recorded, not swallowed', () => {
  it('a blocked send says quiet_hours, not a bare "capped"', async () => {
    const orgId = await makeOrg('reason');
    const contactId = await makeContact(orgId, 'reason');
    const w = windowAroundNow();
    await db.insert(quietHours).values({ orgId, channel: 'all', ...w, timezone: 'UTC' });

    const out = await checkFrequencyCap({ orgId, contactId, channel: 'email' });
    expect(out.allowed).toBe(false);
    // Reporting has to be able to split "we hit the cap" from "we waited
    // politely"; a silent skip loses that distinction entirely.
    expect(out.reason).toBe('quiet_hours');
  }, 60_000);

  it('a per-channel window beats the "all" fallback', async () => {
    const orgId = await makeOrg('perch');
    const contactId = await makeContact(orgId, 'perch');
    const now = windowAroundNow();
    const away = windowAwayFromNow();

    // Quiet for SMS right now, not for email.
    await db.insert(quietHours).values({ orgId, channel: 'all', ...away, timezone: 'UTC' });
    await db.insert(quietHours).values({ orgId, channel: 'sms', ...now, timezone: 'UTC' });

    expect((await checkFrequencyCap({ orgId, contactId, channel: 'sms' })).allowed).toBe(false);
    expect((await checkFrequencyCap({ orgId, contactId, channel: 'email' })).allowed).toBe(true);
  }, 60_000);
});

describe('the second authority is gone', () => {
  it('org_frequency_rules no longer carries a quiet window', async () => {
    // The columns are dropped rather than merely ignored. Leaving them would
    // leave a second place that reads like configuration and changes nothing —
    // which is the shape of the bug being fixed, not a smaller version of it.
    const cols = await db.execute<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'org_frequency_rules'` as never,
    );
    const rows =
      (cols as unknown as { rows?: Array<{ column_name: string }> }).rows ??
      (cols as unknown as Array<{ column_name: string }>);
    const names = rows.map((r) => r.column_name);
    expect(names).not.toContain('quiet_hours_start');
    expect(names).not.toContain('quiet_hours_end');
    // The cap itself is untouched.
    expect(names).toContain('max_count');
    expect(names).toContain('period_hours');
  }, 60_000);
});
