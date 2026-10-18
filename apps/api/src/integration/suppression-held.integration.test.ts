/**
 * A contact's status and its address's suppression rows say the same thing:
 * an edit to 'active' waits while a complaint, unsubscribe or manual row
 * stands, and a list campaign counts no unsubscribed, bounced or complained
 * contact, row or not (Z171).
 *
 * ─── What was wrong (measured on master 6977b32) ─────────────────────────────
 *
 * PUT /contacts/:id {status:'active'} on a bounced contact, an archived
 * bounced one or one archived from 'active' answered 200 over a complaint,
 * unsubscribe or manual row (Z149 MIMO 1 and 2): the contact read 'active'
 * while the row went on stopping its mail. Michal 13. 10.: unsubscribe,
 * complaint and manual are not released by an edit — only the recipient comes
 * back, by a consent we can prove (resubscribe.ts). And the pre-send count of
 * a list campaign took in unsubscribed / bounced / complained contacts that
 * had no row, which batch-sender then refused (Z146 MIMO 1: 2 counted, 1 sent).
 *
 * ─── What this file measures ─────────────────────────────────────────────────
 *
 * Through the real app (buildApp, inject, the real database and Redis). An
 * organisation of this file, its owner session from POST /api/v1/me/orgs/switch;
 * contacts (POST /contacts with the status), archives (PUT archived), rows
 * (POST /suppressions), unsubscribes (PUT unsubscribed), the erasure
 * (/anonymize), the complaint (the FBL route), lists, campaigns, the
 * preference centre and the DOI confirmation through their routes. Public
 * calls come from an address of this file (its own rate-limit bucket); no
 * limit is lifted. No worker runs in this process; the send itself is walked
 * in apps/workers/src/integration/suppression-held-campaign.
 *
 *   S2/A/A0  {bounced, archived(bounced), archived(active)} × {complaint,
 *            unsubscribe, manual, block, none, hard_bounce} → PUT active;
 *   AX       the address changed in the same PUT, the unsubscribe a PUT
 *            wrote, the erasure's hash, both checks at once;
 *   A0       held unsubscribed / complained / pending / non_subscribed,
 *            active → active, and other targets than active, as on master;
 *   U        unarchive (not an edit; Sonda 1), as on master;
 *   R        the recipient's own way back, as on master;
 *   S3       how a bounced contact comes to have a complaint row;
 *   P        the count of a list campaign (pre-send panel, /internal/audience);
 *   C        queries of updateContact, the plan of the audience count.
 *
 * Everything measured is printed once as `Z171_API_CELLS_JSON {…}`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { JobType } from 'bullmq';
import { createTrackingToken } from '@forgemsg/shared';
import { redis } from '@forgemsg/shared/redis';
import { createTestApp, login, SEED, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts } from '../db/schema/index.js';
import { observeQueries } from '../db/explain-guard.js';
import { mtaOtherQueue } from '../lib/queues.js';
import { addressUnsuppressed, suppressionEmailHash } from '../services/suppressions/email.js';

const TAG = `z171-${randomUUID().slice(0, 8)}`;
const DOMAIN = `${TAG}.test`;
const octet = () => 1 + Math.floor(Math.random() * 250);
// This file's own address: its own rate-limit bucket for the public routes.
const IP = `100.64.172.${octet()}`;
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' };
const FBL_SECRET = process.env.FBL_WEBHOOK_SECRET ?? 'dev-fbl-webhook-secret-change-me-32ch';
const ALL: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active', 'completed'];

let app: FastifyInstance;
let seedSession: Session;
let seedOrgId = '';
let org = '';
let owner: Record<string, string> = {};
let seedBefore: Record<string, unknown> = {};
const report: Record<string, unknown> = {
  tag: TAG,
  mock: 'none — the real app, database and Redis; no worker runs in this process',
};
const cells: Record<string, unknown> = {};
const listIds: string[] = [];
let n = 0;

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];
const address = (label: string) => `${label}-${n++}-${TAG}@${DOMAIN}`;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

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
      ...(body === undefined
        ? {}
        : typeof body === 'string'
          ? { payload: body }
          : { payload: body as Record<string, unknown> }),
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

/** The seed org as a whole: this file must leave it exactly as it found it. */
async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await rows<Record<string, unknown>>(sql`
    SELECT (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrgId}::uuid) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}::uuid) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}::uuid AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM lists WHERE org_id = ${seedOrgId}::uuid) AS lists,
           (SELECT count(*)::int FROM campaigns WHERE org_id = ${seedOrgId}::uuid) AS campaigns,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrgId}::uuid) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrgId}::uuid) AS api_keys,
           (SELECT count(*)::int FROM users WHERE org_id = ${seedOrgId}::uuid) AS users
  `);
  return r!;
}

