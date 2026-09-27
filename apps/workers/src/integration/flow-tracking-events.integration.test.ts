/**
 * Opens and clicks on an email a flow sent are recorded.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * A flow's templated email has no campaign, and the workflow dispatch fills the
 * batch job's campaignId with the org id so the pipeline has a key to carry
 * (#218 took it out of the unsubscribe token, behind `campaignIsPlaceholder`).
 * The open pixel and the click links still carry it: their tokens have a
 * required campaignId, and batch-sender mints them from the job. /track/o and
 * /track/c write email_events with campaign_id = that id, the foreign key to
 * campaigns refuses it, and both routes swallow the error — so every open and
 * click on a flow email vanished, and with them everything that reads them:
 * the flow's own "opened?" / "clicked?" conditions and goals, engagement,
 * send-time optimisation.
 *
 * The fix is at the routes, not in the token: tokens already in delivered
 * emails carry the org id and must still land. A campaign id that is not a
 * campaign of the token's organisation is recorded as no campaign.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * One campaign and one flow email, through the real API and batch sender. The
 * pixel and the tracked link are read out of each MTA job's HTML and requested
 * from the real API; the assertions are on the email_events rows they leave.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * The campaign runs first, in the same file, and must record both its open and
 * its click — proof that a write is possible here at all. The invalid-token
 * cases are asserted to leave no row, then the legitimate flow case must.
 *
 * WHAT THIS FILE CANNOT SEE
 * - View-in-browser for a flow email. It renders a campaign's content, and a
 *   flow email has no campaign to render; the view token cannot say which
 *   template or event data to use without changing its shape.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Job, JobType, Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { loginAsSeedUser } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import { processCampaignSplitter } from '../jobs/campaign-splitter.js';
import {
  batchSenderQueue,
  batchSenderQueues,
  campaignSplitterQueue,
  mtaQueues,
  type BatchSenderJobData,
  type CampaignSplitterJobData,
} from '../queues/index.js';

const API = process.env.API_URL!;
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET!;
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

const tag = randomUUID().slice(0, 8);
const sendingDomain = `wftrack-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const TARGET = `https://shop.example.cz/produkt-${tag}`;

let seed: SeedOrg;
let token: string;
let listId: string;
let templateId: string;
let campaignId: string;
const contacts: Record<string, { id: string; email: string }> = {};
const mail: Record<string, string> = {};

const ALL_STATES: JobType[] = [
  'waiting',
  'prioritized',
  'delayed',
  'paused',
  'active',
  'completed',
];

interface MtaJobData {
  toEmail: string;
  htmlBody: string;
}

// A unique id and timestamp, as a real job has: the splitter derives its
// dispatch id from them, and batch job ids from that.
const job = <T>(data: T): Job<T> =>
  ({
    id: `wftrack-${randomUUID()}`,
    timestamp: Date.now(),
    data,
    log: async () => {},
  }) as unknown as Job<T>;

async function idsOn(queue: Queue): Promise<Set<string>> {
  const jobs = await queue.getJobs(ALL_STATES, 0, 5_000);
  return new Set(jobs.map((j) => String(j?.id)));
}

async function addedTo<T>(queue: Queue, before: Set<string>): Promise<T[]> {
  const jobs = await queue.getJobs(ALL_STATES, 0, 5_000);
  return jobs.filter((j) => j && !before.has(String(j.id))).map((j) => j.data as T);
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`[wftrack] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

const BLOCKS = [
  {
    id: 'tr1',
    type: 'text',
    content: `<p>Dobrý den,</p><p><a href="${TARGET}">Produkt</a></p><p><a href="{{view_in_browser_url}}">Zobrazit v prohlížeči</a></p>`,
    fontSize: '15px',
    fontFamily: 'Arial',
    color: '#111827',
    lineHeight: '1.5',
    textAlign: 'left',
  },
  {
    id: 'tr2',
    type: 'footer',
    content: '{{company_name}}',
    showUnsubscribe: true,
    textAlign: 'center',
    fontSize: '12px',
    color: '#6b7280',
  },
];
const GS = {
  backgroundColor: '#fff',
  contentBackgroundColor: '#fff',
  fontFamily: 'Arial',
  linkColor: '#00f',
  textColor: '#000',
  contentWidth: 600,
};

/** Path of the open pixel in a body. */
function pixelPath(html: string): string {
  const src = /<img src="([^"]*\/track\/o\/[^"]+)"/.exec(html)?.[1];
  expect(src, 'the email carries no open pixel').toBeTruthy();
  return new URL(src!).pathname;
}

