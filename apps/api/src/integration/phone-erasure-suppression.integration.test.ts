/**
 * A GDPR erasure keeps the phone number's fingerprint on a 'manual' row of its
 * own, the double opt-in confirmation of the erased address does not lift it,
 * and POST /suppressions/check finds the erased address and number (Z180).
 *
 * ─── What was wrong (measured on master d9dc522, Z179) ───────────────────────
 *
 * The erasure kept the address's fingerprint (email_hash) and deleted the
 * number with no trace: a contact with a number and no address left no row at
 * all, and the same number on a contact made again got campaigns and flows.
 * POST /suppressions/check answered `suppressed: false` for the erased address
 * and number. A fingerprint on the address's row (the Z179 probe) went with
 * that row when the erased person confirmed a double opt-in (6 → 5 rows).
 *
 * ─── What this file measures ─────────────────────────────────────────────────
 *
 * Through the real app (buildApp, inject, the real database and Redis). An
 * organisation of this file, its owner session from POST /api/v1/me/orgs/switch
 * and the owner's own API key; contacts through POST /contacts, the erasure
 * through POST /contacts/:id/anonymize, rows through POST /suppressions, the
 * DOI through POST /lists/:id/subscribe and the link out of the queued mail.
 * Public calls come from an address of this file (its own rate-limit bucket);
 * no limit is lifted. No worker runs here; the sends are walked in
 * apps/workers/src/integration/phone-erasure.integration.test.ts.
 *
 *   GS   e-mail + number erased: the address's row as before, the number's row;
 *   GP   number only erased: the number's row;
 *   S2   erasing again: one contact twice, two contacts of one address, two
 *        contacts of one number;
 *   SUM  /suppressions/summary around an erasure of e-mail + number;
 *   GC   POST /suppressions/check, answers verbatim;
 *   DEL  DELETE /suppressions/:id on the erasure rows; GET /suppressions;
 *   D    the erasure, then the DOI confirmation of the erased address;
 *   B    /internal/contacts/batch with and without `phone`;
 *   H    phoneHashSql (Postgres) gives suppressionPhoneHash (Node).
 *
 * Everything measured is printed once as `Z180_API_CELLS_JSON {…}`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHmac, randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import type { JobType } from 'bullmq';
import { redis } from '@forgemsg/shared/redis';
import { createTestApp, login, SEED, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { env } from '../config/env.js';
import { mtaOtherQueue } from '../lib/queues.js';
import { suppressionEmailHash } from '../services/suppressions/email.js';

const TAG = `z180-${randomUUID().slice(0, 8)}`;
const DOMAIN = `${TAG}.test`;
const octet = () => 1 + Math.floor(Math.random() * 250);
// This file's own address: its own rate-limit bucket for the public routes.
const IP = `100.64.180.${octet()}`;
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' };
const ALL: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active', 'completed'];
// Valid CZ mobile numbers (Vodafone 777): POST /contacts stores them E.164.
const PHONE_BASE = 420_777_000_000 + Math.floor(Math.random() * 800_000);
const HEX64 = /^[0-9a-f]{64}$/;

let app: FastifyInstance;
let seedSession: Session;
let seedOrgId = '';
let org = '';
let owner: Record<string, string> = {};
let ownerKey: Record<string, string> = {};
let hasPhoneHash = false;
let seedBefore: Record<string, unknown> = {};
const report: Record<string, unknown> = {
  tag: TAG,
  mock: 'none — the real app, database and Redis; no worker runs in this process',
};
const cells: Record<string, unknown> = {};
const listIds: string[] = [];
let n = 0;
let phones = 0;

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];
const address = (label: string) => `${label}-${n++}-${TAG}@${DOMAIN}`;
const newPhone = () => `+${PHONE_BASE + ++phones * 7}`;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
/** The fingerprint as the change defines it, computed here so master can load this file. */
const phoneHashOf = (e164: string) =>
  createHmac('sha256', env.SUPPRESSION_HASH_KEY).update(`phone:${e164}`).digest('hex');
