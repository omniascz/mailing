/**
 * The double opt-in confirmation reaches an address suppressed as 'manual' — a
 * GDPR erasure among them — and nothing else does.
 *
 * ─── What was wrong (Z148, measured on master by sending) ────────────────────
 *
 * An erasure leaves a 'manual' suppression (by the address's hash), and
 * 'manual' stops transactional mail at the mta-sender gate (#225). The DOI
 * confirmation is transactional, so a person who was erased and signed up
 * again got "suppressed" at the gate and no e-mail. The confirmation is the
 * only thing that lifts the erasure (resubscribe.ts, Z145) — so the way back
 * existed only in a test that confirmed with the API's _devToken, which
 * production never returns. The same for a hand-added 'manual' row.
 *
 * Z170 narrowed this (rozhodnutí Michala 14. 10. (a): výjimka jen pro GDPR
 * hash): only the erasure row lets the confirmation through; an operator's
 * 'manual' row by the address stops it (the second test; the rest of this
 * file is unchanged — apps/workers/src/integration/doi-erasure-only walks the
 * full matrix).
 *
 * Owner's decision, 14 Oct 2026: the confirmation may go to a 'manual'
 * address — the recipient asked for it, and it carries only the link. Nothing
 * else changes: marketing waits for the click, and a bounce, a complaint, a
 * block or an invalid address still stop the confirmation too.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * API → queue → mta-sender, with the gRPC client the only stub. The person is
 * erased through the API, signs up through a form with double opt-in, and the
 * confirmation link is read out of the e-mail the engine was handed — not out
 * of the API's answer. A customer's own message to the same address, dressed
 * up with the purpose in every field a customer can fill, is still stopped.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { type Job, type JobType, type Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { suppressionEmailHash } from '../../../api/dist/services/suppressions/email.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import { processCampaignSplitter } from '../jobs/campaign-splitter.js';
import {
  batchSenderQueue,
  campaignSplitterQueue,
  mtaQueues,
  type BatchSenderJobData,
  type CampaignSplitterJobData,
  type MtaSendJobData,
} from '../queues/index.js';

// Hoisted with the mock: the factory runs while the imports above load.
const engine = vi.hoisted(() => ({
  handed: [] as { to: string; subject: string; html: string }[],
}));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string; subject: string; htmlBody: string }) => {
    engine.handed.push({ to: msg.toEmail, subject: msg.subject, html: msg.htmlBody });
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
const sendingDomain = `doiman-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const PURPOSE = 'doi_confirmation';
const DOI_SUBJECT = /^Confirm your subscription to /;

let seed: SeedOrg;
let owner: string;
const listIds: string[] = [];
const formIds: string[] = [];
const createdCampaigns: string[] = [];
const contactIds: string[] = [];
const allAddresses: string[] = [];

const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

/** The erasure fingerprint, by the API's own function under the API's key (Z150). */
const hashOf = suppressionEmailHash;
const address = (name: string) => {
  const a = `doiman-${name}-${tag}@test.local`;
  allAddresses.push(a);
  return a;
};

const job = <T>(data: T): Job<T> =>
  ({
    id: `doiman-${randomUUID()}`,
    timestamp: Date.now(),
    data,
    log: async () => {},
  }) as unknown as Job<T>;

async function idsOn(queue: Queue): Promise<Set<string>> {
  const jobs = await queue.getJobs([...ALL_STATES, 'completed'], 0, 5_000);
  return new Set(jobs.map((j) => String(j?.id)));
}

async function addedTo<T>(queue: Queue, before: Set<string>): Promise<T[]> {
  const jobs = await queue.getJobs([...ALL_STATES, 'completed'], 0, 5_000);
  return jobs.filter((j) => j && !before.has(String(j.id))).map((j) => j.data as T);
}

