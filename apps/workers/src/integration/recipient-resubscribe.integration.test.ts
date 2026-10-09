/**
 * A recipient who comes back on their own gets marketing again — and a
 * recipient whose address bounced or complained does not, whatever they click.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * Two paths let the recipient undo an unsubscribe, and neither finished:
 *
 *  - The preference centre's `globalResubscribe` deleted the suppression row
 *    but left contacts.status at 'unsubscribed', and batch-sender refuses on
 *    that status. It also deleted the row whatever its reason, so a token from
 *    any old email lifted a hard bounce or a complaint.
 *  - The double opt-in confirmation set status 'active' from any status —
 *    bounced and complained included — and touched neither the suppression nor
 *    a list row a global unsubscribe had closed, so the person who confirmed
 *    still got nothing.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * The recipient's own act on the real public routes, then a real campaign to
 * the list: API /send, the splitter, batch-sender, mta-sender. The only stub is
 * the gRPC client, where the message would leave; the assertions are on what
 * it was handed, not on rows.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "Not sent" is also what a broken campaign produces. Every campaign here also
 * goes to a clean control contact on the same list, which must reach the
 * engine, and every refusing case is followed in the file by one that must
 * pass on the same route.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The Go engine and SMTP: the stub sits where the gRPC call would go.
 * - The HTML page of the preference centre; it does not offer a global
 *   resubscribe, so the JSON POST is the only way in.
 * - Flows and transactional mail on these contacts — mta-suppression-gate and
 *   batch-sender-unsubscribed cover those.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Job, JobType, Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { createTrackingToken } from '@forgemsg/shared';
import { loginAsSeedUser } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processMtaSend } from '../jobs/mta-sender.js';
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
const engine = vi.hoisted(() => [] as { to: string; subject: string }[]);
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string; subject: string }) => {
    engine.push({ to: msg.toEmail, subject: msg.subject });
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
const sendingDomain = `resub-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const addr = (name: string) => `resub-${name}-${tag}@test.local`;

let seed: SeedOrg;
let token: string;
let templateId: string;
const listIds: string[] = [];
const createdCampaigns: string[] = [];
const contactIds: string[] = [];
const allAddresses: string[] = [];

const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

const job = <T>(data: T): Job<T> =>
  ({
    id: `resub-${randomUUID()}`,
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

/** Run every queued MTA job for `to` through the real processor, then drop it. */
async function deliver(to: string): Promise<string[]> {
  const jobs = (
    (await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[]
  ).filter((j) => j?.data?.toEmail === to);
  const out: string[] = [];
  for (const j of jobs) {
    const r = (await processMtaSend(j)) as { status: string };
    out.push(`${j.data.subject} → ${r.status}`);
    await j.remove().catch(() => {});
  }
  return out;
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[resub] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** A public route, as the recipient's browser or a landing page calls it. */
async function pub(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    redirect: 'manual',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
}

const blocks = [
  {
    id: 'r1',
    type: 'text',
    content: '<p>Dobrý den.</p>',
    fontSize: '15px',
    fontFamily: 'Arial',
    color: '#111827',
    lineHeight: '1.5',
    textAlign: 'left',
  },
  {
    id: 'r2',
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
    INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`resub ${name} ${tag}`}) RETURNING id
  `;
  listIds.push(list!.id);
  return list!.id;
}

/** A contact on `listId`, in `status`, with a suppression for `reason` if given. */
async function contactOn(
  listId: string,
  name: string,
  status: string,
  reason?: string,
): Promise<{ id: string; email: string }> {
  const email = addr(name);
  allAddresses.push(email);
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', ${status}) RETURNING id
  `;
  contactIds.push(c!.id);
  await sql`INSERT INTO contact_lists (contact_id, list_id, confirmed_at) VALUES (${c!.id}, ${listId}, now())`;
  if (reason) {
    await sql`INSERT INTO suppressions (org_id, email, reason) VALUES (${seed.id}, ${email}, ${reason})`;
  }
  return { id: c!.id, email };
}

const prefToken = (contactId: string) =>
  createTrackingToken({
    type: 'pref',
    orgId: seed.id,
    contactId,
    ts: Math.floor(Date.now() / 1000),
  });

/** Unsubscribed the way the product does it: the recipient leaves everything. */
async function unsubscribeEverything(contactId: string): Promise<void> {
  const res = await pub('POST', `/p/center/${prefToken(contactId)}`, { globalUnsubscribe: true });
  expect(res.status, 'global unsubscribe').toBe(200);
}

/** status · suppression reasons · this list's row — what the raw output shows. */
async function state(contactId: string, listId: string): Promise<string> {
  const [c] = await sql<{ status: string; email: string }[]>`
    SELECT status, email FROM contacts WHERE id = ${contactId}
  `;
  const supp = await sql<{ reason: string }[]>`
    SELECT reason FROM suppressions WHERE org_id = ${seed.id} AND email = ${c!.email} ORDER BY reason
  `;
  const [row] = await sql<{ unsubscribed_at: Date | null; confirmed_at: Date | null }[]>`
    SELECT unsubscribed_at, confirmed_at FROM contact_lists
    WHERE contact_id = ${contactId} AND list_id = ${listId}
  `;
  const list = !row ? 'none' : row.unsubscribed_at ? 'closed' : 'open';
  return `status=${c!.status} suppressions=${JSON.stringify(supp.map((s) => s.reason))} list=${list}`;
}

/**
 * A marketing campaign to `listId`, all the way to the engine. Returns the
 * addresses the engine was handed THIS campaign for — by subject, so the DOI
 * confirmation mail on the same queue does not count as marketing.
 */
async function campaignTo(listId: string, label: string, recipients: string[]): Promise<string[]> {
  const subject = `Novinky ${label} ${tag}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `resub ${label} ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail,
    listId,
    content: { subject, blocks, globalStyles },
  })) as { data: { id: string } };
  const campaignId = created.data.id;
  createdCampaigns.push(campaignId);

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

  engine.length = 0;
  const log: string[] = [];
  for (const to of recipients)
    log.push(`${to.split('@')[0]}: ${JSON.stringify(await deliver(to))}`);
  const reached = engine.filter((m) => m.subject === subject).map((m) => m.to);
  console.log(
    `[z115] campaign "${label}" mta=${log.join(' | ')} engine=${JSON.stringify(reached)}`,
  );
  return reached;
}