const scrub = (s: string) =>
  s
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>')
    .replace(new RegExp(TAG, 'g'), '<tag>');

/** Windows this file waited out on a 429 — the limit is honoured, not lifted. */
const rateLimitWaits: { url: string; retryAfterS: number }[] = [];

async function inject(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: string; json: () => Record<string, unknown> }> {
  for (let attempt = 0; ; attempt++) {
    const res = await app.inject({
      method: method as 'POST',
      url,
      headers,
      remoteAddress: IP,
      ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
    });
    if (res.statusCode === 429 && attempt < 3) {
      const retryAfterS = Number(res.headers['retry-after'] ?? 60);
      rateLimitWaits.push({
        url: url.split('?')[0]!.replace(/[0-9a-f-]{36}/g, ':id'),
        retryAfterS,
      });
      await new Promise((r) => setTimeout(r, (retryAfterS + 1) * 1000));
      continue;
    }
    return {
      status: res.statusCode,
      body: res.body,
      json: () => (res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {}),
    };
  }
}

async function asOwner(method: string, url: string, body?: unknown) {
  const r = await inject(method, url, owner, body);
  expect(r.status, `${method} ${url}: ${r.body}`).toBeLessThan(300);
  return r.json() as { data: Record<string, unknown> & { id: string } };
}

/** A contact through POST /contacts; its number as stored. */
async function contact(email: string | null, phone: string | null) {
  const b = await asOwner('POST', '/api/v1/contacts', {
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    firstName: 'Petra',
  });
  const [row] = await rows<{ phone: string | null }>(sql`
    SELECT phone FROM contacts WHERE id = ${b.data.id}::uuid
  `);
  return { id: b.data.id, email, phone, stored: row?.phone ?? null };
}

async function erase(id: string): Promise<number> {
  return (await inject('POST', `/api/v1/contacts/${id}/anonymize`, owner, {})).status;
}

interface Row {
  id: string;
  email: string | null;
  phone: string | null;
  reason: string;
  notes: string | null;
  email_hash: string | null;
  phone_hash: string | null;
}

/** The suppression rows of this organisation (phone_hash NULL where the column does not exist). */
async function orgRows(): Promise<Row[]> {
  return hasPhoneHash
    ? rows<Row>(sql`
        SELECT id, email, phone, reason::text AS reason, notes, email_hash, phone_hash
        FROM suppressions WHERE org_id = ${org}::uuid ORDER BY created_at, id
      `)
    : rows<Row>(sql`
        SELECT id, email, phone, reason::text AS reason, notes, email_hash, NULL::text AS phone_hash
        FROM suppressions WHERE org_id = ${org}::uuid ORDER BY created_at, id
      `);
}

/** A row as a cell: no ids, the hex of the fingerprints as their length. */
const shape = (r: Row) => ({
  reason: r.reason,
  email: r.email,
  phone: r.phone,
  emailHash: r.email_hash === null ? null : r.email_hash.length,
  phoneHash: r.phone_hash === null ? null : r.phone_hash.length,
  notes: r.notes === null ? null : r.notes.replace(/[0-9a-f]{64}/, '<hex>'),
});

const byEmail = (all: Row[], email: string) =>
  all.filter((r) => r.email_hash === suppressionEmailHash(email));
const byPhone = (all: Row[], e164: string) => all.filter((r) => r.phone_hash === phoneHashOf(e164));

async function check(body: Record<string, unknown>) {
  const r = await inject('POST', '/api/v1/suppressions/check', ownerKey, body);
  return `${r.status} ${scrub(r.body)}`;
}

