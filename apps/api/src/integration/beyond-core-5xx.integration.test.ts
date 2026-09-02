/**
 * Four routes behind FEATURE_BEYOND_CORE that answered 5xx.
 *
 * Every one of them was in integration/route-smoke/known-failures.ts, which is
 * an honest list but a thin one: it records that a GET returns 5xx, not what
 * the route should have returned instead. So "it stopped 500ing" is not the
 * assertion here. Each case plants known rows and checks the arithmetic or the
 * status the handler was always supposed to produce — the same standard
 * missing-columns.integration.test.ts sets, and for the same reason. A query
 * that silently sums nothing also stops 500ing.
 *
 * The two loyalty aggregates are the sharp case. `abs(sum(points)) FILTER (…)`
 * and `abs(sum(points) FILTER (…))` differ by one bracket, both look right at a
 * glance, and only one of them is a legal aggregate — but a repair that dropped
 * the FILTER entirely would ALSO stop the 500 and would return the sum of every
 * transaction type. So the fixtures deliberately mix earn, bonus, redeem,
 * expire, adjust and refund rows, and the expected numbers are only reachable
 * if the filters survived.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  organizations,
  contacts,
  emailEvents,
  blogPosts,
  blogPostRevisions,
} from '../db/schema/index.js';
import { loyaltyPrograms } from '../db/schema/loyalty-programs.js';
import { loyaltyMembers } from '../db/schema/loyalty-members.js';
import { loyaltyPoints } from '../db/schema/loyalty-points.js';
import { signupCohorts } from '../services/cohort/index.js';

let app: FastifyInstance;
let session: Session;

const tag = randomUUID().slice(0, 8);
/** Orgs created here and torn down whole. Never the seed org. */
const orgIds: string[] = [];

/**
 * The loyalty and blog fixtures live in the SESSION's org, not in one of our
 * own, and that is deliberate.
 *
 * `getProgramStats(orgId, …)` scopes on the caller's org, so a fixture planted
 * elsewhere reads as zero and the arithmetic assertions would pass against an
 * empty result — the exact failure mode this file is written to avoid. The blog
 * routes scope the same way and answer POST_NOT_FOUND.
 *
 * `getLedgerSummary(memberId)` does NOT scope, which is a separate defect (see
 * the note on the ledger case below); planting in the session org means these
 * tests do not depend on it either way.
 *
 * So the rows are created under `session.orgId` and removed by id in afterAll,
 * rather than by dropping an org.
 */
let orgId: string;
let programId: string;
let memberId: string;
let contactId: string;
const cleanup = { programIds: [] as string[], contactIds: [] as string[], postIds: [] as string[] };

/**
 * The ledger under test. Chosen so that a query which forgot its FILTER cannot
 * accidentally produce the same numbers:
 *
 *   earned   = 100 + 50 (bonus) + 25 (refund) = 175
 *   redeemed = |-60| + |-15|                  = 75
 *   expired  = |-30|                          = 30
 *   adjusted = -5
 *
 * The raw sum of every row is 100+50+25-60-15-30-5 = 65, which matches none of
 * them, and `abs(sum(all))` is 65 too. Any bracket mistake shows up as a wrong
 * number rather than as a pass.
 */
const LEDGER: Array<{
  type: 'earn' | 'bonus' | 'refund' | 'redeem' | 'expire' | 'adjust';
  points: number;
}> = [
  { type: 'earn', points: 100 },
  { type: 'bonus', points: 50 },
  { type: 'refund', points: 25 },
  { type: 'redeem', points: -60 },
  { type: 'redeem', points: -15 },
  { type: 'expire', points: -30 },
  { type: 'adjust', points: -5 },
];

const EXPECTED = { earned: 175, redeemed: 75, expired: 30, adjusted: -5, count: LEDGER.length };

interface Overview {
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  totalPointsExpired: number;
}
let baseline: Overview;

