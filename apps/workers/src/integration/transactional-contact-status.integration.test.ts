/**
 * A transactional hard bounce marks the contact the address belongs to, and
 * every internal write mta-sender makes says what it really did.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 *  - sendTransactionalEmail puts a random contactId (and the orgId as the
 *    campaignId) on a job whose caller named no contact — /emails never does
 *    (lib/queues.ts). On a hard bounce mta-sender PATCHed that random id, the
 *    UPDATE matched nothing, and the route still answered 200 ok:true, so the
 *    job reported contactStatus 'written' while the contact the address belongs
 *    to stayed 'active'.
 *  - recordEvent caught only a thrown fetch, so a refused event write went
 *    unread — the last of the five internal calls that did.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Receipts through /emails, run through the real mta-sender; the gRPC stub
 * answers 550 for the addresses that must bounce. mta-sender's own fetch is
 * wrapped to record what each internal write answered. Assertions are on the
 * contact row, the job result and those answers.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * Every case that must report "nothing written" is followed by one that must
 * write: a known address, a campaign bounce on a real contact id, an event
 * that is stored.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The Go engine and SMTP.
 * - Sentry: failures are asserted on the log line and the job result.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Job, JobType } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { loginAsSeedUser } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processMtaSend } from '../jobs/mta-sender.js';
import { mtaQueues, type MtaSendJobData } from '../queues/index.js';

// Hoisted with the mock: the factory runs while the imports above load.
const engine = vi.hoisted(() => ({
  answer: new Map<string, { code: number; message: string }>(),
}));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string }) => {
    const a = engine.answer.get(msg.toEmail);
    return {
      success: !a,
      messageId: 'm',
      smtpCode: a?.code ?? 250,
      smtpMessage: a?.message ?? 'OK',
      error: '',
      durationMs: '1',
      sendingIp: '',
    };
  },
}));

const API = process.env.API_URL!;
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET!;
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

/**
 * This file's own bucket in the API's 100/min limiter (`x-api-key ??
 * request.ip`, api/plugins/rate-limit.ts), as in recipient-resubscribe: an
 * unknown key matches nothing and the request continues as the Bearer session.
 */
const RATE_LIMIT_BUCKET = `integration-txstatus-${randomUUID()}`;

const tag = randomUUID().slice(0, 8);
const sendingDomain = `txstatus-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const addr = (name: string) => `txstatus-${name}-${tag}@test.local`;

let seed: SeedOrg;
let token: string;
const contactIds: string[] = [];
const allAddresses: string[] = [];

/** Every internal write mta-sender made, with what it answered. */
const writes: { kind: string; status: number; body: string }[] = [];
const realFetch = globalThis.fetch;

const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

/** Run every queued MTA job for `to` through the real processor, then drop it. */
async function deliver(to: string): Promise<Record<string, unknown>[]> {
  const jobs = (
    (await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[]
  ).filter((j) => j?.data?.toEmail === to);
  const out: Record<string, unknown>[] = [];
  for (const j of jobs) {
    out.push((await processMtaSend(j)) as Record<string, unknown>);
    await j.remove().catch(() => {});
  }
  return out;
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await realFetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-api-key': RATE_LIMIT_BUCKET,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`[txstatus] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** One receipt through /emails that bounces hard, run through mta-sender. */
async function bouncingReceipt(to: string): Promise<Record<string, unknown>> {
  engine.answer.set(to, { code: 550, message: '5.1.1 user unknown' });
  writes.length = 0;
  await api('POST', '/api/v1/emails', {
    from: fromEmail,
    to,
    subject: 'Faktura',
    html: '<p>x</p>',
  });
  const [result] = await deliver(to);
  engine.answer.delete(to);
  return result!;
}

async function contact(name: string, status = 'active'): Promise<{ id: string; email: string }> {
  const email = addr(name);
  allAddresses.push(email);
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', ${status}) RETURNING id
  `;
  contactIds.push(c!.id);
  return { id: c!.id, email };
}

async function statusOf(id: string): Promise<string> {
  const [c] = await sql<{ status: string }[]>`SELECT status FROM contacts WHERE id = ${id}`;
  return c!.status;
}

/** The internal status PATCH, called as mta-sender calls it. */
async function patchStatus(contactId: string, body: Record<string, unknown>) {
  const res = await realFetch(`${API}/api/v1/internal/contacts/${contactId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: JSON.parse(await res.text()) as Record<string, unknown> };
}