/** The seed org as a whole: this file must leave it exactly as it found it. */
async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await rows<Record<string, unknown>>(sql`
    SELECT (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrgId}::uuid) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}::uuid) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}::uuid AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM sms_consents WHERE org_id = ${seedOrgId}::uuid) AS sms_consents,
           (SELECT count(*)::int FROM lists WHERE org_id = ${seedOrgId}::uuid) AS lists,
           (SELECT count(*)::int FROM campaigns WHERE org_id = ${seedOrgId}::uuid) AS campaigns,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrgId}::uuid) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrgId}::uuid) AS api_keys,
           (SELECT count(*)::int FROM users WHERE org_id = ${seedOrgId}::uuid) AS users
  `);
  if (!hasPhoneHash) return r!;
  const [p] = await rows<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM suppressions
    WHERE org_id = ${seedOrgId}::uuid AND phone_hash IS NOT NULL
  `);
  return { ...r!, phone_hash_rows: p!.n };
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  const [col] = await rows<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_name = 'suppressions' AND column_name = 'phone_hash'
  `);
  hasPhoneHash = col!.n === 1;
  report.phoneHashColumn = hasPhoneHash;
  seedSession = await login(app);
  seedOrgId = seedSession.orgId;
  seedBefore = await seedState();

  const [o] = await rows<{ id: string }>(sql`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`${TAG} org`}, ${TAG}, 'production', 'Obchod z180 s.r.o.', 'Nádražní 1, 110 00 Praha')
    RETURNING id
  `);
  org = o!.id;
  await db.execute(sql`
    INSERT INTO organization_members (org_id, user_id, email, role, status)
    VALUES (${org}::uuid, ${seedSession.userId}::uuid, ${SEED.email}, 'owner', 'active')
  `);
  const r = await inject(
    'POST',
    '/api/v1/me/orgs/switch',
    { cookie: seedSession.cookie },
    { orgId: org },
  );
  expect(r.status, r.body).toBe(200);
  owner = bearer((JSON.parse(r.body) as { data: { token: string } }).data.token);
  const minted = await asOwner('POST', '/api/v1/api-keys', { name: `${TAG} owner` });
  ownerKey = { 'x-api-key': String(minted.data.rawKey) };
  await db.execute(sql`
    INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
    VALUES (${org}::uuid, ${DOMAIN}, 'fm1', true, true, true, true)
  `);
}, 120_000);

afterAll(async () => {
  let jobsRemoved = 0;
  for (const j of await mtaOtherQueue.getJobs(ALL, 0, 10_000)) {
    if (j?.data?.orgId === org || j?.data?.toEmail?.toLowerCase().endsWith(`@${DOMAIN}`)) {
      await j.remove().catch(() => {});
      jobsRemoved++;
    }
  }
  // DOI tokens and limit keys this file's subscribes stored.
  let redisKeysRemoved = 0;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:*', 'COUNT', 1000);
    cursor = next;
    for (const key of keys) {
      if (key.startsWith('doi:limit:')) {
        if (listIds.some((id) => key.startsWith(`doi:limit:${id}:`))) {
          await redis.del(key);
          redisKeysRemoved++;
        }
        continue;
      }
      // doi:limit-purpose: is a sorted set (Z185): GET would answer WRONGTYPE.
      if (key.startsWith('doi:purpose:') || key.startsWith('doi:limit-purpose:')) continue;
      const raw = await redis.get(key);
      if (raw?.includes(org)) {
        await redis.del(key);
        redisKeysRemoved++;
      }
    }
  } while (cursor !== '0');
  if (org) {
    await db.execute(sql`DELETE FROM consent_events WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM email_events WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM campaigns WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM audit_logs WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM sms_consents WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM suppressions WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM api_keys WHERE org_id = ${org}::uuid`);
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await db.execute(sql`DELETE FROM organizations WHERE id = ${org}::uuid`);
  }
  const [left] = await rows<Record<string, number>>(sql`
    SELECT (SELECT count(*)::int FROM organizations WHERE id = ${org}::uuid) AS orgs,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${org}::uuid) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${org}::uuid) AS suppressions,
           (SELECT count(*)::int FROM sms_consents WHERE org_id = ${org}::uuid) AS sms_consents,
           (SELECT count(*)::int FROM lists WHERE org_id = ${org}::uuid) AS lists,
           (SELECT count(*)::int FROM campaigns WHERE org_id = ${org}::uuid) AS campaigns,
           (SELECT count(*)::int FROM sending_domains WHERE org_id = ${org}::uuid) AS domains,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${org}::uuid) AS api_keys,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${org}::uuid) AS members
  `);
  const seedAfter = await seedState();
  report.cells = cells;
  report.leftover = { ...left, jobsRemoved, redisKeysRemoved };
  report.rateLimitWaits = rateLimitWaits;
  report.seedOrg = { before: seedBefore, after: seedAfter };
  console.log(`Z180_API_CELLS_JSON ${JSON.stringify(report)}`);
  await app?.close();
  expect(left, 'what this file made was not all removed').toEqual({
    orgs: 0,
    contacts: 0,
    suppressions: 0,
    sms_consents: 0,
    lists: 0,
    campaigns: 0,
    domains: 0,
    api_keys: 0,
    members: 0,
  });
  // The seed org exactly as this file found it — a snapshot, not zeros — and
  // no fingerprint row and no consent of this file in it.
  expect(seedAfter).toEqual(seedBefore);
  expect(seedAfter.hash_rows).toBe(0);
  if (hasPhoneHash) expect(seedAfter.phone_hash_rows).toBe(0);
}, 120_000);