describe('the recipient comes back on their own (real DB + Redis + API, to the engine)', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await loginAsSeedUser(API, 'resub');
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true)
    `;
    const [tpl] = await sql<{ id: string }[]>`
      INSERT INTO templates (org_id, name, subject, preheader, blocks, global_styles, locale)
      VALUES (${seed.id}, ${`resub ${tag}`}, 'Novinky', '', ${sql.json(blocks)},
              ${sql.json(globalStyles)}, 'cs')
      RETURNING id
    `;
    templateId = tpl!.id;
  }, 120_000);

  afterAll(async () => {
    for (const a of allAddresses) await deliver(a).catch(() => {});
    if (allAddresses.length)
      await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email = ANY(${allAddresses})`;
    if (createdCampaigns.length) {
      await sql`DELETE FROM email_events WHERE campaign_id = ANY(${createdCampaigns})`;
      await sql`DELETE FROM campaigns WHERE id = ANY(${createdCampaigns})`;
    }
    const doiContacts = await sql<{ id: string }[]>`
      SELECT id FROM contacts WHERE org_id = ${seed.id} AND email = ANY(${allAddresses})
    `;
    const ids = [...new Set([...contactIds, ...doiContacts.map((c) => c.id)])];
    if (ids.length) {
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${ids})`;
    }
    if (listIds.length) await sql`DELETE FROM lists WHERE id = ANY(${listIds})`;
    if (templateId) await sql`DELETE FROM templates WHERE id = ${templateId}`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 120_000);

  describe('preference centre — globalResubscribe', () => {
    async function resubscribe(contactId: string, listId: string): Promise<number> {
      const res = await pub('POST', `/p/center/${prefToken(contactId)}`, {
        globalResubscribe: true,
        resubscribeToLists: [listId],
      });
      return res.status;
    }

    for (const [status, reason] of [
      ['bounced', 'hard_bounce'],
      ['complained', 'complaint'],
    ] as const) {
      it(`${status} (${reason}): the click lifts nothing, the campaign does not reach them`, async () => {
        const listId = await newList(`pref-${status}`);
        const subject = await contactOn(listId, `pref-${status}`, status, reason);
        const control = await contactOn(listId, `pref-${status}-ctl`, 'active');
        const before = await state(subject.id, listId);
        const code = await resubscribe(subject.id, listId);
        const after = await state(subject.id, listId);
        console.log(
          `[z115] pref ${status} BEFORE ${before} → POST /p/center {globalResubscribe} ${code} → AFTER ${after}`,
        );

        const reached = await campaignTo(listId, `pref-${status}`, [subject.email, control.email]);
        expect(reached, 'the control must reach the engine').toContain(control.email);
        expect(reached, `a ${reason} address reached the engine`).not.toContain(subject.email);
        expect(after).toBe(`status=${status} suppressions=["${reason}"] list=open`);
      }, 120_000);
    }

    it('a hard-bounced address that also unsubscribed: the click does not lift the bounce', async () => {
      // unsubscribeContact sets the status, and its suppression insert loses to
      // the bounce row already there — so the status says 'unsubscribed' and
      // the only row says 'hard_bounce'. Only the reason tells them apart.
      const listId = await newList('pref-unsub-bounced');
      const subject = await contactOn(listId, 'pref-unsub-bounced', 'bounced', 'hard_bounce');
      const control = await contactOn(listId, 'pref-unsub-bounced-ctl', 'active');
      await unsubscribeEverything(subject.id);
      const before = await state(subject.id, listId);
      const code = await resubscribe(subject.id, listId);
      const after = await state(subject.id, listId);
      console.log(
        `[z115] pref unsubscribed+hard_bounce BEFORE ${before} → POST /p/center {globalResubscribe} ${code} → AFTER ${after}`,
      );

      expect(before).toBe('status=unsubscribed suppressions=["hard_bounce"] list=closed');
      const reached = await campaignTo(listId, 'pref-unsub-bounced', [
        subject.email,
        control.email,
      ]);
      expect(reached, 'the control must reach the engine').toContain(control.email);
      expect(reached, 'a hard_bounce address reached the engine').not.toContain(subject.email);
      expect(after).toBe('status=unsubscribed suppressions=["hard_bounce"] list=open');
    }, 120_000);

    it('unsubscribed: after the recipient resubscribes, the campaign reaches them', async () => {
      const listId = await newList('pref-unsub');
      const subject = await contactOn(listId, 'pref-unsub', 'active');
      const control = await contactOn(listId, 'pref-unsub-ctl', 'active');
      await unsubscribeEverything(subject.id);
      const before = await state(subject.id, listId);
      const code = await resubscribe(subject.id, listId);
      const after = await state(subject.id, listId);
      console.log(
        `[z115] pref unsubscribed BEFORE ${before} → POST /p/center {globalResubscribe} ${code} → AFTER ${after}`,
      );

      expect(before).toBe('status=unsubscribed suppressions=["unsubscribe"] list=closed');
      expect(code).toBe(200);
      const reached = await campaignTo(listId, 'pref-unsub', [subject.email, control.email]);
      expect(reached).toContain(control.email);
      expect(reached, 'the resubscribed recipient did not reach the engine').toContain(
        subject.email,
      );
      expect(after).toBe('status=active suppressions=[] list=open');

      // And leaving again still works: the next campaign does not reach them.
      await unsubscribeEverything(subject.id);
      const again = await campaignTo(listId, 'pref-unsub-again', [subject.email, control.email]);
      expect(again).toContain(control.email);
      expect(again, 'an unsubscribe after the resubscribe did not hold').not.toContain(
        subject.email,
      );
    }, 180_000);

    it('a contact who never subscribed is not made subscribed by the preference centre', async () => {
      const listId = await newList('pref-nonsub');
      const subject = await contactOn(listId, 'pref-nonsub', 'non_subscribed');
      const control = await contactOn(listId, 'pref-nonsub-ctl', 'active');
      const code = await resubscribe(subject.id, listId);
      const after = await state(subject.id, listId);
      console.log(`[z115] pref non_subscribed → ${code} → AFTER ${after}`);
      const reached = await campaignTo(listId, 'pref-nonsub', [subject.email, control.email]);
      expect(reached).toContain(control.email);
      expect(reached).not.toContain(subject.email);
      expect(after).toBe('status=non_subscribed suppressions=[] list=open');
    }, 120_000);
  });

  describe('double opt-in confirmation', () => {
    /** The recipient subscribes on a landing page, then clicks the link. */
    async function confirm(email: string, listId: string): Promise<string> {
      const sub = await pub('POST', `/api/v1/lists/${listId}/subscribe`, {
        email,
        firstName: 'Petra',
      });
      const body = (await sub.json()) as { data?: { _devToken?: string } };
      expect(sub.status, JSON.stringify(body)).toBe(202);
      expect(body.data?._devToken, 'no DOI token').toBeTruthy();
      const res = await pub('GET', `/api/v1/confirm/${body.data!._devToken}`);
      return `subscribe ${sub.status}, confirm ${res.status}`;
    }

    for (const [status, reason] of [
      ['bounced', 'hard_bounce'],
      ['complained', 'complaint'],
    ] as const) {
      it(`${status} (${reason}): confirming does not reopen the address, the campaign does not reach them`, async () => {
        const listId = await newList(`doi-${status}`);
        const subject = await contactOn(listId, `doi-${status}`, status, reason);
        const control = await contactOn(listId, `doi-${status}-ctl`, 'active');
        const before = await state(subject.id, listId);
        const steps = await confirm(subject.email, listId);
        const after = await state(subject.id, listId);
        console.log(`[z115] doi ${status} BEFORE ${before} → ${steps} → AFTER ${after}`);

        const reached = await campaignTo(listId, `doi-${status}`, [subject.email, control.email]);
        expect(reached, 'the control must reach the engine').toContain(control.email);
        expect(reached, `a ${reason} address reached the engine`).not.toContain(subject.email);
        expect(after).toBe(`status=${status} suppressions=["${reason}"] list=open`);
      }, 120_000);
    }

    it('a hard-bounced address that also unsubscribed: confirming does not lift the bounce', async () => {
      const listId = await newList('doi-unsub-bounced');
      const subject = await contactOn(listId, 'doi-unsub-bounced', 'bounced', 'hard_bounce');
      const control = await contactOn(listId, 'doi-unsub-bounced-ctl', 'active');
      await unsubscribeEverything(subject.id);
      const before = await state(subject.id, listId);
      const steps = await confirm(subject.email, listId);
      const after = await state(subject.id, listId);
      console.log(
        `[z115] doi unsubscribed+hard_bounce BEFORE ${before} → ${steps} → AFTER ${after}`,
      );

      expect(before).toBe('status=unsubscribed suppressions=["hard_bounce"] list=closed');
      const reached = await campaignTo(listId, 'doi-unsub-bounced', [subject.email, control.email]);
      expect(reached, 'the control must reach the engine').toContain(control.email);
      expect(reached, 'a hard_bounce address reached the engine').not.toContain(subject.email);
      expect(after).toBe('status=unsubscribed suppressions=["hard_bounce"] list=closed');
    }, 120_000);

    it('unsubscribed: confirming a new sign-up brings them back, the campaign reaches them', async () => {
      const listId = await newList('doi-unsub');
      const subject = await contactOn(listId, 'doi-unsub', 'active');
      const control = await contactOn(listId, 'doi-unsub-ctl', 'active');
      await unsubscribeEverything(subject.id);
      const before = await state(subject.id, listId);
      const steps = await confirm(subject.email, listId);
      const after = await state(subject.id, listId);
      console.log(`[z115] doi unsubscribed BEFORE ${before} → ${steps} → AFTER ${after}`);

      expect(before).toBe('status=unsubscribed suppressions=["unsubscribe"] list=closed');
      const reached = await campaignTo(listId, 'doi-unsub', [subject.email, control.email]);
      expect(reached).toContain(control.email);
      expect(reached, 'the confirmed recipient did not reach the engine').toContain(subject.email);
      expect(after).toBe('status=active suppressions=[] list=open');
    }, 120_000);

    it('a new address: confirming makes it a subscriber, the campaign reaches it', async () => {
      const listId = await newList('doi-new');
      const control = await contactOn(listId, 'doi-new-ctl', 'active');
      const email = addr('doi-new');
      allAddresses.push(email);
      const steps = await confirm(email, listId);
      const [c] = await sql<{ id: string }[]>`
        SELECT id FROM contacts WHERE org_id = ${seed.id} AND email = ${email}
      `;
      const after = await state(c!.id, listId);
      console.log(`[z115] doi new → ${steps} → AFTER ${after}`);
      const reached = await campaignTo(listId, 'doi-new', [email, control.email]);
      expect(reached).toContain(control.email);
      expect(reached).toContain(email);
      expect(after).toBe('status=active suppressions=[] list=open');
    }, 120_000);
  });
});
