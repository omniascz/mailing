/**
 * A flow's ticket and change-of-event messages reach an unsubscribed,
 * complained or non_subscribed contact again — and nothing else does.
 *
 * ─── What was wrong (measured on master 1595f54, Z156) ───────────────────────
 *
 * Z152, Z153 and Z155 gated every flow SMS and inline flow e-mail as
 * marketing. That also stopped the seeded ticketing messages that are not
 * marketing at all: the day-of SMS with the ticket QR, the day-of reminder
 * e-mail and the notice that an event the contact bought has changed. On
 * master an unsubscribed buyer got none of them (Day-of SMS: MARKETING_REFUSED;
 * the two e-mails: "contact status unsubscribed").
 *
 * Michal, 14. 10. 22:10: a flow node with priority 'transactional' reaches an
 * unsubscribed, complained or non_subscribed contact, but only in a flow
 * started by a genuinely transactional event — a closed list in the code. The
 * commissioner's narrowest reading (Z156): only those three statuses, only
 * send_sms and the inline-HTML send_email, decided by the API from the
 * database (the job carries just workflowRunId and nodeId), and an e-mail with
 * the exception goes out with the transactional purpose (an 'unsubscribe' row
 * no longer stops it; complaint, hard bounce, invalid, manual and the GDPR
 * fingerprint still do).
 *
 * Z158 — Michal, 15. 10. 6:10, point 1b, overrides that narrower reading:
 * pending and archived are lifted too. Two assertions of this file said the
 * opposite (Day-of SMS: pending CONSENT_PENDING, archived MARKETING_REFUSED;
 * Day-of reminder: "contact status pending / archived"); they are that change
 * of behaviour and now expect the message to arrive. Bounced and the deleted
 * contact are unchanged (they wait on Michal).
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * The ticketing flows seeded by the real POST /ticketing/seed-workflows, and
 * flows of its own, all started by POST /api/v1/events → executor → queue →
 * the real workflow-sms / workflow-email workers in this process → the real
 * API. E-mail goes on through the real mta-sender; its gRPC client is the
 * only stub. SMS goes to a catch-all route whose provider does not exist:
 * "Unknown SMS provider" means past every gate, and no SMS leaves the machine.
 * The worker drops the API's 502 body, so each settled SMS job's data is
 * posted again to read why (as in Z155).
 *
 * WHAT THIS FILE CANNOT SEE
 * - Real providers and the engine. The ticketing cron that fires the day-of
 *   events in production (the events are posted here instead).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, type Job, type JobType, type Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { startWorkflowSmsWorker } from '../jobs/workflow-sms-sender.js';
import { startWorkflowEmailWorker } from '../jobs/workflow-email-sender.js';
import { connection, mtaQueues, type MtaSendJobData } from '../queues/index.js';

// Hoisted with the mock: the factory runs while the imports above load.
const engine = vi.hoisted(() => ({ handed: [] as string[] }));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string }) => {
    engine.handed.push(msg.toEmail.toLowerCase());
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
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET! };
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const tag = randomUUID().slice(0, 8);
const sendingDomain = `fte-${tag}.test`;
const sinkProvider = `fte-sink-${tag}`;
const SMS_REACHED = `Unknown SMS provider: ${sinkProvider}`;
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
const PROPS = { eventTitle: 'Hamlet', ticket_url: 'https://tix.example/fte' };

type State =
  | 'active'
  | 'unsub_row'
  | 'complained'
  | 'non_subscribed'
  | 'pending'
  | 'archived'
  | 'bounced'
  | 'deleted';
// pending and archived moved from STILL_REFUSED to LIFTED in Z158 (Michal, 15. 10. 6:10, 1b).
const LIFTED: State[] = [
  'active',
  'unsub_row',
  'complained',
  'non_subscribed',
  'pending',
  'archived',
];
const STILL_REFUSED: State[] = ['bounced', 'deleted'];

let seed: SeedOrg;
let token: string;
let countersBefore: { period_start: Date; sends: number }[] = [];
const workers: Worker[] = [];
const smsQ = new Queue('sms', { connection });
const emailQ = new Queue('email', { connection });
const contactIds: string[] = [];
const workflowIds: string[] = [];
const seededNames: string[] = [];
const flows = {} as Record<'daySms' | 'dayMail' | 'cartSms' | 'cartMail' | 'referral', string>;

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

interface Person {
  id: string;
  phone: string;
  email: string;
}
let serial = 0;
async function person(state: State): Promise<Person> {
  const phone = `+4207${String(10_000_000 + Math.floor(Math.random() * 89_999_999))}`;
  const email = `fte-${state}-${++serial}-${tag}@test.local`;
  const status = state === 'unsub_row' ? 'unsubscribed' : state === 'deleted' ? 'active' : state;
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, phone, first_name, status)
    VALUES (${seed.id}, ${email}, ${phone}, 'Petra', ${status}) RETURNING id
  `;
  contactIds.push(c!.id);
  if (state === 'deleted') await sql`UPDATE contacts SET deleted_at = now() WHERE id = ${c!.id}`;
  if (state === 'unsub_row') {
    await sql`INSERT INTO suppressions (org_id, email, reason) VALUES (${seed.id}, ${email}, 'unsubscribe')`;
  }
  if (state === 'bounced') {
    await sql`INSERT INTO suppressions (org_id, email, reason) VALUES (${seed.id}, ${email}, 'hard_bounce')`;
  }
  return { id: c!.id, phone, email };
}

/** An active api_event flow of this file: trigger → `node`. */
async function flowWith(
  eventName: string,
  node: { type: string; config: Record<string, unknown> },
) {
  const nodes = [
    { id: 'trigger', type: 'trigger', config: {} },
    { id: 'send', type: node.type, config: node.config },
  ];
  const [w] = await sql<{ id: string }[]>`
    INSERT INTO workflows (org_id, name, status, trigger_type, trigger_config, nodes, edges)
    VALUES (${seed.id}, ${`fte ${eventName} ${tag}`}, 'inactive', 'api_event',
            ${JSON.stringify({ eventName })}::jsonb, ${JSON.stringify(nodes)}::jsonb,
            ${JSON.stringify([{ id: 'e1', source: 'trigger', target: 'send' }])}::jsonb)
    RETURNING id
  `;
  workflowIds.push(w!.id);
  return w!.id;
}

