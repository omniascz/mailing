/**
 * GET /api/v1/audit-logs?resourceId= returns one record's history, and only
 * from the caller's own organisation.
 *
 * The campaign page reads the pre-send gate's last decision from here. Without
 * a resourceId filter it read each action's 200 most recent entries for the
 * whole organisation and looked for the campaign among them, so in a busy org
 * a campaign's record fell off the end and the page showed nothing.
 *
 * The same resourceId is written into a second organisation's log on purpose:
 * an id names a record, not an organisation, and the filter must not reach
 * across.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { auditLogs, organizations, users } from '../db/schema/index.js';

let app: FastifyInstance;
let seed: Session;
let other: Session;
let otherOrgId: string;
let otherUserId: string;
const tag = randomUUID().slice(0, 8);
const target = randomUUID();
const seedOnly = randomUUID();

async function list(session: Session, query: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/audit-logs?${query}`,
    headers: { cookie: session.cookie },
  });
  expect(res.statusCode, res.body).toBe(200);
  return (
    res.json() as { data: Array<{ orgId: string; resourceId: string | null; action: string }> }
  ).data;
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  seed = await login(app);

  // A second organisation with its own owner, logging in with the seed password.
  const [o] = await db
    .insert(organizations)
    .values({ name: `audit filter ${tag}`, slug: `audit-filter-${tag}` })
    .returning({ id: organizations.id });
  otherOrgId = o!.id;
  const [seedUser] = await db
    .select({ hash: users.passwordHash })
    .from(users)
    .where(eq(users.id, seed.userId));
  const email = `audit-filter-${tag}@test.local`;
  const [u] = await db
    .insert(users)
    .values({
      orgId: otherOrgId,
      email,
      name: 'audit filter',
      passwordHash: seedUser!.hash,
      role: 'owner',
      emailVerified: true,
    })
    .returning({ id: users.id });
  otherUserId = u!.id;
  other = await login(app, email);

  const row = (orgId: string, resourceId: string, action: string) => ({
    orgId,
    action,
    resource: 'campaign',
    resourceId,
    metadata: { via: 'send', tag },
  });
  await db.insert(auditLogs).values([
    row(seed.orgId, target, 'campaign.deliverability_blocked'),
    row(seed.orgId, target, 'campaign.deliverability_override'),
    row(seed.orgId, seedOnly, 'campaign.deliverability_blocked'),
    ...Array.from({ length: 5 }, () =>
      row(seed.orgId, randomUUID(), 'campaign.deliverability_override'),
    ),
    // The same campaign id in another organisation's log.
    row(otherOrgId, target, 'campaign.deliverability_caution'),
  ]);
}, 60_000);

afterAll(async () => {
  // This file's rows only: other suites keep theirs.
  await db
    .delete(auditLogs)
    .where(
      and(
        inArray(auditLogs.orgId, [seed.orgId, otherOrgId]),
        sql`${auditLogs.metadata}->>'tag' = ${tag}`,
      ),
    )
    .catch(() => {});
  if (otherUserId) await db.delete(users).where(eq(users.id, otherUserId));
  if (otherOrgId) await db.delete(organizations).where(eq(organizations.id, otherOrgId));
  await app?.close();
});

describe('GET /api/v1/audit-logs?resourceId=', () => {
  it('returns that record only, from the caller’s organisation only', async () => {
    const mine = await list(seed, `resource=campaign&resourceId=${target}&limit=200`);
    console.log(
      `[z127] seed org, resourceId=target: ${JSON.stringify(mine.map((r) => [r.action, r.resourceId === target, r.orgId === seed.orgId]))}`,
    );
    expect(mine.map((r) => r.action).sort()).toEqual([
      'campaign.deliverability_blocked',
      'campaign.deliverability_override',
    ]);
    expect(mine.every((r) => r.resourceId === target && r.orgId === seed.orgId)).toBe(true);
  });

  it('combines with the action filter', async () => {
    const rows = await list(
      seed,
      `resource=campaign&resourceId=${target}&action=campaign.deliverability_override`,
    );
    expect(rows.map((r) => r.action)).toEqual(['campaign.deliverability_override']);
  });

  it('another organisation sees its own entry for the same id, and nothing of the seed org', async () => {
    const theirs = await list(other, `resource=campaign&resourceId=${target}`);
    const seedRecord = await list(other, `resource=campaign&resourceId=${seedOnly}`);
    console.log(
      `[z127] other org, resourceId=target: ${JSON.stringify(theirs.map((r) => [r.action, r.orgId === otherOrgId]))} resourceId=seedOnly: ${JSON.stringify(seedRecord)}`,
    );
    expect(theirs.map((r) => r.action)).toEqual(['campaign.deliverability_caution']);
    expect(theirs.every((r) => r.orgId === otherOrgId)).toBe(true);
    expect(seedRecord).toEqual([]);
  });
});
