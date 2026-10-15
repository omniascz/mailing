/**
 * A marketing inline e-mail from a flow carries the sender and a working way
 * out; the transactional exception carries only the link its own HTML asked for.
 *
 * ─── What was wrong (measured on master 7c7864c, Z151, Z152, Z156, Z157) ─────
 *
 * The inline branch of /internal/workflow/send-email handed the job's html and
 * text to sendTransactionalEmail as they came: customHeaders {} (no
 * List-Unsubscribe), no footer, no sender — and the seeded ticketing wrapper's
 * `{{unsubscribe}}` reached the recipient as literal text. Active and
 * non_subscribed contacts got such marketing. A commercial message without an
 * opt-out and without the sender is a § 7(4) 480/2004 breach.
 *
 * Michal, 14. 10. 22:10, point 2, and the commissioner's decisions a–h (Z157):
 * every inline e-mail sent as 'workflow_marketing' gets a Czech footer with the
 * org's company name and postal address and an unsubscribe link (the signed
 * unsub token batch-sender uses for a flow, no campaignId), plus
 * List-Unsubscribe and List-Unsubscribe-Post; the transactional exception
 * (Z156) gets neither; `{{unsubscribe}}` / `{{unsubscribe_url}}` become that
 * link in every inline e-mail.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * The Day-of reminder seeded by the real POST /ticketing/seed-workflows (with
 * its priority 'transactional' = the exception) and the same node without the
 * priority (= marketing), started by POST /api/v1/events → executor → queue →
 * the real workflow-email worker in this process → the real API → the real
 * mta-sender, whose gRPC client is the only stub. The link is then followed
 * through the real API, GET and the RFC 8058 one-click POST.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The engine and a mailbox: what is asserted is what the engine was handed.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, type Job, type JobType, type Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { startWorkflowEmailWorker } from '../jobs/workflow-email-sender.js';
import { connection, mtaQueues, type MtaSendJobData } from '../queues/index.js';

interface Handed {
  to: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}
// Hoisted with the mock: the factory runs while the imports above load.
const engine = vi.hoisted(() => ({ handed: [] as Handed[] }));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: {
    toEmail: string;
    htmlBody: string;
    textBody: string;
    customHeaders?: Record<string, string>;
  }) => {
    engine.handed.push({
      to: msg.toEmail.toLowerCase(),
      html: msg.htmlBody,
      text: msg.textBody,
      headers: msg.customHeaders ?? {},
    });
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
const sendingDomain = `fio-${tag}.test`;
const UNSUB = /https?:\/\/[^\s"<>)]+\/api\/v1\/unsubscribe\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const ALL: JobType[] = [
  'waiting',
  'prioritized',
  'delayed',
  'paused',
  'active',
  'completed',
  'failed',
];
const OPEN: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];
const PROPS = { eventTitle: 'Hamlet', ticket_url: 'https://tix.example/fio' };

let seed: SeedOrg;
let token: string;
let startedAt: Date;
let countersBefore: { period_start: Date; sends: number }[] = [];
const workers: Worker[] = [];
const emailQ = new Queue('email', { connection });
const contactIds: string[] = [];
const workflowIds: string[] = [];
const flows = {} as Record<'marketing' | 'exception', string>;

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...authHeaders(token),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, text: await res.text() };
}

let serial = 0;
async function person(status: 'active' | 'unsubscribed') {
  const email = `fio-${status}-${++serial}-${tag}@test.local`;
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', ${status}) RETURNING id
  `;
  contactIds.push(c!.id);
  return { id: c!.id, email };
}

async function onlyActive(id: string) {
  await sql`UPDATE workflows SET status = 'inactive' WHERE id = ANY(${workflowIds})`;
  await sql`UPDATE workflows SET status = 'active' WHERE id = ${id}`;
}

/** The contact's newest job once settled: "state returnvalue". */
async function settled(contactId: string, since: number): Promise<string> {
  const appear = Date.now() + 5_000;
  for (const deadline = Date.now() + 90_000; Date.now() < deadline; ) {
    const jobs = (await emailQ.getJobs(ALL, 0, 10_000)).filter(
      (j) => j?.data?.contactId === contactId && j.timestamp >= since,
    );
    if (!jobs.length && Date.now() > appear) return 'no job';
    const states = await Promise.all(jobs.map((j) => j.getState()));
    if (jobs.length && states.every((s) => s === 'completed' || s === 'failed')) {
      const out: string[] = [];
      for (const stale of jobs) {
        const j = (await emailQ.getJob(stale.id!)) ?? stale;
        out.push(`${await j.getState()} ${JSON.stringify(j.returnvalue)}`);
      }
      return out.join(' | ');
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return 'did not settle';
}

/** Run every queued MTA job for `to` through the real processor: "status/purpose". */
async function deliver(to: string): Promise<string> {
  const jobs = ((await mtaQueues.other.getJobs(OPEN, 0, 5_000)) as Job<MtaSendJobData>[]).filter(
    (j) => j?.data?.toEmail?.toLowerCase() === to.toLowerCase(),
  );
  const out: string[] = [];
  for (const j of jobs) {
    const last = { data: j.data, opts: { attempts: 1 }, attemptsMade: 0, log: async () => {} };
    const r = (await processAtOrgRate(last as unknown as Job<MtaSendJobData>)) as {
      status: string;
    };
    out.push(`${r.status}/${j.data.purpose ?? 'transactional'}`);
    await j.remove().catch(() => {});
  }
  return out.join(',') || 'no mta job';
}

/** Fire the flow's event for the contact; the job, the MTA and what the engine got. */
async function fire(flow: 'marketing' | 'exception', p: { id: string; email: string }) {
  await onlyActive(flows[flow]);
  const since = Date.now();
  const before = engine.handed.length;
  const r = await call('POST', '/api/v1/events', {
    contactId: p.id,
    eventName: 'ticketing.day_of_reminder',
    properties: PROPS,
  });
  expect(r.status, r.text).toBeLessThan(300);
  const job = await settled(p.id, since);
  const mta = await deliver(p.email);
  const mail = engine.handed.slice(before).find((m) => m.to === p.email.toLowerCase());
  return { job, mta, mail };
}

describe('the opt-out of an inline flow e-mail', () => {
  beforeAll(async () => {
    startedAt = new Date();
    seed = await readSeedOrg(sql);
    token = await seedApiKey(sql, `fio-${tag}`);
    countersBefore = await sql`
      SELECT period_start, sends FROM plan_send_counters WHERE org_id = ${seed.id}
    `;
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
    // The seeds exactly as a customer gets them.
    const seeded = await call('POST', '/api/v1/ticketing/seed-workflows');
    expect(seeded.status, seeded.text).toBe(200);
    const created = (JSON.parse(seeded.text) as { data: { created: string[] } }).data.created;
    const rows = await sql<
      {
        id: string;
        name: string;
        description: string;
        nodes: { id: string; type: string; config: Record<string, unknown> }[];
        edges: unknown[];
      }[]
    >`
      SELECT id, name, description, nodes, edges FROM workflows
      WHERE org_id = ${seed.id} AND name LIKE 'Ticketing — %'
    `;
    for (const r of rows) {
      if (created.some((k) => r.description?.includes(`(${k})`))) workflowIds.push(r.id);
    }
    const dayOf = rows.find((r) => r.name === 'Ticketing — Day-of reminder')!;
    expect(dayOf.nodes.find((n) => n.id === 'send')!.config.priority).toBe('transactional');
    flows.exception = dayOf.id;
    // The same flow, its node without the priority: marketing.
    const nodes = dayOf.nodes.map((n) => {
      if (n.id !== 'send') return n;
      const { priority: _priority, ...config } = n.config;
      return { ...n, config };
    });
    const [w] = await sql<{ id: string }[]>`
      INSERT INTO workflows (org_id, name, status, trigger_type, trigger_config, nodes, edges)
      VALUES (${seed.id}, ${`fio marketing ${tag}`}, 'inactive', 'api_event',
              ${JSON.stringify({ eventName: 'ticketing.day_of_reminder' })}::jsonb,
              ${JSON.stringify(nodes)}::jsonb, ${JSON.stringify(dayOf.edges)}::jsonb)
      RETURNING id
    `;
    flows.marketing = w!.id;
    workflowIds.push(w!.id);
    workers.push(startWorkflowEmailWorker());
  }, 120_000);

  afterAll(async () => {
    for (const w of workers) await w.close();
    for (const j of await emailQ.getJobs(ALL, 0, 10_000)) {
      if (j && contactIds.includes(j.data?.contactId)) await j.remove().catch(() => {});
    }
    await emailQ.close();
    if (workflowIds.length) {
      await sql`DELETE FROM workflow_runs WHERE workflow_id = ANY(${workflowIds})`;
      await sql`DELETE FROM workflows WHERE id = ANY(${workflowIds})`;
    }
    if (contactIds.length) {
      await sql`DELETE FROM workflow_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM consent_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${contactIds})`;
    }
    await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email LIKE ${`%-${tag}@test.local`}`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql`DELETE FROM api_keys WHERE name = ${`integration fio-${tag}`}`;
    await sql`DELETE FROM audit_logs WHERE org_id = ${seed.id} AND created_at >= ${startedAt}`;
    // The seed org's plan counters as this file found them.
    await sql`DELETE FROM plan_send_counters WHERE org_id = ${seed.id}`;
    for (const c of countersBefore) {
      await sql`
        INSERT INTO plan_send_counters (org_id, period_start, sends)
        VALUES (${seed.id}, ${c.period_start}, ${c.sends})
      `;
    }
    await sql.end();
  }, 300_000);

  let firstLink = '';
  let firstContact = { id: '', email: '' };

  it('a marketing inline e-mail has the link and the sender in html and text, and List-Unsubscribe', async () => {
    const p = await person('active');
    const { job, mta, mail } = await fire('marketing', p);
    expect(job).toContain('"queued":true');
    expect(mta).toBe('sent/workflow_marketing');
    expect(mail, 'nothing reached the engine').toBeTruthy();
    const inHtml = mail!.html.match(UNSUB) ?? [];
    const inText = mail!.text.match(UNSUB) ?? [];
    // The wrapper's {{unsubscribe}} and the footer: the same link, twice.
    expect(inHtml.length).toBe(2);
    expect(inText.length).toBe(1);
    expect(new Set([...inHtml, ...inText]).size).toBe(1);
    expect(mail!.html).not.toMatch(/\{\{\s*unsubscribe/);
    expect(mail!.text).not.toMatch(/\{\{\s*unsubscribe/);
    for (const part of [mail!.html, mail!.text]) {
      // The seed org's sender (setup/seed-org.ts guarantees both are set).
      expect(part).toContain(seed.companyName);
      expect(part).toContain(seed.postalAddress);
      expect(part).toContain('Odhlásit z odběru');
    }
    expect(mail!.headers['List-Unsubscribe']).toBe(`<${inHtml[0]}>`);
    expect(mail!.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    firstLink = inHtml[0]!;
    firstContact = p;
  }, 300_000);

  it('the exception for an unsubscribed contact: no footer, no headers, the tag is the link', async () => {
    const p = await person('unsubscribed');
    const { mta, mail } = await fire('exception', p);
    expect(mta).toBe('sent/transactional');
    expect(mail, 'nothing reached the engine').toBeTruthy();
    expect(mail!.html.match(UNSUB)?.length).toBe(1);
    expect(mail!.html).toMatch(
      /<p style="font-size:12px;color:#94a3b8;margin-top:32px">https?:\/\/[^<]+\/api\/v1\/unsubscribe\/[^<]+<\/p><\/div>$/,
    );
    expect(mail!.html).not.toMatch(/\{\{\s*unsubscribe/);
    expect(mail!.html).not.toContain('data-fm-optout');
    expect(mail!.html).not.toContain(seed.postalAddress);
    expect(mail!.text).toBe('');
    expect(Object.keys(mail!.headers).filter((k) => /^list-unsubscribe/i.test(k))).toEqual([]);
  }, 300_000);

  it('the link unsubscribes (GET); the next marketing inline e-mail is skipped, the exception still goes', async () => {
    expect(firstLink, 'the first test found no link').not.toBe('');
    const path = firstLink.slice(firstLink.indexOf('/api/v1/unsubscribe/'));
    const res = await fetch(`${API}${path}`);
    expect(res.status).toBe(200);
    const [c] = await sql<
      { status: string }[]
    >`SELECT status::text AS status FROM contacts WHERE id = ${firstContact.id}`;
    expect(c!.status).toBe('unsubscribed');
    const again = await fire('marketing', firstContact);
    expect(again.job).toContain('contact status unsubscribed');
    expect(again.mta).toBe('no mta job');
    expect(again.mail).toBeUndefined();
    const ticket = await fire('exception', firstContact);
    expect(ticket.mta).toBe('sent/transactional');
    expect(ticket.mail).toBeTruthy();
  }, 300_000);

  it('the one-click POST to the List-Unsubscribe URL unsubscribes as well', async () => {
    const p = await person('active');
    const { mail } = await fire('marketing', p);
    const url = mail!.headers['List-Unsubscribe']!.slice(1, -1);
    const res = await fetch(`${API}${url.slice(url.indexOf('/api/v1/unsubscribe/'))}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    });
    expect(res.status).toBe(204);
    const [c] = await sql<
      { status: string }[]
    >`SELECT status::text AS status FROM contacts WHERE id = ${p.id}`;
    expect(c!.status).toBe('unsubscribed');
    const again = await fire('marketing', p);
    expect(again.job).toContain('contact status unsubscribed');
    expect(again.mail).toBeUndefined();
  }, 300_000);
});