describe('GS / GP — what an erasure writes (Z180)', () => {
  it("GS e-mail + number: the address's row as before, and the number's own row", async () => {
    const P = newPhone();
    const k = await contact(address('gs'), P);
    const before = await orgRows();
    const answer = await erase(k.id);
    const after = await orgRows();
    const added = after.filter((r) => !before.some((b) => b.id === r.id));
    const emailRows = byEmail(added, k.email!);
    const phoneRows = byPhone(added, k.stored!);
    const cell = {
      stored: k.stored,
      answer,
      added: added.map(shape),
      emailRows: emailRows.map(shape),
      phoneRows: phoneRows.map(shape),
      hashesEqual: phoneRows.some((p) => emailRows.some((e) => e.email_hash === p.phone_hash)),
    };
    cells.GS = cell;
    console.log(`[z180] GS: ${JSON.stringify(cell)}`);
    expect(answer).toBe(200);
    expect(k.stored).toBe(P);
    // The address's row, exactly as on master.
    expect(cell.emailRows).toEqual([
      {
        reason: 'manual',
        email: null,
        phone: null,
        emailHash: 64,
        phoneHash: null,
        notes: 'gdpr_anonymized:<hex>',
      },
    ]);
    // The number's row, of its own (master: none).
    expect(cell.phoneRows).toEqual([
      {
        reason: 'manual',
        email: null,
        phone: null,
        emailHash: null,
        phoneHash: 64,
        notes: 'gdpr_anonymized_phone:<hex>',
      },
    ]);
    expect(phoneRows[0]!.phone_hash).toMatch(HEX64);
    expect(phoneRows[0]!.notes).toBe(`gdpr_anonymized_phone:${phoneRows[0]!.phone_hash}`);
    expect(cell.added).toHaveLength(2);
    expect(cell.hashesEqual).toBe(false);
  });

  it("GP number only: the number's own row (master: no row at all)", async () => {
    const P = newPhone();
    const k = await contact(null, P);
    const before = await orgRows();
    const answer = await erase(k.id);
    const after = await orgRows();
    const added = after.filter((r) => !before.some((b) => b.id === r.id));
    const cell = {
      answer,
      rowsBefore: before.length,
      rowsAfter: after.length,
      added: added.map(shape),
    };
    cells.GP = cell;
    console.log(`[z180] GP: ${JSON.stringify(cell)}`);
    expect(answer).toBe(200);
    expect(cell.added).toEqual([
      {
        reason: 'manual',
        email: null,
        phone: null,
        emailHash: null,
        phoneHash: 64,
        notes: 'gdpr_anonymized_phone:<hex>',
      },
    ]);
    expect(byPhone(added, P)).toHaveLength(1);
  });

  it('a contact with neither an address nor a number: no row, as on master', async () => {
    const b = await asOwner('POST', '/api/v1/contacts', { firstName: 'Nikdo', lastName: TAG });
    const before = (await orgRows()).length;
    const answer = await erase(b.data.id);
    const after = (await orgRows()).length;
    cells.GN = { answer, rowsBefore: before, rowsAfter: after };
    expect(answer).toBe(200);
    expect(after).toBe(before);
  });
});