/** Path of the tracked link that leads to TARGET. */
function clickPath(html: string): string {
  for (const m of html.matchAll(/href="([^"]*\/track\/c\/([^".]+)\.[^"]*)"/g)) {
    const payload = JSON.parse(
      Buffer.from(m[2]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { url: string };
    if (payload.url.startsWith(TARGET)) return new URL(m[1]!).pathname;
  }
  throw new Error('the email carries no tracked link to the product');
}

/** Path of the view-in-browser link, unwrapped from click tracking. */
function viewPath(html: string): string {
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1]!.replace(/&amp;/g, '&');
    const tracked = /\/track\/c\/([^".]+)\./.exec(href);
    const url = tracked
      ? (
          JSON.parse(
            Buffer.from(tracked[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
              'utf8',
            ),
          ) as { url: string }
        ).url
      : href;
    if (url.includes('/api/v1/browser/')) return new URL(url).pathname;
  }
  throw new Error('the email carries no view-in-browser link');
}

async function eventsFor(contactId: string, type: 'open' | 'click') {
  return sql<{ campaign_id: string | null; contact_id: string }[]>`
    SELECT campaign_id, contact_id FROM email_events
    WHERE contact_id = ${contactId} AND event_type = ${type}
  `;
}

async function hit(path: string) {
  return fetch(`${API}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
}

describe('opens and clicks on a flow email are recorded (real DB + Redis + API)', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await loginAsSeedUser(API, 'wftrack');
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true)
    `;
    for (const key of ['campaign', 'flow']) {
      const email = `wftrack-${key}-${tag}@test.local`;
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO contacts (org_id, email, first_name, status)
        VALUES (${seed.id}, ${email}, 'Petra', 'active') RETURNING id
      `;
      contacts[key] = { id: c!.id, email };
    }
    const [list] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`wftrack ${tag}`}) RETURNING id
    `;
    listId = list!.id;
    await sql`INSERT INTO contact_lists (contact_id, list_id) VALUES (${contacts.campaign!.id}, ${listId})`;
    const [tpl] = await sql<{ id: string }[]>`
      INSERT INTO templates (org_id, name, subject, preheader, blocks, global_styles, locale)
      VALUES (${seed.id}, ${`wftrack ${tag}`}, 'Novinky', '', ${sql.json(BLOCKS)}, ${sql.json(GS)}, 'cs')
      RETURNING id
    `;
    templateId = tpl!.id;

    // The campaign's email.
    const created = await api<{ data: { id: string } }>('POST', '/api/v1/campaigns', {
      name: `wftrack ${tag}`,
      subject: 'Novinky',
      fromName: 'Obchod',
      fromEmail,
      listId,
      content: { subject: 'Novinky', blocks: BLOCKS, globalStyles: GS },
    });
    campaignId = created.data.id;
    const beforeSplit = await idsOn(campaignSplitterQueue);
    await api('POST', `/api/v1/campaigns/${campaignId}/send`);
    const [split] = (
      await addedTo<CampaignSplitterJobData>(campaignSplitterQueue, beforeSplit)
    ).filter((d) => d.campaignId === campaignId);
    const beforeBatch = await idsOn(batchSenderQueue);
    await processCampaignSplitter(job(split!));
    const [cBatch] = (await addedTo<BatchSenderJobData>(batchSenderQueue, beforeBatch)).filter(
      (d) => d.campaignId === campaignId,
    );
    const beforeMtaC = await idsOn(mtaQueues.other);
    await processBatchSender(job(cBatch!));
    mail.campaign = (await addedTo<MtaJobData>(mtaQueues.other, beforeMtaC)).find(
      (m) => m.toEmail === contacts.campaign!.email,
    )!.htmlBody;

    // The flow's email.
    const beforeFlow = await idsOn(batchSenderQueues.triggered);
    const res = await fetch(`${API}/api/v1/internal/workflow/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({
        orgId: seed.id,
        contactId: contacts.flow!.id,
        templateId,
        mergeData: {},
      }),
      signal: AbortSignal.timeout(20_000),
    });
    expect(((await res.json()) as { data?: { queued?: boolean } }).data?.queued).toBe(true);
    const [fBatch] = await addedTo<BatchSenderJobData>(batchSenderQueues.triggered, beforeFlow);
    const beforeMtaF = await idsOn(mtaQueues.other);
    await processBatchSender(job(fBatch!));
    mail.flow = (await addedTo<MtaJobData>(mtaQueues.other, beforeMtaF)).find(
      (m) => m.toEmail === contacts.flow!.email,
    )!.htmlBody;
  }, 120_000);

  afterAll(async () => {
    const ids = Object.values(contacts).map((c) => c.id);
    if (ids.length) {
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${ids})`;
    }
    if (campaignId) await sql`DELETE FROM campaigns WHERE id = ${campaignId}`;
    if (ids.length) await sql`DELETE FROM contacts WHERE id = ANY(${ids})`;
    if (listId) await sql`DELETE FROM lists WHERE id = ${listId}`;
    if (templateId) await sql`DELETE FROM templates WHERE id = ${templateId}`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 120_000);

  it('campaign: the open and the click are recorded against the campaign', async () => {
    expect((await hit(pixelPath(mail.campaign!))).status).toBe(200);
    const click = await hit(clickPath(mail.campaign!));
    expect(click.status).toBe(302);

    const opens = await eventsFor(contacts.campaign!.id, 'open');
    const clicks = await eventsFor(contacts.campaign!.id, 'click');
    expect(opens.map((e) => e.campaign_id)).toEqual([campaignId]);
    expect(clicks.map((e) => e.campaign_id)).toEqual([campaignId]);
  });

  it('campaign: view in browser still renders the email', async () => {
    const res = await hit(viewPath(mail.campaign!));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Produkt');
  });

  it('a tampered token records nothing, and the click still goes somewhere safe', async () => {
    const pixel = pixelPath(mail.flow!);
    const link = clickPath(mail.flow!);
    const tamper = (p: string) => p.slice(0, -3) + (p.endsWith('AAA') ? 'BBB' : 'AAA');

    expect((await hit(tamper(pixel))).status).toBe(200);
    const click = await hit(tamper(link));
    expect(click.status).toBe(302);
    expect(click.headers.get('location')).not.toContain(TARGET);

    expect(await eventsFor(contacts.flow!.id, 'open')).toHaveLength(0);
    expect(await eventsFor(contacts.flow!.id, 'click')).toHaveLength(0);
  });

  it('flow: the open is recorded for the contact, with no campaign', async () => {
    const res = await hit(pixelPath(mail.flow!));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/gif');

    const opens = await eventsFor(contacts.flow!.id, 'open');
    expect(opens, 'the open left no row').toHaveLength(1);
    expect(opens[0]).toEqual({ campaign_id: null, contact_id: contacts.flow!.id });
  });

  it('flow: the click is recorded for the contact, with no campaign, and leads to the link', async () => {
    const res = await hit(clickPath(mail.flow!));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain(TARGET);

    const clicks = await eventsFor(contacts.flow!.id, 'click');
    expect(clicks, 'the click left no row').toHaveLength(1);
    expect(clicks[0]).toEqual({ campaign_id: null, contact_id: contacts.flow!.id });
  });
});
