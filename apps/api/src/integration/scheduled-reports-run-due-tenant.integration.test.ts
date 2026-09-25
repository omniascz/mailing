/**
 * Running due reports dispatches the caller's own, not every tenant's.
 *
 * ─── What went wrong ─────────────────────────────────────────────────────────
 *
 * `POST /api/v1/scheduled-reports/run-due` is reachable by any organization's
 * admin or owner and called `runDueReports()`, which selected every enabled
 * report whose `next_run_at` had passed, across all orgs. One press then:
 *
 *   1. rendered each of those reports — `org_overview` renders that org's own
 *      daily stats — and emailed the result to that org's recipients;
 *   2. advanced their `last_run_at` / `next_run_at`, so the tenant's own
 *      scheduled run was silently skipped;
 *   3. returned the rendered HTML of all of them in the response body, to the
 *      caller.
 *
 * So the leak went both ways: other tenants' reports went out over our name,
 * and their contents came back to whoever pressed the button.
 *
 * ─── Why scoping and not moving it ───────────────────────────────────────────
 *
 * Unlike the RSS route this pattern comes from (#167), the platform-wide sweep
 * already has a home: `POST /api/v1/internal/scheduled-reports/run-due` runs
 * hourly behind INTERNAL_API_SECRET. So the customer route is scoped to
 * `req.user.orgId` and the cron keeps crossing organizations — through
 * `runAllDueReports`, a different name, so the two audiences cannot be mixed up
 * by omitting an argument.
 *
 * ─── How this is asserted ────────────────────────────────────────────────────
 *
 * Over org B's row, field by field, and over what would have been sent: the
 * response body is the list of what was rendered and emailed, so org B's report
 * name and recipient address must not appear anywhere in it. The case that must
 * pass runs next — the caller's own report has to be dispatched — and the
 * internal cron is exercised afterwards to prove the platform sweep still does
 * cross organizations.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { scheduledReports } from '../db/schema/scheduled-reports.js';

const SECRET = process.env.INTERNAL_API_SECRET;

let app: FastifyInstance;
let orgA: string;
let orgB: string;
let tokenA: string;
let reportA: string;
let reportB: string;

const tag = randomUUID().slice(0, 8);
const NAME_B = `OrgB only report ${tag}`;
const RECIPIENT_B = `orgb-recipient-${tag}@tenant.test`;
const NAME_A = `OrgA own report ${tag}`;
const RECIPIENT_A = `orga-recipient-${tag}@tenant.test`;

async function registerOrg(label: string): Promise<{ orgId: string; token: string }> {
  const t = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress: `198.51.109.${Math.floor(Math.random() * 200) + 30}`,
    payload: {
      email: `rep-${t}@example.test`,
      password: 'RepTenant1234!',
      name: 'Rep Tenant',
      orgName: `Rep Tenant ${t}`,
    },
  });
  if (res.statusCode !== 201 && res.statusCode !== 200) {
    throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  }
  const body = res.json() as { token?: string; user?: { orgId?: string } };
  if (!body.user?.orgId || !body.token) throw new Error(`register gave no org/token: ${res.body}`);
  return { orgId: body.user.orgId, token: body.token };
}

/** A report that is due: next_run_at in the past, enabled. */
async function makeDueReport(orgId: string, name: string, recipient: string): Promise<string> {
  const [row] = await db
    .insert(scheduledReports)
    .values({
      orgId,
      name,
      reportType: 'org_overview',
      params: { days: 7 },
      recipients: [recipient],
      frequency: 'weekly',
      nextRunAt: new Date(Date.now() - 60_000),
      enabled: true,
    })
    .returning({ id: scheduledReports.id });
  return row!.id;
}

const reportRow = (id: string) =>
  db.select().from(scheduledReports).where(eq(scheduledReports.id, id)).limit(1);

beforeAll(async () => {
  app = await createTestApp();
  const a = await registerOrg('a');
  const b = await registerOrg('b');
  orgA = a.orgId;
  tokenA = a.token;
  orgB = b.orgId;
  reportA = await makeDueReport(orgA, NAME_A, RECIPIENT_A);
  reportB = await makeDueReport(orgB, NAME_B, RECIPIENT_B);
}, 120_000);