describe('S2 — erasing again (Sonda 2)', () => {
  it('one contact twice, two contacts of one address, two contacts of one number', async () => {
    // One contact erased twice: the second erasure finds no address and no number.
    const P1 = newPhone();
    const once = await contact(address('s2-once'), P1);
    const e1 = await erase(once.id);
    const afterFirst = await orgRows();
    const e2 = await erase(once.id);
    const afterSecond = await orgRows();

    // Two contacts of one address, erased in turn (one live contact per address).
    const A = address('s2-addr');
    const a1 = await contact(A, null);
    const ea1 = await erase(a1.id);
    const a2 = await contact(A, null);
    const ea2 = await erase(a2.id);

    // Two contacts of one number, erased in turn.
    const P2 = newPhone();
    const p1 = await contact(address('s2-p1'), P2);
    const p2 = await contact(address('s2-p2'), P2);
    const ep1 = await erase(p1.id);
    const ep2 = await erase(p2.id);
    const all = await orgRows();

    const cell = {
      sameContactTwice: {
        answers: [e1, e2],
        rowsAfterFirst: afterFirst.length,
        rowsAfterSecond: afterSecond.length,
        emailRows: byEmail(afterSecond, once.email!).length,
        phoneRows: byPhone(afterSecond, P1).length,
      },
      twoContactsOneAddress: { answers: [ea1, ea2], emailRows: byEmail(all, A).length },
      twoContactsOneNumber: { answers: [ep1, ep2], phoneRows: byPhone(all, P2).length },
    };
    cells.S2 = cell;
    console.log(`[z180] S2: ${JSON.stringify(cell)}`);
    expect(cell.sameContactTwice.answers).toEqual([200, 200]);
    expect(cell.sameContactTwice.rowsAfterSecond).toBe(cell.sameContactTwice.rowsAfterFirst);
    expect(cell.sameContactTwice.emailRows).toBe(1);
    // The address's side today: one row per erasure.
    expect(cell.twoContactsOneAddress).toEqual({ answers: [200, 200], emailRows: 2 });
    expect(cell.sameContactTwice.phoneRows).toBe(1);
    // The number's side does the same (master: 0).
    expect(cell.twoContactsOneNumber).toEqual({ answers: [200, 200], phoneRows: 2 });
  });
});

describe('SUM — /suppressions/summary around an erasure of e-mail + number', () => {
  it("manual +2 and total +2: the address's row and the number's row (master +1 / +1)", async () => {
    const summary = async () =>
      (await asOwner('GET', '/api/v1/suppressions/summary')).data as unknown as {
        counts: Record<string, number>;
        total: number;
      };
    const k = await contact(address('sum'), newPhone());
    const before = await summary();
    expect(await erase(k.id)).toBe(200);
    const after = await summary();
    const cell = {
      before,
      after,
      manualDelta: after.counts.manual! - before.counts.manual!,
      totalDelta: after.total - before.total,
    };
    cells.SUM = cell;
    console.log(`[z180] SUM: ${JSON.stringify(cell)}`);
    expect([cell.manualDelta, cell.totalDelta]).toEqual([2, 2]);
    for (const reason of Object.keys(before.counts).filter((r) => r !== 'manual'))
      expect(after.counts[reason]).toBe(before.counts[reason]);
  });
});