describe('transactional hard bounces mark the contact; internal writes tell the truth', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await loginAsSeedUser(API, 'txstatus');
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true)
    `;
    // Pass-through: records what each internal write answered.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const res = await realFetch(input, init);
      const url = typeof input === 'string' ? input : String((input as Request).url ?? input);
      const kind = url.endsWith('/status')
        ? 'status'
        : url.endsWith('/internal/events')
          ? 'event'
          : url.endsWith('/internal/suppressions')
            ? 'suppression'
            : null;
      if (kind && init?.method && init.method !== 'GET') {
        writes.push({ kind, status: res.status, body: (await res.clone().text()).slice(0, 140) });
      }
      return res;
    });
    errorSpy = vi.spyOn(console, 'error');
  }, 120_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const a of allAddresses) await deliver(a).catch(() => {});
    if (allAddresses.length)
      await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email = ANY(${allAddresses})`;
    if (contactIds.length) {
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${contactIds})`;
    }
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 120_000);

  it('the status PATCH says what it changed: nothing for an unknown id, nothing for the same status, a change for a change', async () => {
    const c = await contact('patch');
    const unknown = await patchStatus(randomUUID(), { orgId: seed.id, status: 'bounced' });
    const changed = await patchStatus(c.id, { orgId: seed.id, status: 'bounced' });
    const same = await patchStatus(c.id, { orgId: seed.id, status: 'bounced' });
    console.log(
      `[z119] PATCH unknown=${JSON.stringify(unknown)} changed=${JSON.stringify(changed)} same=${JSON.stringify(same)} row=${await statusOf(c.id)}`,
    );
    expect(unknown.body.data).toMatchObject({ matched: 0, changed: 0 });
    expect(same.body.data).toMatchObject({ matched: 1, changed: 0 });
    expect(changed.body.data).toMatchObject({ matched: 1, changed: 1 });
    expect(await statusOf(c.id)).toBe('bounced');
  }, 60_000);

  it('a receipt to an address with no contact bounces: the job says no contact was marked; one to a known address marks it', async () => {
    const stranger = addr('stranger');
    allAddresses.push(stranger);
    const unknown = await bouncingReceipt(stranger);
    const unknownWrites = [...writes];
    console.log(
      `[z119] /emails → no contact: result=${JSON.stringify(unknown)} writes=${JSON.stringify(unknownWrites)}`,
    );
    expect(unknown.status).toBe('hard_bounce');
    expect(unknown.contactStatus, 'the job claimed a contact was marked').toBe('no_contact');

    // Must pass: the same path for an address that is a contact.
    const known = await contact('known');
    const result = await bouncingReceipt(known.email);
    const row = await statusOf(known.id);
    console.log(
      `[z119] /emails → known contact: result=${JSON.stringify(result)} writes=${JSON.stringify(writes)} row=${row}`,
    );
    expect(result.contactStatus).toBe('written');
    expect(row, 'the contact the address belongs to was not marked').toBe('bounced');
  }, 120_000);

  it('a contact already bounced is reported unchanged, and a campaign bounce on a real id still writes', async () => {
    const already = await contact('already', 'bounced');
    const r = await bouncingReceipt(already.email);
    console.log(`[z119] /emails → already bounced: result=${JSON.stringify(r)}`);
    expect(r.contactStatus).toBe('unchanged');

    // Must pass: a job carrying the real contact id, as batch-sender builds one.
    const real = await contact('real-id');
    engine.answer.set(real.email, { code: 550, message: '5.1.1 user unknown' });
    const res = (await processMtaSend({
      id: `txstatus-${randomUUID()}`,
      data: {
        messageId: randomUUID(),
        orgId: seed.id,
        campaignId: randomUUID(),
        contactId: real.id,
        fromEmail,
        fromName: 'Obchod',
        toEmail: real.email,
        subject: 'Novinky',
        htmlBody: '<p>x</p>',
        stream: 'broadcast',
      },
      opts: { attempts: 1 },
      attemptsMade: 0,
      log: async () => {},
    } as unknown as Job<MtaSendJobData>)) as Record<string, unknown>;
    engine.answer.delete(real.email);
    expect(res.contactStatus).toBe('written');
    expect(await statusOf(real.id)).toBe('bounced');
  }, 120_000);

  it('an event write that fails is reported; one that succeeds is not', async () => {
    errorSpy.mockClear();
    // A campaign id that is not a uuid: /internal/events refuses it in its
    // schema, a failure that is not about which row it points at.
    const to = addr('event-fails');
    allAddresses.push(to);
    const res = (await processMtaSend({
      id: `txstatus-${randomUUID()}`,
      data: {
        messageId: randomUUID(),
        orgId: seed.id,
        campaignId: 'not-a-campaign-id',
        contactId: randomUUID(),
        fromEmail,
        fromName: 'Obchod',
        toEmail: to,
        subject: 'Novinky',
        htmlBody: '<p>x</p>',
        stream: 'broadcast',
      },
      opts: { attempts: 1 },
      attemptsMade: 0,
      log: async () => {},
    } as unknown as Job<MtaSendJobData>)) as Record<string, unknown>;
    const logged = errorSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.includes('event-write-failed'));
    console.log(
      `[z119] event fails: result=${JSON.stringify(res)} logged=${JSON.stringify(logged)}`,
    );
    expect(res.status).toBe('sent');
    expect(
      logged.some((l) => /HTTP [45]\d\d/.test(l)),
      'the event failure was not logged',
    ).toBe(true);
    expect(res.events, 'the job result does not say an event was lost').toBe('failed');

    // A receipt through /emails: its delivery is stored with no campaign (its
    // placeholder ids used to be refused on foreign keys for every event —
    // transactional-events.integration.test.ts), the job says 'written', and
    // nothing is logged as a failure.
    errorSpy.mockClear();
    const receiptTo = addr('event-receipt');
    allAddresses.push(receiptTo);
    writes.length = 0;
    await api('POST', '/api/v1/emails', {
      from: fromEmail,
      to: receiptTo,
      subject: 'Faktura',
      html: '<p>x</p>',
    });
    const [rc] = await deliver(receiptTo);
    const rcLogged = errorSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.includes('event-write-failed'));
    console.log(
      `[z119] event receipt: result=${JSON.stringify(rc)} writes=${JSON.stringify(writes)} errors=${rcLogged.length}`,
    );
    expect(rc!.status).toBe('sent');
    expect(rc!.events).toBe('written');
    expect(rcLogged).toEqual([]);
    const [rcStored] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM email_events
      WHERE message_id = ${rc!.messageId as string} AND event_type = 'deliver' AND campaign_id IS NULL
    `;
    expect(rcStored!.n, 'the receipt delivery was not stored').toBe(1);

    // Must pass: a job naming a real campaign and contact — the events are
    // stored, the job says so, and nothing is logged.
    errorSpy.mockClear();
    const known = await contact('event-ok');
    const [list] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`txstatus ${tag}`}) RETURNING id
    `;
    const created = (await api('POST', '/api/v1/campaigns', {
      name: `txstatus ${tag}`,
      subject: 'Novinky',
      fromName: 'Obchod',
      fromEmail,
      listId: list!.id,
      content: { html: '<p>x</p><a href="{{unsubscribe_url}}">Odhlásit</a>' },
    })) as { data: { id: string } };
    const messageId = randomUUID();
    const ok = (await processMtaSend({
      id: `txstatus-${randomUUID()}`,
      data: {
        messageId,
        orgId: seed.id,
        campaignId: created.data.id,
        contactId: known.id,
        fromEmail,
        fromName: 'Obchod',
        toEmail: known.email,
        subject: 'Novinky',
        htmlBody: '<p>x</p>',
        stream: 'broadcast',
      },
      opts: { attempts: 1 },
      attemptsMade: 0,
      log: async () => {},
    } as unknown as Job<MtaSendJobData>)) as Record<string, unknown>;
    const stored = await sql<{ event_type: string }[]>`
      SELECT event_type FROM email_events WHERE message_id = ${messageId} ORDER BY event_type
    `;
    const okLogged = errorSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.includes('event-write-failed'));
    console.log(
      `[z119] event ok: result=${JSON.stringify(ok)} stored=${JSON.stringify(stored.map((e) => e.event_type))}`,
    );
    await sql`DELETE FROM email_events WHERE campaign_id = ${created.data.id}`;
    await sql`DELETE FROM campaigns WHERE id = ${created.data.id}`;
    await sql`DELETE FROM lists WHERE id = ${list!.id}`;
    expect(ok.status).toBe('sent');
    expect(ok.events).toBe('written');
    expect(stored.map((e) => e.event_type).sort()).toEqual(['deliver', 'send']);
    expect(okLogged).toEqual([]);
  }, 120_000);
});
