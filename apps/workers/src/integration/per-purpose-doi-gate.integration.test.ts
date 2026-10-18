/**
 * Who may start a per-purpose GDPR confirmation, for whom and how often — as
 * far as the engine (Z185). The API suite's per-purpose-doi-gate file walks
 * every role and contact to the queue; this one takes what was queued through
 * the real mta-sender and counts what reached the engine.
 *
 * ─── What was wrong (measured on master d8e5272) ─────────────────────────────
 *
 * The start route had app.authenticate only, so a viewer's call sent the
 * e-mail; a deleted contact got it; four starts were four e-mails.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * API → queue → mta-sender, with the gRPC client of the engine the only stub.
 * An organisation of this file, its owner session from /me/orgs/switch, and two
 * keys of the seed user written as rows in this organisation with the stored
 * role 'editor' and 'viewer' (a key acts with the lower of its stored role and
 * its creator's; services/auth/api-key-role.ts).
 *
 *   P   owner session, editor key: sent; viewer key: 403, nothing at the engine;
 *   D   a deleted contact: 404, nothing at the engine;
 *   L   5 starts for one address and purpose: three at the engine;
 *   S4  unsubscribed, complained (+ 'complaint' row), a 'manual' row, an
 *       'unsubscribe' row: recorded — what the MTA gate does with each, not
 *       changed here (a question for Michal).
 *
 * Everything measured is printed once as `Z185_WORKERS_CELLS_JSON {…}`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { type Job, type JobType } from 'bullmq';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { redis } from '@forgemsg/shared/redis';
import { SEED_LOGIN, authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { mtaQueues, type MtaSendJobData } from '../queues/index.js';

// Hoisted with the mock: the factory runs while the imports above load.
const engine = vi.hoisted(() => ({
  handed: [] as { to: string; subject: string }[],
}));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string; subject: string }) => {
    engine.handed.push({ to: msg.toEmail, subject: msg.subject });
    return {
      success: true,
      messageId: 'm',
      smtpCode: 250,
      smtpMessage: 'OK',
      error: '',
      durationMs: '1',
      sendingIp: '',
    };
  },
}));

const API = process.env.API_URL!;
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

const tag = randomUUID().slice(0, 8);
const PP_SUBJECT = /^Potvrzení souhlasu/;
const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

let seed: SeedOrg;
let seedKey = '';
let seedBefore: Record<string, unknown> = {};
let org = '';
let owner = '';
let editorKey = '';
let viewerKey = '';
let slug = '';
let purposeId = '';
const allAddresses: string[] = [];
const cells: Record<string, unknown> = {};
const report: Record<string, unknown> = {
  tag,
  mock: 'the gRPC client of the engine only; everything else is the real API, queue and mta-sender',
};

const address = (name: string) => {
  const a = `z185-${name}-${tag}@test.local`;
  allAddresses.push(a);
  return a;
};

async function queuedFor(to: string): Promise<Job<MtaSendJobData>[]> {
  return ((await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[]).filter(
    (j) => j?.data?.toEmail?.toLowerCase() === to.toLowerCase(),
  );
}

/** Run every queued MTA job for `to` through the real processor, then drop it. */
async function deliver(to: string): Promise<string[]> {
  const statuses: string[] = [];
  for (const j of await queuedFor(to)) {
    const last = { data: j.data, opts: { attempts: 1 }, attemptsMade: 0, log: async () => {} };
    try {
      const r = (await processAtOrgRate(last as unknown as Job<MtaSendJobData>)) as {
        status: string;
      };
      statuses.push(r.status);
    } catch (err) {
      statuses.push(`threw: ${(err as Error).message}`);
    }
    await j.remove().catch(() => {});
  }
  return statuses;
}

async function call(
  method: string,
  path: string,
  credential: string | null,
  body?: unknown,
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(credential ? authHeaders(credential) : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, text: await res.text() };
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const r = await call(method, path, owner, body);
  if (r.status >= 300)
    throw new Error(`[z185] ${method} ${path} → ${r.status}: ${r.text.slice(0, 300)}`);
  return r.text ? JSON.parse(r.text) : null;
}