async function readOverview(): Promise<Overview> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/loyalty/programs/${programId}/analytics/overview`,
    headers: { cookie: session.cookie },
    remoteAddress: '203.0.113.10',
  });
  if (res.statusCode !== 200) {
    throw new Error(`overview ${res.statusCode}: ${res.body}`);
  }
  return res.json().data as Overview;
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);

  orgId = session.orgId;

  const [c] = await db
    .insert(contacts)
    .values({ orgId, email: `loyal-${tag}@test.local`, status: 'active' })
    .returning({ id: contacts.id });
  contactId = c!.id;
  cleanup.contactIds.push(contactId);

  const [prog] = await db
    .insert(loyaltyPrograms)
    .values({ orgId, name: `prog ${tag}` })
    .returning({ id: loyaltyPrograms.id });
  programId = prog!.id;
  cleanup.programIds.push(programId);

  const [member] = await db
    .insert(loyaltyMembers)
    .values({ orgId, programId, contactId, pointBalance: 65 })
    .returning({ id: loyaltyMembers.id });
  memberId = member!.id;

  // `getProgramStats` aggregates loyalty_points across the WHOLE org, not just
  // this program, so the overview assertions are deltas: whatever the org held
  // before, our ledger must move it by exactly the amounts below. Absolute
  // numbers would pass today (the seed org has no points) and break the day
  // another suite plants some.
  baseline = await readOverview();

  let running = 0;
  await db.insert(loyaltyPoints).values(
    LEDGER.map((row) => {
      running += row.points;
      return {
        orgId,
        memberId,
        type: row.type,
        points: row.points,
        balanceAfter: running,
      };
    }),
  );
}, 60_000);

afterAll(async () => {
  // Rows planted in the seed org go by id. loyalty_members / loyalty_points
  // cascade from the program, blog_post_revisions from the post.
  if (cleanup.postIds.length > 0) {
    await db.delete(blogPosts).where(inArray(blogPosts.id, cleanup.postIds));
  }
  if (cleanup.programIds.length > 0) {
    await db.delete(loyaltyPrograms).where(inArray(loyaltyPrograms.id, cleanup.programIds));
  }
  if (cleanup.contactIds.length > 0) {
    await db.delete(contacts).where(inArray(contacts.id, cleanup.contactIds));
  }
  // Orgs this file created outright (the cohort fixture) go whole.
  if (orgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

// ─── 1 + 2. The two loyalty aggregates ──────────────────────────────────────

describe('loyalty aggregates — FILTER belongs to sum(), not to abs()', () => {
  it('GET .../analytics/overview returns 200 and the points add up', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/loyalty/programs/${programId}/analytics/overview`,
      headers: { cookie: session.cookie },
      remoteAddress: '203.0.113.11',
    });

    // Before the fix: 500, `FILTER specified, but abs is not an aggregate
    // function`, reproduced directly in psql against forgemsg_itest2.
    expect(res.statusCode, res.body).toBe(200);

    const data = res.json().data as Overview;
    // `issued` counts earn+bonus but NOT refund, per the query's own filter,
    // so 100 + 50 rather than the 175 the ledger summary reports.
    expect(data.totalPointsIssued - baseline.totalPointsIssued).toBe(150);
    expect(
      data.totalPointsRedeemed - baseline.totalPointsRedeemed,
      'redeemed must be |−60| + |−15|',
    ).toBe(75);
    expect(data.totalPointsExpired - baseline.totalPointsExpired, 'expired must be |−30|').toBe(30);
  });

  it('GET .../ledger/summary returns 200 and every bucket is right', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/loyalty/programs/${programId}/members/${memberId}/ledger/summary`,
      headers: { cookie: session.cookie },
      remoteAddress: '203.0.113.12',
    });

    expect(res.statusCode, res.body).toBe(200);

    const data = res.json().data as {
      totalEarned: number;
      totalRedeemed: number;
      totalExpired: number;
      totalAdjusted: number;
      transactionCount: number;
    };
    expect(data.totalEarned, 'earn + bonus + refund').toBe(EXPECTED.earned);
    expect(data.totalRedeemed).toBe(EXPECTED.redeemed);
    expect(data.totalExpired).toBe(EXPECTED.expired);
    expect(data.totalAdjusted).toBe(EXPECTED.adjusted);
    expect(data.transactionCount).toBe(EXPECTED.count);
  });

  it('the numbers are not the undifferentiated sum, so the filters survived', () => {
    const rawSum = LEDGER.reduce((n, r) => n + r.points, 0);
    expect(rawSum).toBe(65);
    for (const v of [EXPECTED.earned, EXPECTED.redeemed, EXPECTED.expired]) {
      expect(v, 'a filterless repair would return the raw sum').not.toBe(Math.abs(rawSum));
    }
  });
});

// ─── 3. Cohorts ─────────────────────────────────────────────────────────────

describe('analytics/cohorts — INTERVAL cannot take a bind parameter', () => {
  it('GET /api/v1/analytics/cohorts returns 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/cohorts',
      headers: { cookie: session.cookie },
      remoteAddress: '203.0.113.13',
    });
    // Before: 500, `syntax error at or near "$5"` — EXTRACT(EPOCH FROM
    // INTERVAL $5). Behind it, `GROUP BY offset` on a reserved word.
    expect(res.statusCode, res.body).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });

  it('both period modes plan and run — the week branch is a separate statement', async () => {
    for (const period of ['week', 'month'] as const) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/analytics/cohorts?period=${period}`,
        headers: { cookie: session.cookie },
        remoteAddress: '203.0.113.14',
      });
      expect(res.statusCode, `${period}: ${res.body}`).toBe(200);
    }
  });

  /**
   * The offset arithmetic, checked against rows placed on purpose.
   *
   * This is the part a "make it stop crashing" fix would get wrong. The old
   * expression divided epochs, which treats every month as 30 days; the contact
   * below engages in the month directly after its signup month, and with epoch
   * division a 31-day gap lands at 1.03 rather than 1. Here it must be exactly
   * offset 1, and the cohort must have exactly one member.
   */
  it('places engagement in the right period column', async () => {
    const [org2] = await db
      .insert(organizations)
      .values({ name: `coh ${tag}`, slug: `coh-${tag}` })
      .returning({ id: organizations.id });
    orgIds.push(org2!.id);

    // A signup in a 31-day month, and engagement in the following month.
    const signup = new Date(Date.UTC(2026, 0, 5)); // 5 Jan (Jan has 31 days)
    const engaged = new Date(Date.UTC(2026, 1, 9)); // 9 Feb -> exactly 1 month later

    const [c2] = await db
      .insert(contacts)
      .values({
        orgId: org2!.id,
        email: `coh-${tag}@test.local`,
        status: 'active',
        createdAt: signup,
      })
      .returning({ id: contacts.id });

    await db.insert(emailEvents).values({
      orgId: org2!.id,
      contactId: c2!.id,
      eventType: 'open',
      createdAt: engaged,
    });

    const rows = await signupCohorts(org2!.id, { period: 'month', periods: 6 });
    const cohort = rows.find((r) => r.cohort === '2026-01-01');
    expect(cohort, `no January cohort in ${JSON.stringify(rows)}`).toBeDefined();
    expect(cohort!.size).toBe(1);
    expect(cohort!.retention[1], 'engagement one month later belongs in column 1').toBe(1);
    expect(cohort!.retention[2], 'and nowhere else').toBe(0);
  });
});