afterAll(async () => {
  // Leave no due reports behind: the internal cron in other suites would pick
  // them up and this file's fixtures would show up as somebody else's noise.
  await db.delete(scheduledReports).where(eq(scheduledReports.id, reportA));
  await db.delete(scheduledReports).where(eq(scheduledReports.id, reportB));
  await app?.close();
});

describe('run-due dispatches only the caller’s organization', () => {
  it('leaves org B’s report row untouched and its content out of the response', async () => {
    const before = (await reportRow(reportB))[0];
    expect(before, 'fixture missing: org B has no report').toBeDefined();
    expect(before!.lastRunAt, 'fixture has already run').toBeNull();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-reports/run-due',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200);

    // The row first — the defect was a dispatch that moved somebody else's
    // schedule.
    expect(
      (await reportRow(reportB))[0],
      "org A's run-due dispatched org B's report: last_run_at and next_run_at moved, so org B's " +
        'own scheduled run is now skipped',
    ).toEqual(before);

    // And what would have been sent. The response body is the list of rendered
    // reports, so org B's name and recipient may not be in it.
    expect(
      res.body.includes(NAME_B),
      "org B's rendered report came back in org A's response body",
    ).toBe(false);
    expect(res.body.includes(RECIPIENT_B), "org B's recipient address was disclosed").toBe(false);

    const dispatched = (res.json() as { data: Array<{ reportId: string }> }).data;
    expect(
      dispatched.map((d) => d.reportId),
      'the response names reports outside the caller’s org',
    ).not.toContain(reportB);
  }, 120_000);

  it('still dispatches the caller’s own due report', async () => {
    // A fresh one: the case above already ran org A's first report, which is
    // precisely what it is supposed to do, so this cannot reuse it.
    const secondName = `OrgA second report ${tag}`;
    const second = await makeDueReport(orgA, secondName, RECIPIENT_A);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-reports/run-due',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200);

    const dispatched = (
      res.json() as { data: Array<{ reportId: string; recipients: number; rendered: string }> }
    ).data;
    const mine = dispatched.find((d) => d.reportId === second);
    expect(mine, 'the org’s own run-due stopped dispatching its due report').toBeDefined();
    expect(mine!.recipients).toBe(1);
    expect(mine!.rendered).toContain(secondName);
    expect(
      dispatched.every((d) => d.reportId !== reportB),
      'a second run reached org B after all',
    ).toBe(true);

    const [after] = await reportRow(second);
    expect(after!.lastRunAt, 'the schedule did not advance').toBeInstanceOf(Date);
    expect(after!.nextRunAt.getTime()).toBeGreaterThan(Date.now());

    await db.delete(scheduledReports).where(eq(scheduledReports.id, second));
  }, 120_000);
});

describe('negative control — the platform sweep still crosses organizations', () => {
  it('the internal cron dispatches org B’s report', async () => {
    expect(SECRET, 'INTERNAL_API_SECRET is not set in this environment').toBeTruthy();
    const before = (await reportRow(reportB))[0];
    expect(before!.lastRunAt, 'org B’s report has already run').toBeNull();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/scheduled-reports/run-due',
      headers: { 'x-internal-secret': SECRET! },
    });
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200);

    const [after] = await reportRow(reportB);
    expect(
      after!.lastRunAt,
      'the hourly cron no longer dispatches reports it is supposed to dispatch',
    ).toBeInstanceOf(Date);
    expect(after!.nextRunAt.getTime()).toBeGreaterThan(before!.nextRunAt.getTime());
  }, 120_000);

  it('the internal cron refuses without the secret, and dispatches nothing', async () => {
    const third = await makeDueReport(orgB, `OrgB second ${tag}`, RECIPIENT_B);
    const before = (await reportRow(third))[0];

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/scheduled-reports/run-due',
    });
    expect(res.statusCode).toBe(401);
    expect((await reportRow(third))[0]).toEqual(before);

    await db.delete(scheduledReports).where(eq(scheduledReports.id, third));
  }, 120_000);
});