describe('GC / DEL — POST /suppressions/check, DELETE and GET /suppressions', () => {
  it('GC the erased address and number are found, in the shape of an ordinary manual row', async () => {
    const P = newPhone();
    const k = await contact(address('gc'), P);
    expect(await erase(k.id)).toBe(200);
    const P2 = newPhone();
    const kp = await contact(null, P2);
    expect(await erase(kp.id)).toBe(200);
    const manualEmail = address('gc-manual');
    const unsubEmail = address('gc-unsub');
    const manualPhone = newPhone();
    await asOwner('POST', '/api/v1/suppressions', { email: manualEmail, reason: 'manual' });
    await asOwner('POST', '/api/v1/suppressions', { email: unsubEmail, reason: 'unsubscribe' });
    await asOwner('POST', '/api/v1/suppressions', { phone: manualPhone, reason: 'manual' });
    const e = k.email!;
    const gc = {
      erasedEmail: await check({ email: e }),
      erasedEmailUpper: await check({ email: e.toUpperCase() }),
      erasedEmailSpaces: await check({ email: `  ${e}  ` }),
      erasedNumber: await check({ phone: P }),
      erasedNumberSpaced: await check({
        phone: `+${P.slice(1, 4)} ${P.slice(4, 7)} ${P.slice(7, 10)} ${P.slice(10)}`,
      }),
      erasedNumberZeros: await check({ phone: `00${P.slice(1)}` }),
      erasedPhoneOnlyNumber: await check({ phone: P2 }),
      manualEmail: await check({ email: manualEmail }),
      unsubscribeEmail: await check({ email: unsubEmail }),
      manualPhone: await check({ phone: manualPhone }),
      unknownEmail: await check({ email: address('gc-unknown') }),
      unknownPhone: await check({ phone: newPhone() }),
    };
    cells.GC = gc;
    console.log(`[z180] GC: ${JSON.stringify(gc)}`);
    const hit = (reason: string) =>
      `200 {"data":{"suppressed":true,"reason":"${reason}","id":"<id>"}}`;
    const miss = '200 {"data":{"suppressed":false}}';
    // Unchanged (K): ordinary rows, unknown, and the 400 for spaces (Z179 MIMO 3).
    expect(gc.manualEmail).toBe(hit('manual'));
    expect(gc.unsubscribeEmail).toBe(hit('unsubscribe'));
    expect(gc.manualPhone).toBe(hit('manual'));
    expect(gc.unknownEmail).toBe(miss);
    expect(gc.unknownPhone).toBe(miss);
    expect(gc.erasedEmailSpaces).toMatch(/^400 \{"code":"VALIDATION_ERROR"/);
    // The erasure, found and told as an ordinary 'manual' row (master: false).
    expect(gc.erasedEmail).toBe(hit('manual'));
    expect(gc.erasedEmailUpper).toBe(hit('manual'));
    expect(gc.erasedNumber).toBe(hit('manual'));
    expect(gc.erasedNumberSpaced).toBe(hit('manual'));
    expect(gc.erasedNumberZeros).toBe(hit('manual'));
    expect(gc.erasedPhoneOnlyNumber).toBe(hit('manual'));
  });

  it("DEL the address's erasure row 409 as before; the number's row 409; GET lists phoneHash", async () => {
    const P = newPhone();
    const k = await contact(address('del'), P);
    expect(await erase(k.id)).toBe(200);
    const all = await orgRows();
    const emailRow = byEmail(all, k.email!)[0];
    const phoneRow = byPhone(all, P)[0];
    const del = async (id: string | undefined) => {
      if (!id) return 'n/a (no row)';
      const r = await inject('DELETE', `/api/v1/suppressions/${id}`, owner);
      return `${r.status} ${(r.json().code as string | undefined) ?? ''}`.trim();
    };
    const list = await asOwner('GET', '/api/v1/suppressions?limit=500');
    const listed = list.data as unknown as Record<string, unknown>[];
    const listedPhone = listed.find((r) => r.id === phoneRow?.id);
    const cell = {
      emailRow: await del(emailRow?.id),
      phoneRow: await del(phoneRow?.id),
      stillThere: {
        emailRow: byEmail(await orgRows(), k.email!).length,
        phoneRow: byPhone(await orgRows(), P).length,
      },
      listKeys: [...new Set(listed.flatMap((r) => Object.keys(r)))].sort(),
      listedPhoneRow: listedPhone
        ? {
            emailHash: listedPhone.emailHash,
            phoneHashIsTheRow: listedPhone.phoneHash === phoneRow?.phone_hash,
          }
        : null,
    };
    cells.DEL = cell;
    console.log(`[z180] DEL: ${JSON.stringify(cell)}`);
    expect(cell.emailRow).toBe('409 ERASURE_SUPPRESSION');
    expect(cell.phoneRow).toBe('409 ERASURE_SUPPRESSION');
    expect(cell.stillThere).toEqual({ emailRow: 1, phoneRow: 1 });
    expect(cell.listKeys).toContain('emailHash');
    expect(cell.listKeys).toContain('phoneHash');
    expect(cell.listedPhoneRow).toEqual({ emailHash: null, phoneHashIsTheRow: true });
  });
});

describe('D — the DOI confirmation of the erased address lifts its row, not the number', () => {
  it("D the address's row goes (as on master), the number's row stays", async () => {
    const list = await asOwner('POST', '/api/v1/lists', { name: `${TAG} D`, doubleOptIn: true });
    listIds.push(list.data.id);
    /** The confirmation mail queued for `email`, and its link. */
    const queuedLink = async (email: string) => {
      const mail = (await mtaOtherQueue.getJobs(ALL, 0, 10_000)).filter(
        (j) =>
          j?.data?.toEmail?.toLowerCase() === email.toLowerCase() &&
          /^Confirm your subscription to /.test(j.data.subject),
      );
      return {
        queued: mail.length,
        link: /href="[^"]*?(\/api\/v1\/confirm\/[0-9a-f-]{36})"/.exec(
          String(mail.at(-1)?.data.htmlBody ?? ''),
        )?.[1],
      };
    };
    const P = newPhone();
    const k = await contact(address('d'), P);
    expect(await erase(k.id)).toBe(200);
    const rowsErased = await orgRows();
    const sub = await inject(
      'POST',
      `/api/v1/lists/${list.data.id}/subscribe`,
      {},
      { email: k.email },
    );
    const mail = await queuedLink(k.email!);
    const confirm = mail.link ? (await inject('POST', mail.link, {})).status : null;
    const rowsConfirmed = await orgRows();

    const cell = {
      emailRows: {
        afterErasure: byEmail(rowsErased, k.email!).length,
        afterConfirmation: byEmail(rowsConfirmed, k.email!).length,
      },
      phoneRows: {
        afterErasure: byPhone(rowsErased, P).length,
        afterConfirmation: byPhone(rowsConfirmed, P).length,
      },
      subscribe: sub.status,
      confirmationQueued: mail.queued,
      confirm,
    };
    cells.D = cell;
    console.log(`[z180] D: ${JSON.stringify(cell)}`);
    // As on master: the erased person's confirmation goes and lifts the address's row.
    expect([cell.subscribe, cell.confirmationQueued > 0, cell.confirm]).toEqual([202, true, 200]);
    expect(cell.emailRows).toEqual({ afterErasure: 1, afterConfirmation: 0 });
    // The number's row is not the address's row: it stays (Z179 probe: 6 → 5).
    expect(cell.phoneRows).toEqual({ afterErasure: 1, afterConfirmation: 1 });
  });
});