async function newContact(email: string): Promise<string> {
  const b = (await api('POST', '/api/v1/contacts', { email, firstName: 'Petra' })) as {
    data: { id: string };
  };
  return b.data.id;
}

/** A key of the seed user in this organisation with the stored role `role`. */
async function keyWithRole(role: 'editor' | 'viewer'): Promise<string> {
  const raw = `fm_live_${randomBytes(24).toString('hex')}`;
  await sql`
    INSERT INTO api_keys (org_id, user_id, name, key_hash, key_prefix, role)
    SELECT ${org}, id, ${`z185 ${role} ${tag}`},
           ${createHash('sha256').update(raw).digest('hex')}, ${raw.slice(0, 12)}, ${role}
    FROM users WHERE email = ${SEED_LOGIN.email}
  `;
  return raw;
}

interface Path {
  answer: number;
  code: string | null;
  mta: string[];
  engine: number;
}

/** One start as `credential` for `contactId` / `to`, delivered, counted at the engine. */
async function startAndDeliver(credential: string, contactId: string, to: string): Promise<Path> {
  const r = await call('POST', `/api/v1/contacts/${contactId}/gdpr/doi/${slug}`, credential, {});
  engine.handed.length = 0;
  const mta = await deliver(to);
  let code: string | null = null;
  try {
    code = (JSON.parse(r.text) as { code?: string }).code ?? null;
  } catch {
    code = null;
  }
  return {
    answer: r.status,
    code,
    mta,
    engine: engine.handed.filter(
      (m) => m.to.toLowerCase() === to.toLowerCase() && PP_SUBJECT.test(m.subject),
    ).length,
  };
}