/** A contact of this org in `start`: the status through POST /contacts, an archive through PUT. */
async function contactIn(start: string, email = address(start.replace(/[()]/g, '-'))) {
  const archived = /^archived\((\w+)\)$/.exec(start)?.[1];
  const status = archived ?? start;
  const b = await asOwner('POST', '/api/v1/contacts', {
    email,
    firstName: 'Jana',
    ...(status === 'active' ? {} : { status }),
  });
  if (archived) await asOwner('PUT', `/api/v1/contacts/${b.data.id}`, { status: 'archived' });
  return { id: b.data.id, email };
}

async function suppress(email: string, reason: string): Promise<string> {
  const b = await asOwner('POST', '/api/v1/suppressions', { email, reason });
  return b.data.id;
}

async function contactRow(id: string) {
  const [c] = await db
    .select({
      status: contacts.status,
      archivedFrom: contacts.archivedFrom,
      email: contacts.email,
      firstName: contacts.firstName,
      updatedAt: contacts.updatedAt,
    })
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.orgId, org)));
  return { ...c!, updatedAt: c!.updatedAt.toISOString() };
}

/** The rows of the address, by address or erasure hash. */
async function reasonsOf(email: string): Promise<string[]> {
  const hash = suppressionEmailHash(email);
  const r = await rows<{ reason: string }>(sql`
    SELECT reason::text AS reason FROM suppressions
    WHERE org_id = ${org}::uuid
      AND (lower(email) = lower(${email}) OR email_hash = ${hash})
    ORDER BY reason
  `);
  return r.map((x) => x.reason);
}

interface PutCell {
  start: string;
  row: string;
  answer: number;
  code: string | null;
  details: unknown;
  before: { status: string; archivedFrom: string | null };
  after: { status: string; archivedFrom: string | null };
  unchanged: boolean;
  rowsBefore: string[];
  rowsAfter: string[];
}

/** PUT active (and a name) on `start` with a `row` row: what the API answered and what it wrote. */
async function putActive(
  start: string,
  row: string,
): Promise<PutCell & { suppressionId: string | null }> {
  const c = await contactIn(start);
  const suppressionId = row === 'none' ? null : await suppress(c.email, row);
  const before = await contactRow(c.id);
  const rowsBefore = await reasonsOf(c.email);
  const res = await inject('PUT', `/api/v1/contacts/${c.id}`, owner, {
    status: 'active',
    firstName: 'Petra',
  });
  const after = await contactRow(c.id);
  const body = res.status >= 400 ? res.json() : {};
  return {
    start,
    row,
    answer: res.status,
    code: (body.code as string | undefined) ?? null,
    details: body.details ?? null,
    before: { status: before.status, archivedFrom: before.archivedFrom },
    after: { status: after.status, archivedFrom: after.archivedFrom },
    unchanged: JSON.stringify(after) === JSON.stringify(before),
    rowsBefore,
    rowsAfter: await reasonsOf(c.email),
    suppressionId,
  };
}

const BLOCKS = [
  {
    id: 'b1',
    type: 'text',
    content: '<p>Dobrý den.</p>',
    fontSize: '15px',
    fontFamily: 'Arial',
    color: '#111827',
    lineHeight: '1.5',
    textAlign: 'left',
  },
  {
    id: 'b2',
    type: 'footer',
    content: '{{company_name}}',
    showUnsubscribe: true,
    textAlign: 'center',
    fontSize: '12px',
    color: '#6b7280',
  },
];
const GLOBAL_STYLES = {
  backgroundColor: '#fff',
  contentBackgroundColor: '#fff',
  fontFamily: 'Arial',
  linkColor: '#00f',
  textColor: '#000',
  contentWidth: 600,
};