describe('B — /internal/contacts/batch with and without `phone`', () => {
  it('without phone the answer is as before; with phone it says whether the number was erased', async () => {
    const P = newPhone();
    const erased = await contact(address('b-erased'), P);
    expect(await erase(erased.id)).toBe(200);
    const live = await contact(address('b-live'), P);
    const Q = newPhone();
    const other = await contact(address('b-other'), Q);
    const batch = async (body: Record<string, unknown>) => {
      const r = await inject('POST', '/api/v1/internal/contacts/batch', INTERNAL, {
        orgId: org,
        ...body,
      });
      return { status: r.status, body: r.json() };
    };
    const plain = await batch({ contactIds: [live.id, other.id] });
    const empty = await batch({ contactIds: [] });
    const erasedNumber = await batch({ contactIds: [live.id], phone: live.stored });
    const spaced = await batch({
      contactIds: [live.id],
      phone: `+${P.slice(1, 4)} ${P.slice(4, 7)} ${P.slice(7, 10)} ${P.slice(10)}`,
    });
    const otherNumber = await batch({ contactIds: [other.id], phone: other.stored });
    const cell = {
      plain: { status: plain.status, keys: Object.keys(plain.body).sort() },
      empty,
      erasedNumber: {
        status: erasedNumber.status,
        phoneSuppressed: erasedNumber.body.phoneSuppressed,
      },
      spaced: { status: spaced.status, phoneSuppressed: spaced.body.phoneSuppressed },
      otherNumber: {
        status: otherNumber.status,
        phoneSuppressed: otherNumber.body.phoneSuppressed,
      },
    };
    cells.B = cell;
    console.log(`[z180] B: ${JSON.stringify(cell)}`);
    // K: a caller without `phone` (batch-sender, push, mobile push) gets the answer as before.
    expect(cell.plain).toEqual({ status: 200, keys: ['data'] });
    expect(cell.empty).toEqual({ status: 200, body: { data: [] } });
    const data = (plain.body.data as Record<string, unknown>[]).map((c) => Object.keys(c).sort());
    expect(data).toEqual([
      ['customFields', 'email', 'firstName', 'id', 'lastName', 'status'],
      ['customFields', 'email', 'firstName', 'id', 'lastName', 'status'],
    ]);
    // With `phone` (master strips the field: no flag).
    expect(cell.erasedNumber).toEqual({ status: 200, phoneSuppressed: true });
    expect(cell.spaced).toEqual({ status: 200, phoneSuppressed: true });
    expect(cell.otherNumber).toEqual({ status: 200, phoneSuppressed: false });
  });
});

describe('H — the SQL fingerprint is the Node fingerprint', () => {
  it('phoneHashSql over three spellings gives suppressionPhoneHash', async () => {
    const P = newPhone();
    const { phoneHashSql, suppressionPhoneHash } =
      await import('../services/suppressions/phone.js');
    const spellings = [P, `00${P.slice(1)}`, `+${P.slice(1, 4)} ${P.slice(4, 7)} ${P.slice(7)}`];
    const out: { spelling: string; equal: boolean }[] = [];
    for (const s of spellings) {
      const [r] = await rows<{ h: string }>(sql`SELECT ${phoneHashSql(sql`${s}::text`)} AS h`);
      out.push({ spelling: s.replace(/\d/g, '9'), equal: r!.h === suppressionPhoneHash(s) });
    }
    cells.H = { out, nodeIsDefinition: suppressionPhoneHash(P) === phoneHashOf(P) };
    console.log(`[z180] H: ${JSON.stringify(cells.H)}`);
    expect(out.every((o) => o.equal)).toBe(true);
    expect(suppressionPhoneHash(P)).toBe(phoneHashOf(P));
  });
});
