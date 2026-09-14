/**
 * A database constraint is the caller's problem, not a crash.
 *
 * The error handler mapped nothing from Postgres: every constraint violation
 * fell through to `{ code: 'INTERNAL_ERROR', statusCode: 500 }`. There are 153
 * non-primary-key unique indexes and 407 foreign keys in this schema against
 * seventeen places that check first and raise AppError.conflict themselves, so
 * "the insert just fails" is the normal path, not the exception — and what the
 * caller saw was a 500 that says nothing and looks like our fault.
 *
 * ─── The vehicle ─────────────────────────────────────────────────────────────
 *
 * POST /api/v1/sms/keywords inserts straight into sms_keywords, which is unique
 * on (org_id, keyword) and has a foreign key on list_id, with no pre-check of
 * either (services/sms-keywords/index.ts:24). Nothing about that route changes
 * in this round; it is used because it reaches the mapping honestly.
 *
 * ─── What must not appear in the answer ──────────────────────────────────────
 *
 * Measured shapes of the errors being mapped:
 *
 *   23505  detail = `Key (org_id, keyword)=(3f03…, HELP) already exists.`
 *   23502  detail = the entire failing row
 *
 * So each case below asserts not only the status but that the constraint name,
 * the table name and the submitted value are absent from the body.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { smsKeywords } from '../db/schema/index.js';
import { createTestApp, login, type Session } from './setup/harness.js';

const tag = randomUUID().slice(0, 6);
const KEYWORD = `ZZ${tag}`.toUpperCase();

let app: FastifyInstance;
let caller: Session;

const createKeyword = async (payload: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/sms/keywords',
    headers: { cookie: caller.cookie },
    payload,
  });

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  caller = await login(app);
}, 120_000);

afterAll(async () => {
  await db.delete(smsKeywords).where(eq(smsKeywords.orgId, caller.orgId));
  await app?.close();
}, 120_000);

describe('database constraints reach the caller as constraints', () => {
  it('a unique collision is a 409, and says nothing about the constraint', async () => {
    // First: must succeed and must write — otherwise the 409 below could just
    // as well mean the route is broken.
    const first = await createKeyword({ keyword: KEYWORD, action: 'info', reply: 'ahoj' });
    expect(first.statusCode, `body: ${first.body}`).toBe(201);

    const rows = await db.select().from(smsKeywords).where(eq(smsKeywords.orgId, caller.orgId));
    expect(rows.filter((r) => r.keyword === KEYWORD)).toHaveLength(1);

    const second = await createKeyword({ keyword: KEYWORD, action: 'info', reply: 'ahoj' });
    expect(second.statusCode, `body: ${second.body}`).toBe(409);
    expect(second.json()).toMatchObject({ code: 'CONFLICT', statusCode: 409 });

    // Nothing from the database error may be in there: not the constraint, not
    // the table, not the value the caller sent.
    const body = second.body;
    expect(body).not.toContain('sms_keywords_org_kw_uq');
    expect(body).not.toContain('sms_keywords');
    expect(body).not.toContain(KEYWORD);
    expect(body).not.toContain('Key (');

    // And the row is still the one the first request wrote.
    const after = await db.select().from(smsKeywords).where(eq(smsKeywords.orgId, caller.orgId));
    expect(after.filter((r) => r.keyword === KEYWORD)).toHaveLength(1);
  });

  it('a reference to a row that does not exist is a 400, not a 500', async () => {
    const res = await createKeyword({
      keyword: `FK${tag}`.toUpperCase(),
      action: 'subscribe',
      listId: randomUUID(),
    });
    expect(res.statusCode, `body: ${res.body}`).toBe(400);
    expect(res.json()).toMatchObject({ code: 'INVALID_REFERENCE', statusCode: 400 });
    expect(res.body).not.toContain('sms_keywords_list_id');
    expect(res.body).not.toContain('Key (');
  });

  it('a validation error is still a 400 from Zod, untouched', async () => {
    // Negative control: the mapping must not swallow the layer above it.
    const res = await createKeyword({ keyword: 'X'.repeat(200), action: 'info' });
    expect(res.statusCode, `body: ${res.body}`).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
  });

  it('a request with nothing wrong with it still succeeds', async () => {
    // The other negative control: mapping errors must not cost the happy path.
    const keyword = `OK${tag}`.toUpperCase();
    const res = await createKeyword({ keyword, action: 'unsubscribe' });
    expect(res.statusCode, `body: ${res.body}`).toBe(201);

    const rows = await db.select().from(smsKeywords).where(eq(smsKeywords.orgId, caller.orgId));
    expect(rows.filter((r) => r.keyword === keyword)).toHaveLength(1);
  });
});