// ─── 4. Blog revisions ──────────────────────────────────────────────────────

describe('blog revisions — a thrown object literal is not an Error', () => {
  it('GET .../revisions on an unknown post answers 404, not 500', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/blog/posts/${randomUUID()}/revisions`,
      headers: { cookie: session.cookie },
      remoteAddress: '203.0.113.15',
    });
    expect(res.statusCode, res.body).toBe(404);
    expect(res.json().code, 'the original code must survive the fix').toBe('POST_NOT_FOUND');
  });

  it('GET .../revisions/{a}/diff/{b} on an unknown post answers 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/blog/posts/${randomUUID()}/revisions/1/diff/2`,
      headers: { cookie: session.cookie },
      remoteAddress: '203.0.113.16',
    });
    expect(res.statusCode, res.body).toBe(404);
    expect(res.json().code).toBe('POST_NOT_FOUND');
  });

  it('a real post still lists its revisions, and diffs two of them', async () => {
    const [post] = await db
      .insert(blogPosts)
      .values({
        orgId,
        title: `post ${tag}`,
        slug: `post-${tag}`,
        body: 'line one\nline two',
      })
      .returning({ id: blogPosts.id });
    cleanup.postIds.push(post!.id);

    // `version` is a varchar and the diff route matches it against the raw path
    // segment, so these are the strings the URL carries. The table has no
    // org_id — it is scoped through its post, which the route checks first.
    await db.insert(blogPostRevisions).values([
      { postId: post!.id, version: '1', title: `post ${tag}`, body: 'line one' },
      { postId: post!.id, version: '2', title: `post ${tag}`, body: 'line one\nline two' },
    ]);

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/blog/posts/${post!.id}/revisions`,
      headers: { cookie: session.cookie },
      remoteAddress: '203.0.113.17',
    });
    expect(list.statusCode, list.body).toBe(200);
    expect((list.json().data as unknown[]).length).toBe(2);

    const diff = await app.inject({
      method: 'GET',
      url: `/api/v1/blog/posts/${post!.id}/revisions/1/diff/2`,
      headers: { cookie: session.cookie },
      remoteAddress: '203.0.113.18',
    });
    expect(diff.statusCode, diff.body).toBe(200);
    // 'line one' -> 'line one\nline two': one line added, none removed, and the
    // title untouched. Asserted so the route is shown to still compute, not
    // merely to have stopped crashing.
    const d = diff.json().data as {
      vA: string;
      vB: string;
      titleChanged: boolean;
      bodyChangedLines: { added: number; removed: number };
      charDiff: number;
    };
    expect(d.vA).toBe('1');
    expect(d.vB).toBe('2');
    expect(d.titleChanged).toBe(false);
    expect(d.bodyChangedLines.added).toBe(1);
    expect(d.bodyChangedLines.removed).toBe(0);
    expect(d.charDiff).toBe('line one\nline two'.length - 'line one'.length);
  });

  it('an unknown revision on a real post answers 404 with its own code', async () => {
    const [post] = await db
      .insert(blogPosts)
      .values({
        orgId,
        title: `post2 ${tag}`,
        slug: `post2-${tag}`,
        body: 'x',
      })
      .returning({ id: blogPosts.id });
    cleanup.postIds.push(post!.id);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/blog/posts/${post!.id}/revisions/7/diff/9`,
      headers: { cookie: session.cookie },
      remoteAddress: '203.0.113.19',
    });
    expect(res.statusCode, res.body).toBe(404);
    expect(res.json().code).toBe('REVISION_NOT_FOUND');
  });
});
