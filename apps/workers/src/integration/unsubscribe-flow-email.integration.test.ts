/**
 * Unsubscribing from an email a flow sent confirms it, and is recorded.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * A flow's templated email has no campaign behind it, and the workflow
 * dispatch fills the batch job's campaignId with the org id so the rest of the
 * pipeline has a key to carry. The batch sender put that value into the
 * unsubscribe token as the originating campaign. Clicking the link then wrote
 * the `unsubscribe` row into email_events with campaign_id = the org id, which
 * is not a campaign: the foreign key refused it after the contact had already
 * been unsubscribed, the route caught the error and showed "Neplatný odkaz"
 * (400). No event row, so no statistic, and no `email.unsubscribed` webhook.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Two real sends through the real API and batch sender — one campaign, one
 * flow email — and the unsubscribe link read out of each MTA job's HTML is
 * followed against the real API. The same three things are asserted for both:
 * the confirmation page, the email_events row, the webhook delivery row.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * The campaign case runs first and must pass: it proves the assertions can be
 * met at all, so a green flow case is not green because the webhook or the
 * events table were never going to be written in this environment.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The webhook being delivered. The delivery row is what dispatchEvent writes;
 *   the webhook worker does not run here.
 * - Open and click events of flow emails, which carry the same placeholder id.
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
const sendingDomain = `wfunsub-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;

let seed: SeedOrg;
let token: string;
let listId: string;
let templateId: string;
let webhookId: string;
const contacts: Record<string, { id: string; email: string }> = {};
const createdCampaigns: string[] = [];

const ALL_STATES: JobType[] = [
  'waiting',
  'prioritized',
  'delayed',
  'paused',
  'active',
  'completed',
];

interface MtaJobData {
  campaignId: string;
  toEmail: string;
  htmlBody: string;
}

// A unique id and timestamp, as a real job has: the splitter derives its
// dispatch id from them, and batch job ids from that — a stub without them
// reuses one id across runs, and BullMQ silently drops the second add.
const job = <T>(data: T): Job<T> =>
  ({
    id: `wfunsub-${randomUUID()}`,
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
    throw new Error(`[wfunsub] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

/** The path of the unsubscribe link in an MTA job's HTML. */
function unsubscribePath(html: string): string {
  const href = [...html.matchAll(/href="([^"]+)"/g)]
    .map((m) => m[1]!.replace(/&amp;/g, '&'))
    .find((h) => h.includes('/api/v1/unsubscribe/'));
  expect(href, 'the email carries no unsubscribe link').toBeTruthy();
  return new URL(href!).pathname;
}