/** Only these flows answer an event while the test runs. */
async function onlyActive(...ids: string[]) {
  await sql`UPDATE workflows SET status = 'inactive' WHERE id = ANY(${workflowIds})`;
  await sql`UPDATE workflows SET status = 'active' WHERE id = ANY(${ids})`;
}

/** The contact's jobs once settled: "state returnvalue", plus the SMS replay. */
async function settled(q: Queue, contactId: string): Promise<string> {
  const appear = Date.now() + 5_000;
  for (const deadline = Date.now() + 90_000; Date.now() < deadline; ) {
    const jobs = (await q.getJobs(ALL, 0, 10_000)).filter((j) => j?.data?.contactId === contactId);
    if (!jobs.length && Date.now() > appear) return 'no job';
    const states = await Promise.all(jobs.map((j) => j.getState()));
    if (jobs.length && states.every((s) => s === 'completed' || s === 'failed')) {
      const out: string[] = [];
      for (const stale of jobs) {
        const j = (await q.getJob(stale.id!)) ?? stale;
        out.push(`${await j.getState()} ${JSON.stringify(j.returnvalue)}`);
        if (q.name === 'sms') {
          const r = await fetch(`${API}/api/v1/internal/workflow/send-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...INTERNAL },
            body: JSON.stringify(j.data),
          });
          out.push(`replay ${r.status} ${await r.text()}`);
        }
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

/** Start `flowId`'s event for each state; what the SMS route / the engine saw. */
async function walk(
  eventName: string,
  kind: 'sms' | 'email',
  states: State[],
): Promise<Record<string, { job: string; mta: string; reached: boolean }>> {
  const got: Record<string, { job: string; mta: string; reached: boolean }> = {};
  await Promise.all(
    states.map(async (st) => {
      const p = await person(st);
      const r = await call('POST', '/api/v1/events', {
        contactId: p.id,
        eventName,
        properties: PROPS,
      });
      expect(r.status, r.text).toBeLessThan(300);
      const job = await settled(kind === 'sms' ? smsQ : emailQ, p.id);
      const mta = kind === 'email' ? await deliver(p.email) : '-';
      const reached =
        kind === 'sms' ? job.includes(SMS_REACHED) : engine.handed.includes(p.email.toLowerCase());
      got[st] = { job, mta, reached };
    }),
  );
  return got;
}

describe('the transactional exception of a ticketing flow', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await seedApiKey(sql, `fte-${tag}`);
    countersBefore = await sql`
      SELECT period_start, sends FROM plan_send_counters WHERE org_id = ${seed.id}
    `;
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
    await sql`
      INSERT INTO sms_routes (org_id, country_code, provider, priority, active, config)
      VALUES (${seed.id}, '*', ${sinkProvider}, 0, true, '{}'::jsonb)
    `;
    // The seeds exactly as a customer gets them.
    const seeded = await call('POST', '/api/v1/ticketing/seed-workflows');
    expect(seeded.status, seeded.text).toBe(200);
    const rows = await sql<{ id: string; name: string; description: string }[]>`
      SELECT id, name, description FROM workflows
      WHERE org_id = ${seed.id} AND name LIKE 'Ticketing — %'
    `;
    const created = (JSON.parse(seeded.text) as { data: { created: string[] } }).data.created;
    for (const r of rows) {
      if (created.some((k) => r.description?.includes(`(${k})`))) {
        seededNames.push(r.name);
        workflowIds.push(r.id);
      }
    }
    const byName = (n: string) => rows.find((r) => r.name === n)!.id;
    flows.daySms = byName('Ticketing — Day-of SMS (ticket QR)');
    flows.dayMail = byName('Ticketing — Day-of reminder');
    flows.cartSms = await flowWith('ticketing.cart_abandoned', {
      type: 'send_sms',
      config: { message: 'Košík {{first_name}}', priority: 'transactional' },
    });
    flows.cartMail = await flowWith('ticketing.cart_abandoned', {
      type: 'send_email',
      config: { subject: 'Košík', html: '<p>Košík {{first_name}}</p>', priority: 'transactional' },
    });
    // The seeded Referral's node (no priority), without its 72-hour wait.
    flows.referral = await flowWith('ticketing.order_paid', {
      type: 'send_email',
      config: { subject: 'Přiveďte kamaráda', html: '<p>Přiveďte kamaráda {{first_name}}</p>' },
    });
    workers.push(startWorkflowSmsWorker(), startWorkflowEmailWorker());
  }, 120_000);

  afterAll(async () => {
    for (const w of workers) await w.close();
    for (const q of [smsQ, emailQ]) {
      for (const j of await q.getJobs(ALL, 0, 10_000)) {
        if (j && contactIds.includes(j.data?.contactId)) await j.remove().catch(() => {});
      }
      await q.close();
    }
    if (workflowIds.length) {
      await sql`DELETE FROM workflow_runs WHERE workflow_id = ANY(${workflowIds})`;
      await sql`DELETE FROM workflows WHERE id = ANY(${workflowIds})`;
    }
    if (contactIds.length) {
      await sql`DELETE FROM workflow_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM sms_send_log WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${contactIds})`;
    }
    await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email LIKE ${`%-${tag}@test.local`}`;
    await sql`DELETE FROM sms_routes WHERE org_id = ${seed.id} AND provider = ${sinkProvider}`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql`DELETE FROM api_keys WHERE name = ${`integration fte-${tag}`}`;
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

  it('the seeded Day-of SMS reaches unsubscribed, complained, non_subscribed, pending and archived — not bounced or deleted', async () => {
    await onlyActive(flows.daySms);
    const got = await walk('ticketing.day_of_sms', 'sms', [...LIFTED, ...STILL_REFUSED]);
    for (const st of LIFTED) expect(got[st]!.job, st).toContain(SMS_REACHED);
    expect(got.bounced!.job).toContain('"code":"MARKETING_REFUSED"');
    // A flow loads no deleted contact, so there is no phone to queue a job for.
    expect(got.deleted!.job).toBe('no job');
    for (const st of STILL_REFUSED) expect(got[st]!.reached, st).toBe(false);
  }, 600_000);

  it('the seeded Day-of reminder e-mail reaches them on the transactional purpose — not bounced or deleted', async () => {
    await onlyActive(flows.dayMail);
    const got = await walk('ticketing.day_of_reminder', 'email', [...LIFTED, ...STILL_REFUSED]);
    for (const st of LIFTED) {
      expect(got[st]!.reached, `${st}: ${got[st]!.job} ${got[st]!.mta}`).toBe(true);
    }
    // The 'unsubscribe' row of unsub_row did not stop it: transactional purpose.
    for (const st of LIFTED) expect(got[st]!.mta, st).toBe('sent/transactional');
    expect(got.bounced!.job).toContain('contact status bounced');
    expect(got.deleted!.job).toContain('contact deleted');
    for (const st of STILL_REFUSED) expect(got[st]!.reached, st).toBe(false);
  }, 600_000);

  it('a transactional node on cart_abandoned and the Referral on order_paid stay marketing', async () => {
    await onlyActive(flows.cartSms, flows.cartMail, flows.referral);
    const cartSms = await walk('ticketing.cart_abandoned', 'sms', ['unsub_row']);
    expect(cartSms.unsub_row!.job).toContain('"code":"MARKETING_REFUSED"');
    expect(cartSms.unsub_row!.reached).toBe(false);
    const referral = await walk('ticketing.order_paid', 'email', ['unsub_row', 'active']);
    expect(referral.unsub_row!.job).toContain('contact status unsubscribed');
    expect(referral.unsub_row!.reached).toBe(false);
    // The control: the same flow still mails an active contact, as marketing.
    expect(referral.active!.mta).toBe('sent/workflow_marketing');
  }, 600_000);

  it('a transactional node on cart_abandoned (e-mail) stays marketing', async () => {
    await onlyActive(flows.cartMail);
    const cartMail = await walk('ticketing.cart_abandoned', 'email', ['unsub_row']);
    expect(cartMail.unsub_row!.job).toContain('contact status unsubscribed');
    expect(cartMail.unsub_row!.reached).toBe(false);
  }, 600_000);

  it('a forged job — the right node id, the run of another flow — gets nothing', async () => {
    await onlyActive();
    // A run of the Referral flow: its trigger IS on the list, its node 'send' is no
    // transactional node. The day-of flows' node is also called 'send'.
    const [run] = await sql<{ id: string }[]>`
      SELECT id FROM workflow_runs WHERE workflow_id = ${flows.referral} LIMIT 1
    `;
    expect(run, 'no Referral run to borrow').toBeTruthy();
    const ps = await person('unsub_row');
    await smsQ.add('workflow-sms', {
      orgId: seed.id,
      contactId: ps.id,
      workflowRunId: run!.id,
      nodeId: 'send',
      phone: ps.phone,
      message: 'Vstupenka',
    });
    const sms = await settled(smsQ, ps.id);
    expect(sms).toContain('"code":"MARKETING_REFUSED"');
    expect(sms).not.toContain(SMS_REACHED);
    const pm = await person('unsub_row');
    await emailQ.add('workflow-email', {
      orgId: seed.id,
      contactId: pm.id,
      workflowRunId: run!.id,
      nodeId: 'send',
      subject: 'Vstupenka',
      html: '<p>Vstupenka</p>',
    });
    expect(await settled(emailQ, pm.id)).toContain('contact status unsubscribed');
    expect(await deliver(pm.email)).toBe('no mta job');
    expect(engine.handed).not.toContain(pm.email.toLowerCase());
  }, 300_000);
});