async function queuedFor(to: string): Promise<Job<MtaSendJobData>[]> {
  return ((await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[]).filter(
    (j) => j?.data?.toEmail?.toLowerCase() === to.toLowerCase(),
  );
}

/** Run every queued MTA job for `to` through the real processor, then drop it. */
async function deliver(to: string): Promise<string[]> {
  const out: string[] = [];
  for (const j of await queuedFor(to)) {
    const last = { data: j.data, opts: { attempts: 1 }, attemptsMade: 0, log: async () => {} };
    try {
      const r = (await processAtOrgRate(last as unknown as Job<MtaSendJobData>)) as {
        status: string;
      };
      out.push(r.status);
    } catch (err) {
      out.push(`threw: ${(err as Error).message}`);
    }
    await j.remove().catch(() => {});
  }
  return out;
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      ...authHeaders(owner),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await call(method, path, body);
  const text = await res.text();
  if (!res.ok) throw new Error(`[doiman] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const blocks = [
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
const globalStyles = {
  backgroundColor: '#fff',
  contentBackgroundColor: '#fff',
  fontFamily: 'Arial',
  linkColor: '#00f',
  textColor: '#000',
  contentWidth: 600,
};

async function newList(name: string): Promise<string> {
  const [list] = await sql<{ id: string }[]>`
    INSERT INTO lists (org_id, name, double_opt_in)
    VALUES (${seed.id}, ${`doiman ${name} ${tag}`}, 1) RETURNING id
  `;
  listIds.push(list!.id);
  return list!.id;
}

/** A signup form with double opt-in on `listId`. */
async function doiForm(listId: string): Promise<string> {
  const [form] = await sql<{ id: string }[]>`
    INSERT INTO signup_forms (org_id, list_id, name, fields, config, active)
    VALUES (${seed.id}, ${listId}, ${`doiman form ${tag} ${formIds.length}`},
            '[{"name":"email","label":"E-mail","type":"email","required":true}]'::jsonb,
            '{"doubleOptIn":true}'::jsonb, true)
    RETURNING id
  `;
  formIds.push(form!.id);
  return form!.id;
}

async function submit(formId: string, email: string): Promise<void> {
  const res = await fetch(`${API}/public/forms/${formId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  expect(res.status, await res.text()).toBe(200);
}

async function activeContact(email: string): Promise<string> {
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', 'active') RETURNING id
  `;
  contactIds.push(c!.id);
  return c!.id;
}

async function onList(listId: string, contactId: string): Promise<void> {
  await sql`
    INSERT INTO contact_lists (contact_id, list_id, confirmed_at)
    VALUES (${contactId}, ${listId}, now()) ON CONFLICT DO NOTHING
  `;
}

/** The person asks to be erased: a contact anonymised through the API. */
async function erase(email: string): Promise<void> {
  const id = await activeContact(email);
  const res = await call('POST', `/api/v1/contacts/${id}/anonymize`, {});
  expect(res.status, await res.text()).toBe(200);
}

async function erasureRows(email: string): Promise<string[]> {
  const rows = await sql<{ reason: string }[]>`
    SELECT reason FROM suppressions WHERE org_id = ${seed.id} AND email_hash = ${hashOf(email)}
  `;
  return rows.map((r) => r.reason);
}

/** The confirmation mails the engine was handed for `to`, after delivering its queue. */
async function confirmationsTo(to: string): Promise<{ mta: string[]; mails: string[] }> {
  engine.handed.length = 0;
  const mta = await deliver(to);
  const mails = engine.handed
    .filter((m) => m.to.toLowerCase() === to && DOI_SUBJECT.test(m.subject))
    .map((m) => m.html);
  return { mta, mails };
}

/**
 * The confirmation link as the recipient sees it in the mail. Fetched by its
 * path against API_URL, because the host part is API_PUBLIC_URL, which a test
 * run does not have to point at this process; the token is the mail's.
 */
function confirmPath(html: string): string {
  const link = /href="[^"]*?(\/api\/v1\/confirm\/[0-9a-f-]{36})"/.exec(html)?.[1];
  expect(link, 'no confirmation link in the mail').toBeTruthy();
  return link!;
}

async function preSendCount(campaignId: string): Promise<string> {
  const res = await call('GET', `/api/v1/campaigns/${campaignId}/pre-send-checks`);
  const text = await res.text();
  if (/No recipients in selected audience/.test(text)) return '0';
  const m = /"title":"([\d,]+) recipients"/.exec(text);
  return m ? m[1]!.replace(/,/g, '') : `? ${res.status} ${text.slice(0, 120)}`;
}

/** A campaign to `listId`, all the way to the engine: the pre-send count and who it reached. */
async function campaignTo(listId: string, recipients: string[]) {
  const subject = `Novinky ${randomUUID().slice(0, 6)}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `doiman ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail,
    listId,
    content: { subject, blocks, globalStyles },
  })) as { data: { id: string } };
  const campaignId = created.data.id;
  createdCampaigns.push(campaignId);
  const count = await preSendCount(campaignId);

  const beforeSplit = await idsOn(campaignSplitterQueue);
  await api('POST', `/api/v1/campaigns/${campaignId}/send`);
  const [split] = (
    await addedTo<CampaignSplitterJobData>(campaignSplitterQueue, beforeSplit)
  ).filter((d) => d.campaignId === campaignId);
  expect(split, 'no splitter job').toBeTruthy();
  const beforeBatch = await idsOn(batchSenderQueue);
  await processCampaignSplitter(job(split!));
  const batches = (await addedTo<BatchSenderJobData>(batchSenderQueue, beforeBatch)).filter(
    (d) => d.campaignId === campaignId,
  );
  for (const b of batches) await processBatchSender(job(b));

  engine.handed.length = 0;
  for (const to of recipients) await deliver(to);
  const reached = engine.handed
    .filter((m) => m.subject === subject)
    .map((m) => m.to.toLowerCase())
    .sort();
  console.log(`[doiman] campaign count=${count} reached=${JSON.stringify(reached)}`);
  return { count, reached };
}

describe('the double opt-in confirmation reaches a manual-suppressed address, and only it', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    owner = await seedApiKey(sql, `doiman-${tag}`);
    await sql`
      UPDATE api_keys SET role = 'owner'
      WHERE key_hash = ${createHash('sha256').update(owner).digest('hex')}
    `;
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
  }, 120_000);

  afterAll(async () => {
    for (const a of allAddresses) await deliver(a).catch(() => {});
    const hashes = allAddresses.map((a) => hashOf(a));
    await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email_hash = ANY(${hashes})`;
    await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND lower(email) = ANY(${allAddresses})`;
    if (createdCampaigns.length) {
      await sql`DELETE FROM email_events WHERE campaign_id = ANY(${createdCampaigns})`;
      await sql`DELETE FROM campaigns WHERE id = ANY(${createdCampaigns})`;
    }
    await sql`DELETE FROM email_events WHERE org_id = ${seed.id} AND lower(recipient) = ANY(${allAddresses})`;
    // Written here, or by a form or the subscribe route for one of these addresses.
    const viaApi = await sql<{ id: string }[]>`
      SELECT id FROM contacts WHERE org_id = ${seed.id} AND lower(email) = ANY(${allAddresses})
    `;
    const ids = [...new Set([...contactIds, ...viaApi.map((c) => c.id)])];
    if (ids.length) {
      await sql`DELETE FROM consent_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${ids})`;
    }
    if (formIds.length) {
      await sql`DELETE FROM signup_form_submissions WHERE form_id = ANY(${formIds})`;
      await sql`DELETE FROM signup_forms WHERE id = ANY(${formIds})`;
    }
    if (listIds.length) await sql`DELETE FROM lists WHERE id = ANY(${listIds})`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 180_000);

  it('an erased person signs up, gets the confirmation, clicks its link and is mailed again — not before', async () => {
    const person = address('erased');
    await erase(person);
    expect(await erasureRows(person)).toEqual(['manual']);

    const listId = await newList('return');
    await submit(await doiForm(listId), person);
    const control = address('control');
    await onList(listId, await activeContact(control));

    const { mta, mails } = await confirmationsTo(person);
    expect(mta, 'the confirmation was stopped at the gate').toEqual(['sent']);
    expect(mails).toHaveLength(1);

    // Sending the confirmation lifted nothing: the row, the status, and the
    // campaign before the click are what they were.
    expect(await erasureRows(person)).toEqual(['manual']);
    const [pending] = await sql<{ id: string; status: string }[]>`
      SELECT id, status FROM contacts
      WHERE org_id = ${seed.id} AND email = ${person} AND deleted_at IS NULL
    `;
    expect(pending!.status).toBe('pending');
    const before = await campaignTo(listId, [person, control]);
    expect(before.reached, 'marketing went out before the confirmation').toEqual([control]);

    // The link from the mail — the only place a recipient has it — and the
    // button on the page it opens, which posts it (Z176).
    const confirm = await fetch(`${API}${confirmPath(mails[0]!)}`, {
      method: 'POST',
      redirect: 'manual',
    });
    expect(confirm.status).toBeLessThan(400);

    expect(await erasureRows(person), 'the confirmation did not lift the erasure').toEqual([]);
    const [active] = await sql<{ status: string }[]>`
      SELECT status FROM contacts WHERE id = ${pending!.id}
    `;
    expect(active!.status).toBe('active');
    const proof = await sql<{ event_type: string; lifted: boolean }[]>`
      SELECT event_type, (proof_payload->>'liftedErasure')::boolean AS lifted
      FROM consent_events WHERE contact_id = ${pending!.id}
    `;
    expect(proof).toEqual([{ event_type: 'double_opt_in', lifted: true }]);

    const after = await campaignTo(listId, [person, control]);
    expect(after.reached).toEqual([person, control].sort());
    expect(after.count, 'the pre-send count is what is sent').toBe('2');
  }, 600_000);

  it('a hand-added manual row stops the confirmation, an erasure lets it through on the route; a hard bounce does not', async () => {
    const manual = address('manual');
    const res = await call('POST', '/api/v1/suppressions', { email: manual, reason: 'manual' });
    expect(res.status, await res.text()).toBeLessThan(300);
    await submit(await doiForm(await newList('manual-form')), manual);
    // Z170: was 1 (Z148). Rozhodnutí Michala 14. 10. (a): výjimka jen pro
    // GDPR hash — an operator's 'manual' row by the address stops it.
    expect((await confirmationsTo(manual)).mails).toHaveLength(0);

    // POST /lists/:id/subscribe calls the same sender.
    const erased = address('erased-sub');
    await erase(erased);
    const sub = await fetch(`${API}/api/v1/lists/${await newList('subscribe')}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: erased }),
    });
    expect(sub.status).toBe(202);
    expect((await confirmationsTo(erased)).mails).toHaveLength(1);

    // The address does not work: the confirmation is stopped like any mail.
    const bounced = address('bounced');
    const hb = await call('POST', '/api/v1/suppressions', {
      email: bounced,
      reason: 'hard_bounce',
    });
    expect(hb.status, await hb.text()).toBeLessThan(300);
    await submit(await doiForm(await newList('bounced')), bounced);
    const stopped = await confirmationsTo(bounced);
    expect(stopped.mta).toEqual(['suppressed']);
    expect(stopped.mails).toEqual([]);
  }, 600_000);

  it("a customer's own message to an erased address is stopped, whatever field claims the purpose", async () => {
    const person = address('forged');
    await erase(person);
    const subject = `Faktura ${randomUUID().slice(0, 6)}`;
    const res = await call('POST', '/api/v1/emails', {
      from: fromEmail,
      to: person,
      subject,
      html: '<p>x</p>',
      headers: { purpose: PURPOSE, 'X-Purpose': PURPOSE },
      tags: [{ name: 'purpose', value: PURPOSE }],
    });
    expect(res.status, await res.text()).toBe(200);
    const [queued] = await queuedFor(person);
    expect(queued, 'the message was not queued').toBeTruthy();
    // The customer's headers stay headers; the job carries no purpose of its own.
    expect((queued!.data as unknown as Record<string, unknown>).purpose).toBeUndefined();
    engine.handed.length = 0;
    expect(await deliver(person)).toEqual(['suppressed']);
    expect(engine.handed.filter((m) => m.subject === subject)).toEqual([]);
  }, 600_000);
});