/** Follow the link as a browser, then read what the click left behind. */
async function unsubscribeVia(path: string, contactId: string) {
  const res = await fetch(`${API}${path}`, {
    headers: { Accept: 'text/html' },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.text();
  // dispatchEvent runs detached from the request; give it a moment to land.
  let events: { campaign_id: string | null }[] = [];
  let deliveries: readonly unknown[] = [];
  for (let i = 0; i < 20; i++) {
    events = await sql<{ campaign_id: string | null }[]>`
      SELECT campaign_id FROM email_events
      WHERE contact_id = ${contactId} AND event_type = 'unsubscribe'
    `;
    deliveries = await sql`
      SELECT 1 FROM webhook_deliveries
      WHERE webhook_id = ${webhookId} AND payload->'data'->>'contactId' = ${contactId}
    `;
    if (events.length && deliveries.length) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const [c] = await sql<{ status: string }[]>`SELECT status FROM contacts WHERE id = ${contactId}`;
  return { status: res.status, body, events, deliveries, contactStatus: c!.status };
}

describe('unsubscribing from a flow email is confirmed and recorded (real DB + Redis + API)', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await loginAsSeedUser(API, 'wfunsub');
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
    const [hook] = await sql<{ id: string }[]>`
      INSERT INTO webhooks (org_id, url, secret, events)
      VALUES (${seed.id}, 'https://webhook.example.invalid/unsubscribed', ${`whsec_${tag}`},
              ${['email.unsubscribed']})
      RETURNING id
    `;
    webhookId = hook!.id;

    for (const key of ['campaign', 'flow']) {
      const email = `wfunsub-${key}-${tag}@test.local`;
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO contacts (org_id, email, first_name, status)
        VALUES (${seed.id}, ${email}, 'Petra', 'active') RETURNING id
      `;
      contacts[key] = { id: c!.id, email };
    }
    // Only the campaign recipient is on the list the campaign goes to.
    const [list] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`wfunsub ${tag}`}) RETURNING id
    `;
    listId = list!.id;
    await sql`INSERT INTO contact_lists (contact_id, list_id) VALUES (${contacts.campaign!.id}, ${listId})`;

    const [tpl] = await sql<{ id: string }[]>`
      INSERT INTO templates (org_id, name, subject, preheader, blocks, global_styles, locale)
      VALUES (${seed.id}, ${`wfunsub ${tag}`}, 'Novinky', '',
        ${sql.json([
          {
            id: 'us1',
            type: 'text',
            content: '<p>Dobrý den, tohle posílá flow.</p>',
            fontSize: '15px',
            fontFamily: 'Arial',
            color: '#111827',
            lineHeight: '1.5',
            textAlign: 'left',
          },
          {
            id: 'us2',
            type: 'footer',
            content: '{{company_name}}',
            showUnsubscribe: true,
            textAlign: 'center',
            fontSize: '12px',
            color: '#6b7280',
          },
        ])},
        ${sql.json({ backgroundColor: '#fff', contentBackgroundColor: '#fff', fontFamily: 'Arial', linkColor: '#00f', textColor: '#000', contentWidth: 600 })},
        'cs')
      RETURNING id
    `;
    templateId = tpl!.id;
  }, 120_000);

  afterAll(async () => {
    const ids = Object.values(contacts).map((c) => c.id);
    const emails = Object.values(contacts).map((c) => c.email);
    if (webhookId) {
      await sql`DELETE FROM webhook_deliveries WHERE webhook_id = ${webhookId}`;
      await sql`DELETE FROM webhooks WHERE id = ${webhookId}`;
    }
    if (emails.length)
      await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email = ANY(${emails})`;
    if (ids.length) {
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${ids})`;
    }
    if (createdCampaigns.length)
      await sql`DELETE FROM campaigns WHERE id = ANY(${createdCampaigns})`;
    if (ids.length) await sql`DELETE FROM contacts WHERE id = ANY(${ids})`;
    if (listId) await sql`DELETE FROM lists WHERE id = ${listId}`;
    if (templateId) await sql`DELETE FROM templates WHERE id = ${templateId}`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 120_000);

  it('from a campaign: confirmed, one event on the campaign, one webhook delivery', async () => {
    const created = await api<{ data: { id: string } }>('POST', '/api/v1/campaigns', {
      name: `wfunsub ${tag}`,
      subject: 'Akce tohoto týdne',
      fromName: 'Obchod',
      fromEmail,
      listId,
      content: {
        subject: 'Akce tohoto týdne',
        blocks: [
          {
            id: 'c1',
            type: 'text',
            content: '<p>Akce.</p>',
            fontSize: '15px',
            fontFamily: 'Arial',
            color: '#111827',
            lineHeight: '1.5',
            textAlign: 'left',
          },
        ],
        globalStyles: {
          backgroundColor: '#fff',
          contentBackgroundColor: '#fff',
          fontFamily: 'Arial',
          linkColor: '#00f',
          textColor: '#000',
          contentWidth: 600,
        },
      },
    });
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
    const [batch] = (await addedTo<BatchSenderJobData>(batchSenderQueue, beforeBatch)).filter(
      (d) => d.campaignId === campaignId,
    );
    expect(batch, 'no batch job').toBeTruthy();
    const beforeMta = await idsOn(mtaQueues.other);
    await processBatchSender(job(batch!));
    const [mta] = (await addedTo<MtaJobData>(mtaQueues.other, beforeMta)).filter(
      (m) => m.toEmail === contacts.campaign!.email,
    );
    expect(mta, 'no MTA job for the campaign recipient').toBeTruthy();

    const r = await unsubscribeVia(unsubscribePath(mta!.htmlBody), contacts.campaign!.id);
    expect(r.status).toBe(200);
    expect(r.body).toContain('Byli jste odhlášeni');
    expect(r.contactStatus).toBe('unsubscribed');
    expect(r.events, 'no unsubscribe event').toHaveLength(1);
    expect(r.events[0]!.campaign_id).toBe(campaignId);
    expect(r.deliveries, 'no webhook delivery').toHaveLength(1);
  });

  it('from a flow email: confirmed, one event, one webhook delivery', async () => {
    const beforeBatch = await idsOn(batchSenderQueues.triggered);
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
    const [batch] = await addedTo<BatchSenderJobData>(batchSenderQueues.triggered, beforeBatch);
    expect(batch, 'no batch job').toBeTruthy();
    const beforeMta = await idsOn(mtaQueues.other);
    await processBatchSender(job(batch!));
    const [mta] = (await addedTo<MtaJobData>(mtaQueues.other, beforeMta)).filter(
      (m) => m.toEmail === contacts.flow!.email,
    );
    expect(mta, 'no MTA job for the flow recipient').toBeTruthy();

    const r = await unsubscribeVia(unsubscribePath(mta!.htmlBody), contacts.flow!.id);
    expect(r.status, `the page said: ${r.body.slice(0, 200)}`).toBe(200);
    expect(r.body).toContain('Byli jste odhlášeni');
    expect(r.contactStatus).toBe('unsubscribed');
    expect(r.events, 'no unsubscribe event').toHaveLength(1);
    // No campaign sent this email, so none is named — not the org id.
    expect(r.events[0]!.campaign_id).toBeNull();
    expect(r.deliveries, 'no webhook delivery').toHaveLength(1);
  });
});