/** The seed org as a whole: this file must leave it exactly as it found it. */
async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await sql<Record<string, unknown>[]>`
    SELECT (SELECT count(*)::int FROM email_events WHERE org_id = o.id) AS email_events,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id) AS suppressions,
           (SELECT count(*)::int FROM contacts WHERE org_id = o.id) AS contacts,
           (SELECT count(*)::int FROM processing_purposes WHERE org_id = o.id) AS purposes,
           (SELECT count(*)::int FROM contact_gdpr_consents WHERE org_id = o.id) AS gdpr_consents,
           (SELECT count(*)::int FROM organization_members WHERE org_id = o.id) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = o.id) AS api_keys,
           (SELECT count(*)::int FROM users WHERE org_id = o.id) AS users
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

describe('per-purpose DOI start to the engine: roles, live contact, three per 24 h (Z185)', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    seedBefore = await seedState();
    seedKey = await seedApiKey(sql, `z185-${tag}`);
    const [o] = await sql<{ id: string }[]>`
      INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
      VALUES (${`z185 ${tag}`}, ${`z185-${tag}`}, 'production', 'Obchod z185 s.r.o.',
              'Nádražní 1, 110 00 Praha')
      RETURNING id
    `;
    org = o!.id;
    await sql`
      INSERT INTO organization_members (org_id, user_id, email, role, status)
      SELECT ${org}, id, email, 'owner', 'active' FROM users WHERE email = ${SEED_LOGIN.email}
    `;
    const r = await call('POST', '/api/v1/me/orgs/switch', seedKey, { orgId: org });
    expect(r.status, r.text).toBe(200);
    owner = (JSON.parse(r.text) as { data: { token: string } }).data.token;
    editorKey = await keyWithRole('editor');
    viewerKey = await keyWithRole('viewer');
    slug = `z185-${tag}`;
    const p = (await api('POST', '/api/v1/gdpr/purposes', {
      slug,
      name: `z185 ${tag}`,
      legalBasis: 'consent',
    })) as { data: { id: string } };
    purposeId = p.data.id;
  }, 120_000);

  afterAll(async () => {
    for (const a of allAddresses) await deliver(a).catch(() => {});
    // Per-purpose tokens of this org and the limit keys of its purpose.
    let tokensRemoved = 0;
    let limitRemoved = 0;
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:*', 'COUNT', 1000);
      cursor = next;
      for (const key of keys) {
        if (purposeId && key.startsWith(`doi:limit-purpose:${purposeId}:`)) {
          await redis.del(key);
          limitRemoved++;
          continue;
        }
        if ((await redis.type(key)) !== 'string') continue;
        if ((await redis.get(key))?.includes(org)) {
          await redis.del(key);
          tokensRemoved++;
        }
      }
    } while (cursor !== '0');
    // The rate-limit buckets of this file's credentials.
    let bucketsRemoved = 0;
    for (const c of [seedKey, owner, editorKey, viewerKey].filter(Boolean)) {
      const d = createHash('sha256').update(c).digest('hex').slice(0, 32);
      cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', `*${d}*`, 'COUNT', 1000);
        cursor = next;
        for (const k of keys) {
          await redis.del(k);
          bucketsRemoved++;
        }
      } while (cursor !== '0');
    }
    await sql`DELETE FROM email_events WHERE org_id = ${org}`;
    await sql`DELETE FROM consent_events WHERE org_id = ${org}`;
    await sql`DELETE FROM contact_gdpr_consents WHERE org_id = ${org}`;
    await sql`DELETE FROM suppressions WHERE org_id = ${org}`;
    await sql`DELETE FROM audit_logs WHERE org_id = ${org}`;
    await sql`DELETE FROM api_keys WHERE org_id = ${org}`;
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await sql`DELETE FROM organizations WHERE id = ${org}`;
    await sql`DELETE FROM api_keys WHERE name = ${`integration z185-${tag}`}`;
    const [left] = await sql<Record<string, number>[]>`
      SELECT (SELECT count(*)::int FROM organizations WHERE id = ${org}) AS orgs,
             (SELECT count(*)::int FROM contacts WHERE org_id = ${org}) AS contacts,
             (SELECT count(*)::int FROM suppressions WHERE org_id = ${org}) AS suppressions,
             (SELECT count(*)::int FROM email_events WHERE org_id = ${org}) AS email_events,
             (SELECT count(*)::int FROM processing_purposes WHERE org_id = ${org}) AS purposes,
             (SELECT count(*)::int FROM organization_members WHERE org_id = ${org}) AS members,
             (SELECT count(*)::int FROM api_keys WHERE org_id = ${org} OR name LIKE ${`%z185%${tag}%`}) AS api_keys
    `;
    let doiLeft = 0;
    cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:*', 'COUNT', 1000);
      cursor = next;
      for (const key of keys) {
        if (key.startsWith(`doi:limit-purpose:${purposeId}:`)) doiLeft++;
        else if ((await redis.type(key)) === 'string' && (await redis.get(key))?.includes(org))
          doiLeft++;
      }
    } while (cursor !== '0');
    const seedAfter = await seedState();
    report.cells = cells;
    report.leftover = { ...left, doiLeft, tokensRemoved, limitRemoved, bucketsRemoved };
    report.seedOrg = { before: seedBefore, after: seedAfter };
    console.log(`Z185_WORKERS_CELLS_JSON ${JSON.stringify(report)}`);
    await sql.end();
    expect(left).toEqual({
      orgs: 0,
      contacts: 0,
      suppressions: 0,
      email_events: 0,
      purposes: 0,
      members: 0,
      api_keys: 0,
    });
    expect(doiLeft).toBe(0);
    // The seed organisation exactly as this file found it (a snapshot, not zeros).
    expect(seedAfter).toEqual(seedBefore);
  }, 120_000);

  it('P — owner session and editor key reach the engine once; a viewer key gets 403 and nothing', async () => {
    const out: Record<string, Path> = {};
    for (const [who, credential] of [
      ['owner', owner],
      ['editorKey', editorKey],
      ['viewerKey', viewerKey],
    ] as const) {
      const to = address(`p-${who}`);
      out[who] = await startAndDeliver(credential, await newContact(to), to);
    }
    cells.P = out;
    expect(out.owner).toEqual({ answer: 200, code: null, mta: ['sent'], engine: 1 });
    expect(out.editorKey).toEqual({ answer: 200, code: null, mta: ['sent'], engine: 1 });
    expect(out.viewerKey).toEqual({ answer: 403, code: 'FORBIDDEN', mta: [], engine: 0 });
  });

  it('D — a deleted contact: 404, nothing at the engine', async () => {
    const to = address('d-deleted');
    const id = await newContact(to);
    const del = await call('DELETE', `/api/v1/contacts/${id}`, owner);
    const d = await startAndDeliver(owner, id, to);
    cells.D = { delete: del.status, deleted: d };
    expect(del.status).toBe(204);
    expect(d).toEqual({ answer: 404, code: 'NOT_FOUND', mta: [], engine: 0 });
  });

  it('L — five starts for one address and purpose: five 200, three at the engine', async () => {
    const to = address('l5');
    const id = await newContact(to);
    const answers: number[] = [];
    for (let i = 0; i < 5; i++)
      answers.push(
        (await call('POST', `/api/v1/contacts/${id}/gdpr/doi/${slug}`, owner, {})).status,
      );
    engine.handed.length = 0;
    const mta = await deliver(to);
    const atEngine = engine.handed.filter(
      (m) => m.to.toLowerCase() === to && PP_SUBJECT.test(m.subject),
    ).length;
    cells.L = { answers, mta, engine: atEngine };
    expect(answers).toEqual([200, 200, 200, 200, 200]);
    expect(mta).toEqual(['sent', 'sent', 'sent']);
    expect(atEngine).toBe(3);
  });

  it('S4 — unsubscribed, complained, a manual row, an unsubscribe row: recorded as on master (not changed here)', async () => {
    const unsub = address('s4-unsub');
    const unsubId = await newContact(unsub);
    const put = await call('PUT', `/api/v1/contacts/${unsubId}`, owner, { status: 'unsubscribed' });
    const complained = address('s4-complained');
    const complainedId = await newContact(complained);
    await sql`UPDATE contacts SET status = 'complained' WHERE id = ${complainedId}`;
    await api('POST', '/api/v1/suppressions', { email: complained, reason: 'complaint' });
    const manual = address('s4-manual');
    const manualId = await newContact(manual);
    await api('POST', '/api/v1/suppressions', { email: manual, reason: 'manual' });
    const unsubRow = address('s4-unsub-row');
    const unsubRowId = await newContact(unsubRow);
    await api('POST', '/api/v1/suppressions', { email: unsubRow, reason: 'unsubscribe' });
    const rowsOf = async (email: string) =>
      (
        await sql<{ reason: string }[]>`
          SELECT reason FROM suppressions WHERE org_id = ${org} AND lower(email) = lower(${email})
          ORDER BY reason
        `
      ).map((r) => r.reason);
    const out = {
      put: put.status,
      rows: {
        unsubscribed: await rowsOf(unsub),
        complained: await rowsOf(complained),
        manual: await rowsOf(manual),
        unsubscribeRow: await rowsOf(unsubRow),
      },
      unsubscribed: await startAndDeliver(owner, unsubId, unsub),
      complained: await startAndDeliver(owner, complainedId, complained),
      manual: await startAndDeliver(owner, manualId, manual),
      unsubscribeRow: await startAndDeliver(owner, unsubRowId, unsubRow),
    };
    cells.S4 = out;
    expect(put.status).toBe(200);
    // As on master: every start answered and queued; the MTA gate stops the
    // 'complaint' and 'manual' rows and lets the unsubscribed address through
    // (the confirmation is transactional). Measured, not changed here.
    expect(out.rows).toEqual({
      unsubscribed: ['unsubscribe'],
      complained: ['complaint'],
      manual: ['manual'],
      unsubscribeRow: ['unsubscribe'],
    });
    const sent = { answer: 200, code: null, mta: ['sent'], engine: 1 };
    const stopped = { answer: 200, code: null, mta: ['suppressed'], engine: 0 };
    expect(out.unsubscribed).toEqual(sent);
    expect(out.complained).toEqual(stopped);
    expect(out.manual).toEqual(stopped);
    expect(out.unsubscribeRow).toEqual(sent);
  });
});