const STARTS = ['bounced', 'archived(bounced)', 'archived(active)'] as const;
const HELD = ['complaint', 'unsubscribe', 'manual'] as const;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  seedSession = await login(app);
  seedOrgId = seedSession.orgId;
  seedBefore = await seedState();

  const [o] = await rows<{ id: string }>(sql`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`${TAG} org`}, ${TAG}, 'production', 'Obchod z171 s.r.o.', 'Nádražní 1, 110 00 Praha')
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
  await db.execute(sql`
    INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
    VALUES (${org}::uuid, ${DOMAIN}, 'fm1', true, true, true, true)
  `);
}, 120_000);

afterAll(async () => {
  for (const j of await mtaOtherQueue.getJobs(ALL, 0, 10_000)) {
    if (j?.data?.orgId === org || j?.data?.toEmail?.toLowerCase().endsWith(`@${DOMAIN}`))
      await j.remove().catch(() => {});
  }
  // DOI tokens and limit keys this file's subscribes stored.
  let tokensRemoved = 0;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:*', 'COUNT', 1000);
    cursor = next;
    for (const key of keys) {
      if (key.startsWith('doi:limit:')) {
        if (listIds.some((id) => key.startsWith(`doi:limit:${id}:`))) await redis.del(key);
        continue;
      }
      // doi:limit-purpose: is a sorted set (Z185): GET would answer WRONGTYPE.
      if (key.startsWith('doi:purpose:') || key.startsWith('doi:limit-purpose:')) continue;
      const raw = await redis.get(key);
      if (raw?.includes(org)) {
        await redis.del(key);
        tokensRemoved++;
      }
    }
  } while (cursor !== '0');
  if (org) {
    await db.execute(sql`DELETE FROM consent_events WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM email_events WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM campaigns WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM audit_logs WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM api_keys WHERE org_id = ${org}::uuid`);
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await db.execute(sql`DELETE FROM organizations WHERE id = ${org}::uuid`);
  }
  const [left] = await rows<Record<string, number>>(sql`
    SELECT (SELECT count(*)::int FROM organizations WHERE id = ${org}::uuid) AS orgs,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${org}::uuid) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${org}::uuid) AS suppressions,
           (SELECT count(*)::int FROM lists WHERE org_id = ${org}::uuid) AS lists,
           (SELECT count(*)::int FROM campaigns WHERE org_id = ${org}::uuid) AS campaigns,
           (SELECT count(*)::int FROM sending_domains WHERE org_id = ${org}::uuid) AS domains,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${org}::uuid) AS members
  `);
  const seedAfter = await seedState();
  report.cells = cells;
  report.leftover = { ...left, doiTokensRemoved: tokensRemoved };
  report.rateLimitWaits = rateLimitWaits;
  report.seedOrg = { before: seedBefore, after: seedAfter };
  console.log(`Z171_API_CELLS_JSON ${JSON.stringify(report)}`);
  await app?.close();
  expect(left, 'what this file made was not all removed').toEqual({
    orgs: 0,
    contacts: 0,
    suppressions: 0,
    lists: 0,
    campaigns: 0,
    domains: 0,
    members: 0,
  });
  // The seed org exactly as this file found it — a snapshot, not zeros.
  expect(seedAfter).toEqual(seedBefore);
}, 120_000);

describe('A — PUT active over a complaint, unsubscribe or manual row is refused (Z171)', () => {
  for (const start of STARTS) {
    for (const row of HELD) {
      it(`A ${start} + ${row}: 409 SUPPRESSION_HELD, nothing of the PUT written`, async () => {
        const cell = await putActive(start, row);
        cells[`A ${start} + ${row}`] = cell;
        console.log(`[z171] A ${start} + ${row}: ${JSON.stringify(cell)}`);
        expect(cell.answer).toBe(409);
        expect(cell.code).toBe('SUPPRESSION_HELD');
        expect(cell.details).toEqual({ reason: row, suppressionId: cell.suppressionId });
        expect(cell.unchanged).toBe(true);
        expect(cell.rowsAfter).toEqual(cell.rowsBefore);
      }, 300_000);
    }
  }

  it('A the unsubscribe a PUT wrote on a bounced contact (Z149 MIMO 2): PUT active → 409', async () => {
    const c = await contactIn('bounced');
    const unsub = await inject('PUT', `/api/v1/contacts/${c.id}`, owner, {
      status: 'unsubscribed',
    });
    const mid = {
      answer: unsub.status,
      ...(await contactRow(c.id)),
      rows: await reasonsOf(c.email),
    };
    const res = await inject('PUT', `/api/v1/contacts/${c.id}`, owner, { status: 'active' });
    const cell = {
      putUnsubscribed: { answer: mid.answer, status: mid.status, rows: mid.rows },
      answer: res.status,
      code: res.status >= 400 ? res.json().code : null,
      after: (await contactRow(c.id)).status,
      rows: await reasonsOf(c.email),
    };
    cells['A unsubscribe by PUT'] = cell;
    console.log(`[z171] A unsubscribe by PUT: ${JSON.stringify(cell)}`);
    expect(cell.putUnsubscribed).toEqual({ answer: 200, status: 'bounced', rows: ['unsubscribe'] });
    expect([cell.answer, cell.code, cell.after]).toEqual([409, 'SUPPRESSION_HELD', 'bounced']);
    expect(cell.rows).toEqual(['unsubscribe']);
  }, 300_000);

  it("A the erasure's hash row ('manual', no address) counts: a bounced contact on the address → 409", async () => {
    const email = address('erased');
    const gone = await asOwner('POST', '/api/v1/contacts', { email, firstName: 'Jana' });
    await asOwner('POST', `/api/v1/contacts/${gone.data.id}/anonymize`, {});
    const c = await contactIn('bounced', email);
    const res = await inject('PUT', `/api/v1/contacts/${c.id}`, owner, { status: 'active' });
    const cell = {
      rows: await reasonsOf(email),
      answer: res.status,
      code: res.status >= 400 ? res.json().code : null,
      reason: res.status >= 400 ? (res.json().details as { reason?: string })?.reason : null,
      after: (await contactRow(c.id)).status,
    };
    cells['A erasure hash'] = cell;
    console.log(`[z171] A erasure hash: ${JSON.stringify(cell)}`);
    expect(cell.rows).toEqual(['manual']);
    expect([cell.answer, cell.code, cell.reason, cell.after]).toEqual([
      409,
      'SUPPRESSION_HELD',
      'manual',
      'bounced',
    ]);
  }, 300_000);

  it('A the PUT changes the address too: the new address with a complaint row → 409, nothing written', async () => {
    const c = await contactIn('bounced');
    const next = address('new-complaint');
    await suppress(next, 'complaint');
    const before = await contactRow(c.id);
    const res = await inject('PUT', `/api/v1/contacts/${c.id}`, owner, {
      email: next,
      status: 'active',
    });
    const after = await contactRow(c.id);
    const cell = {
      answer: res.status,
      code: res.status >= 400 ? res.json().code : null,
      after: { status: after.status, email: after.email === c.email ? 'old' : after.email },
      unchanged: JSON.stringify(after) === JSON.stringify(before),
    };
    cells['A new address with complaint'] = cell;
    console.log(`[z171] A new address with complaint: ${JSON.stringify(cell)}`);
    expect([cell.answer, cell.code, cell.unchanged]).toEqual([409, 'SUPPRESSION_HELD', true]);
  }, 300_000);
});

describe('A0 — what does not change', () => {
  for (const start of STARTS) {
    for (const row of ['block', 'none', 'hard_bounce'] as const) {
      const bounce = row === 'hard_bounce' && start !== 'archived(active)';
      it(`A0 ${start} + ${row}: ${bounce ? '409 BOUNCE_ACTIVE' : '200 active'}, as on master`, async () => {
        const cell = await putActive(start, row);
        cells[`A0 ${start} + ${row}`] = cell;
        console.log(`[z171] A0 ${start} + ${row}: ${JSON.stringify(cell)}`);
        if (bounce) {
          expect([cell.answer, cell.code, cell.unchanged]).toEqual([409, 'BOUNCE_ACTIVE', true]);
        } else {
          expect([cell.answer, cell.after.status, cell.after.archivedFrom]).toEqual([
            200,
            'active',
            null,
          ]);
        }
        expect(cell.rowsAfter).toEqual(cell.rowsBefore);
      }, 300_000);
    }
  }

  it('A0 hard_bounce AND complaint on a bounced contact: BOUNCE_ACTIVE answers', async () => {
    const c = await contactIn('bounced');
    await suppress(c.email, 'complaint');
    const hb = await suppress(c.email, 'hard_bounce');
    const res = await inject('PUT', `/api/v1/contacts/${c.id}`, owner, { status: 'active' });
    const cell = {
      answer: res.status,
      code: res.json().code,
      details: res.json().details,
      after: (await contactRow(c.id)).status,
    };
    cells['A0 hard_bounce + complaint'] = cell;
    console.log(`[z171] A0 hard_bounce + complaint: ${JSON.stringify(cell)}`);
    expect([cell.answer, cell.code, cell.after]).toEqual([409, 'BOUNCE_ACTIVE', 'bounced']);
    expect(cell.details).toEqual({ reason: 'hard_bounce', suppressionId: hb });
  }, 300_000);

  it('A0 the old address had the complaint row, the PUT moves to a clean one: 200 active', async () => {
    const c = await contactIn('bounced');
    await suppress(c.email, 'complaint');
    const next = address('new-clean');
    const res = await inject('PUT', `/api/v1/contacts/${c.id}`, owner, {
      email: next,
      status: 'active',
    });
    const after = await contactRow(c.id);
    const cell = { answer: res.status, status: after.status, movedToNew: after.email === next };
    cells['A0 old address with complaint'] = cell;
    console.log(`[z171] A0 old address with complaint: ${JSON.stringify(cell)}`);
    expect(cell).toEqual({ answer: 200, status: 'active', movedToNew: true });
  }, 300_000);

  it('A0 held unsubscribed / complained / pending / non_subscribed → active: 409 CONSENT_REQUIRED', async () => {
    const out: Record<string, unknown> = {};
    for (const [start, row] of [
      ['unsubscribed', 'unsubscribe'],
      ['complained', 'complaint'],
      ['pending', 'none'],
      ['non_subscribed', 'none'],
      ['archived(unsubscribed)', 'unsubscribe'],
    ] as const) {
      const cell = await putActive(start, row);
      out[`${start} + ${row}`] = cell;
      expect([cell.answer, cell.code, cell.unchanged], start).toEqual([
        409,
        'CONSENT_REQUIRED',
        true,
      ]);
    }
    cells['A0 consent'] = out;
    console.log(`[z171] A0 consent: ${JSON.stringify(out)}`);
  }, 300_000);

  it('A0 active → active with a complaint row: a no-op status, the name is written', async () => {
    const c = await contactIn('active');
    await suppress(c.email, 'complaint');
    const res = await inject('PUT', `/api/v1/contacts/${c.id}`, owner, {
      status: 'active',
      firstName: 'Petra',
    });
    const after = await contactRow(c.id);
    const cell = { answer: res.status, status: after.status, firstName: after.firstName };
    cells['A0 active to active'] = cell;
    console.log(`[z171] A0 active to active: ${JSON.stringify(cell)}`);
    expect(cell).toEqual({ answer: 200, status: 'active', firstName: 'Petra' });
  }, 300_000);

  it('A0 other targets than active with a complaint row: archived and unsubscribed as on master', async () => {
    const a = await contactIn('bounced');
    await suppress(a.email, 'complaint');
    const archived = await inject('PUT', `/api/v1/contacts/${a.id}`, owner, { status: 'archived' });
    const b = await contactIn('bounced');
    await suppress(b.email, 'complaint');
    const unsub = await inject('PUT', `/api/v1/contacts/${b.id}`, owner, {
      status: 'unsubscribed',
    });
    const ra = await contactRow(a.id);
    const rb = await contactRow(b.id);
    const cell = {
      archived: {
        answer: archived.status,
        status: ra.status,
        archivedFrom: ra.archivedFrom,
        rows: await reasonsOf(a.email),
      },
      unsubscribed: { answer: unsub.status, status: rb.status, rows: await reasonsOf(b.email) },
    };
    cells['A0 other targets'] = cell;
    console.log(`[z171] A0 other targets: ${JSON.stringify(cell)}`);
    expect(cell.archived).toEqual({
      answer: 200,
      status: 'archived',
      archivedFrom: 'bounced',
      rows: ['complaint'],
    });
    expect(cell.unsubscribed).toEqual({
      answer: 200,
      status: 'bounced',
      rows: ['complaint', 'unsubscribe'],
    });
  }, 300_000);
});

describe('U — unarchive is not an edit (Sonda 1: it writes the status itself)', () => {
  it('U archived(active) + complaint / unsubscribe / manual → POST /unarchive, as on master', async () => {
    const out: Record<string, unknown> = {};
    for (const row of HELD) {
      const c = await contactIn('archived(active)');
      await suppress(c.email, row);
      const res = await inject('POST', `/api/v1/contacts/${c.id}/unarchive`, owner, {});
      out[row] = {
        answer: res.status,
        status: (await contactRow(c.id)).status,
        rows: await reasonsOf(c.email),
      };
    }
    cells.U = out;
    console.log(`[z171] U: ${JSON.stringify(out)}`);
    // Recorded, not changed by Z171: unarchive gives back the status the
    // archive replaced, here 'active', over the row (MIMO).
    for (const row of HELD) expect((out[row] as { answer: number }).answer).toBe(200);
  }, 300_000);
});

describe("R — the recipient's own way back is unchanged", () => {
  it('R preference centre resubscribe, DOI confirmation, and DOI after an erasure → active, row lifted', async () => {
    const list = await asOwner('POST', '/api/v1/lists', { name: `${TAG} R`, doubleOptIn: true });
    listIds.push(list.data.id);

    // Unsubscribed by the real path (PUT unsubscribed on an active contact).
    const p = await contactIn('active');
    await asOwner('PUT', `/api/v1/contacts/${p.id}`, { status: 'unsubscribed' });
    const pBefore = { status: (await contactRow(p.id)).status, rows: await reasonsOf(p.email) };
    const token = createTrackingToken({
      type: 'pref',
      orgId: org,
      contactId: p.id,
      ts: Math.floor(Date.now() / 1000),
    });
    const pr = await inject('POST', `/p/center/${token}`, {}, { globalResubscribe: true });
    const pref = {
      before: pBefore,
      answer: pr.status,
      after: { status: (await contactRow(p.id)).status, rows: await reasonsOf(p.email) },
    };

    const confirm = async (email: string, contactId: string | null) => {
      const s = await inject('POST', `/api/v1/lists/${list.data.id}/subscribe`, {}, { email });
      // The link out of the confirmation e-mail as queued (no worker runs in
      // this process), and the button its page posts (Z176).
      const mail = (await mtaOtherQueue.getJobs(ALL, 0, 10_000)).filter(
        (j) =>
          j?.data?.toEmail?.toLowerCase() === email.toLowerCase() &&
          /^Confirm your subscription to /.test(j.data.subject),
      );
      const t = /href="[^"]*?(\/api\/v1\/confirm\/[0-9a-f-]{36})"/.exec(
        String(mail.at(-1)?.data.htmlBody ?? ''),
      )?.[1];
      const c = t ? await inject('POST', t, {}) : null;
      const [row] = await db
        .select({ id: contacts.id, status: contacts.status })
        .from(contacts)
        .where(
          and(
            eq(contacts.orgId, org),
            sql`lower(${contacts.email}) = lower(${email})`,
            sql`${contacts.deletedAt} IS NULL`,
          ),
        );
      return {
        subscribe: s.status,
        token: !!t,
        confirm: c?.status ?? null,
        sameContact: contactId === null ? null : row?.id === contactId,
        status: row?.status ?? null,
        rows: await reasonsOf(email),
      };
    };
    const d = await contactIn('active');
    await asOwner('PUT', `/api/v1/contacts/${d.id}`, { status: 'unsubscribed' });
    const doiBefore = { status: (await contactRow(d.id)).status, rows: await reasonsOf(d.email) };
    const doi = { before: doiBefore, ...(await confirm(d.email, d.id)) };

    const gEmail = address('r-erased');
    const g = await asOwner('POST', '/api/v1/contacts', { email: gEmail, firstName: 'Jana' });
    await asOwner('POST', `/api/v1/contacts/${g.data.id}/anonymize`, {});
    const erasedBefore = await reasonsOf(gEmail);
    const erased = { before: erasedBefore, ...(await confirm(gEmail, null)) };

    const cell = { pref, doi, erased };
    cells.R = cell;
    console.log(`[z171] R: ${JSON.stringify(cell)}`);
    expect(pref.before).toEqual({ status: 'unsubscribed', rows: ['unsubscribe'] });
    expect(pref.answer).toBe(200);
    expect(pref.after).toEqual({ status: 'active', rows: [] });
    expect(doi.before).toEqual({ status: 'unsubscribed', rows: ['unsubscribe'] });
    expect([doi.token, doi.sameContact, doi.status, doi.rows]).toEqual([true, true, 'active', []]);
    expect(erased.before).toEqual(['manual']);
    expect([erased.token, erased.status, erased.rows]).toEqual([true, 'active', []]);
  }, 300_000);
});

describe('S3 — how a bounced contact comes to have a complaint row (recorded)', () => {
  it('S3 FBL on a bounced / archived contact, POST /suppressions complaint, FBL before the contact exists', async () => {
    const fbl = (email: string) =>
      inject(
        'POST',
        '/api/v1/isp/feedback',
        { 'x-fbl-secret': FBL_SECRET, 'x-org-id': org, 'content-type': 'text/plain' },
        [
          'From: abuse@isp.invalid',
          'To: fbl@example.invalid',
          'Subject: FBL report',
          '',
          '--b',
          'Content-Type: message/feedback-report',
          '',
          'Feedback-Type: abuse',
          `Original-Rcpt-To: ${email}`,
          'Reporting-MTA: dns; mx.isp.invalid',
          '',
          '--b--',
        ].join('\n'),
      );
    const state = async (id: string, email: string) => {
      const r = await contactRow(id);
      return { status: r.status, archivedFrom: r.archivedFrom, rows: await reasonsOf(email) };
    };
    const out: Record<string, unknown> = {};
    for (const start of ['bounced', 'archived(bounced)', 'archived(active)'] as const) {
      const c = await contactIn(start);
      const r = await fbl(c.email);
      out[`FBL on ${start}`] = { answer: r.status, ...(await state(c.id, c.email)) };
    }
    const m = await contactIn('bounced');
    await suppress(m.email, 'complaint');
    out['POST /suppressions complaint on bounced'] = await state(m.id, m.email);
    const early = address('fbl-first');
    const r = await fbl(early);
    const later = await contactIn('bounced', early);
    out['FBL first, then POST /contacts bounced'] = {
      answer: r.status,
      ...(await state(later.id, early)),
    };
    cells.S3 = out;
    console.log(`[z171] S3: ${JSON.stringify(out)}`);
    expect(Object.keys(out)).toHaveLength(5);
  }, 300_000);
});

/** The pre-send panel's count of a campaign, as the dashboard reads it. */
async function panelCount(campaignId: string) {
  const r = await inject('GET', `/api/v1/campaigns/${campaignId}/pre-send-checks`, owner);
  const checks = (r.json().data as { checks?: { id: string; title: string }[] })?.checks ?? [];
  const audience = checks.find((c) => c.id === 'audience-size' || c.id === 'audience-empty');
  if (!audience) return `? ${r.status}`;
  if (audience.id === 'audience-empty') return 0;
  return Number(/^([\d,]+) recipients/.exec(audience.title)?.[1]?.replace(/,/g, '') ?? NaN);
}

describe('P — the count of a list campaign is the audience batch-sender sends to (Z171)', () => {
  let campaignId = '';
  let members: Record<string, string> = {};

  it('P list {active, unsubscribed, bounced, complained (no row), active + unsubscribe row, pending}: count 1', async () => {
    const list = await asOwner('POST', '/api/v1/lists', { name: `${TAG} P` });
    listIds.push(list.data.id);
    members = {};
    for (const [label, start, row] of [
      ['active', 'active', null],
      ['unsubscribed', 'unsubscribed', null],
      ['bounced', 'bounced', null],
      ['complained', 'complained', null],
      ['active+unsubscribe row', 'active', 'unsubscribe'],
      ['pending', 'pending', null],
    ] as const) {
      const c = await contactIn(start);
      if (row) await suppress(c.email, row);
      await asOwner('POST', `/api/v1/lists/${list.data.id}/contacts`, { contactId: c.id });
      members[label] = c.id;
    }
    const campaign = await asOwner('POST', '/api/v1/campaigns', {
      name: `${TAG} P`,
      subject: 'Novinky',
      fromName: 'Obchod',
      fromEmail: `noreply@${DOMAIN}`,
      listId: list.data.id,
      content: { subject: 'Novinky', blocks: BLOCKS, globalStyles: GLOBAL_STYLES },
    });
    campaignId = campaign.data.id;
    const panel = await panelCount(campaignId);
    const aud = await inject(
      'GET',
      `/api/v1/internal/audience?orgId=${org}&campaignId=${campaignId}`,
      INTERNAL,
    );
    const ids = ((aud.json().data as { contactIds?: string[] })?.contactIds ?? []).slice();
    const byId = Object.fromEntries(Object.entries(members).map(([k, v]) => [v, k]));
    const cell = {
      panel,
      audience: ids.length,
      audienceMembers: ids.map((id) => byId[id] ?? 'other').sort(),
    };
    cells.P = cell;
    console.log(`[z171] P: ${JSON.stringify(cell)}`);
    expect(cell.audienceMembers).toEqual(['active']);
    expect(cell.panel).toBe(1);
  }, 300_000);

  it('C — updateContact queries, and the plan of the audience count, master shape vs branch shape', async () => {
    const counted = async (start: string, patch: Record<string, unknown>) => {
      const c = await contactIn(start);
      const seen: string[] = [];
      const stop = observeQueries((q) => seen.push(q.replace(/\s+/g, ' ')));
      let status = 0;
      try {
        status = (await inject('PUT', `/api/v1/contacts/${c.id}`, owner, patch)).status;
      } finally {
        stop();
      }
      return {
        answer: status,
        statements: seen.length,
        suppressionReads: seen.filter((q) => /from "suppressions"/i.test(q)).length,
      };
    };
    const queries = {
      'bounced → active (no row)': await counted('bounced', { status: 'active' }),
      'archived(active) → active (no row)': await counted('archived(active)', { status: 'active' }),
      'archived(bounced) → active (no row)': await counted('archived(bounced)', {
        status: 'active',
      }),
      'active, name only': await counted('active', { firstName: 'Petra' }),
      'active → archived': await counted('active', { status: 'archived' }),
      'bounced → unsubscribed': await counted('bounced', { status: 'unsubscribed' }),
    };

    // The statement countAudience ran for P, as the app composed it.
    const seen: string[] = [];
    const stop = observeQueries((q) => seen.push(q.replace(/\s+/g, ' ')));
    try {
      await panelCount(campaignId);
    } finally {
      stop();
    }
    const countStatement =
      seen.find((q) => /count\(\*\)::int AS n FROM "contact_lists"/i.test(q)) ?? null;

    // The same predicate in both shapes, on the same data (the P list).
    const [cmp] = await rows<{ list_id: string }>(sql`
      SELECT list_id FROM campaigns WHERE id = ${campaignId}::uuid
    `);
    const listId = cmp!.list_id;
    const shape = (statuses: string[]) => sql`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT count(*)::int AS n
      FROM "contact_lists" cl
      JOIN "contacts" c ON c."id" = cl."contact_id"
      WHERE c."org_id" = ${org}::uuid
        AND cl."list_id" = ${listId}::uuid
        AND c."deleted_at" IS NULL
        AND cl."unsubscribed_at" IS NULL
        AND c."status" NOT IN (${sql.join(
          statuses.map((s) => sql`${s}`),
          sql`, `,
        )})
        AND ${addressUnsuppressed(sql`c."org_id"`, sql`c."email"`)}
    `;
    const plans: Record<string, string[]> = {};
    for (const [k, statuses] of Object.entries({
      master: ['archived', 'non_subscribed', 'pending'],
      branch: ['unsubscribed', 'bounced', 'complained', 'pending', 'archived', 'non_subscribed'],
    })) {
      const plan = await rows<{ 'QUERY PLAN': string }>(shape(statuses));
      plans[k] = plan.map((r) => r['QUERY PLAN']);
    }
    const cell = {
      queries,
      countStatement: countStatement?.split(TAG).join('<TAG>') ?? null,
      plans,
    };
    cells.C = cell;
    console.log(`[z171] C: ${JSON.stringify(cell)}`);
    expect(countStatement).not.toBeNull();
  }, 300_000);
});
