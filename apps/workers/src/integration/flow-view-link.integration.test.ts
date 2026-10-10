/**
 * A flow email carries no "view in browser" link that leads nowhere.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * The view-in-browser page re-renders a CAMPAIGN's content from a signed view
 * token. A flow's templated email has no campaign — its batch job carries the
 * org id as a placeholder (campaignIsPlaceholder, #218) — yet the batch sender
 * minted a view URL for it all the same. Wherever the email used it, the
 * recipient got a link to "This email is no longer available" (404): a
 * `{{view_in_browser_url}}` link, and the share block, which shares that URL.
 * The share block is on cs-welcome-2 and cs-digest, both sent by published
 * flows.
 *
 * Decision (Z92, variant 2): flow emails get no view URL. The token keeps its
 * shape. With the URL absent the renderer already does the right thing — a
 * link whose href was that tag keeps its words and loses the link, and the
 * share block renders nothing — so nothing needed changing there.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * The campaign runs in the same file and must carry the link and have it open
 * the email; a flow email without the link would otherwise prove nothing. The
 * flow email is also checked for everything else it should still carry.
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
const sendingDomain = `wfview-${tag}.test`;
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

const job = <T>(data: T): Job<T> =>
  ({
    id: `wfview-${randomUUID()}`,
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
  if (!res.ok) throw new Error(`[wfview] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

const BLOCKS = [
  {
    id: 'vw1',
    type: 'text',
    content: `<p>Dobrý den,</p><p><a href="${TARGET}">Produkt</a></p><p><a href="{{view_in_browser_url}}">Zobrazit v prohlížeči</a></p>`,
    fontSize: '15px',
    fontFamily: 'Arial',
    color: '#111827',
    lineHeight: '1.5',
    textAlign: 'left',
  },
  {
    id: 'vw2',
    type: 'share',
    networks: ['email', 'facebook'],
    shareText: 'Tip',
    label: 'Sdílet',
    align: 'center',
    fontSize: '13px',
    color: '#2563eb',
  },
  {
    id: 'vw3',
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

/** Every link target in a body, with click-tracking wrappers undone. */
function targets(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1]!.replace(/&amp;/g, '&');
    const tracked = /\/track\/c\/([^".]+)\./.exec(href);
    out.push(
      tracked
        ? (
            JSON.parse(
              Buffer.from(tracked[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
                'utf8',
              ),
            ) as { url: string }
          ).url
        : href,
    );
  }
  return out;
}

/** Does the body point at the view page anywhere — a link, or inside a share URL? */
const viewLinks = (html: string) =>
  targets(html).filter(
    (u) => u.includes('/api/v1/browser/') || decodeURIComponent(u).includes('/api/v1/browser/'),
  );

describe('a flow email carries no dead view-in-browser link (real DB + Redis + API)', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await loginAsSeedUser(API, 'wfview');
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
    for (const key of ['campaign', 'flow']) {
      const email = `wfview-${key}-${tag}@test.local`;
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO contacts (org_id, email, first_name, status)
        VALUES (${seed.id}, ${email}, 'Petra', 'active') RETURNING id
      `;
      contacts[key] = { id: c!.id, email };
    }
    const [list] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`wfview ${tag}`}) RETURNING id
    `;
    listId = list!.id;
    await sql`INSERT INTO contact_lists (contact_id, list_id) VALUES (${contacts.campaign!.id}, ${listId})`;
    const [tpl] = await sql<{ id: string }[]>`
      INSERT INTO templates (org_id, name, subject, preheader, blocks, global_styles, locale)
      VALUES (${seed.id}, ${`wfview ${tag}`}, 'Novinky', '', ${sql.json(BLOCKS)}, ${sql.json(GS)}, 'cs')
      RETURNING id
    `;
    templateId = tpl!.id;

    // The campaign's email.
    const created = await api<{ data: { id: string } }>('POST', '/api/v1/campaigns', {
      name: `wfview ${tag}`,
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

  it('campaign: the view link and the share links are there, and the view opens the email', async () => {
    const views = viewLinks(mail.campaign!);
    expect(views.length, 'the campaign email carries no view link').toBeGreaterThanOrEqual(2);
    const direct = views.find((u) => u.includes('/api/v1/browser/') && !u.includes('sharer'))!;
    const res = await fetch(`${API}${new URL(direct).pathname}`, {
      signal: AbortSignal.timeout(20_000),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Produkt');
  });

  it('flow: no link anywhere in the email leads to the view page', () => {
    expect(viewLinks(mail.flow!), 'the flow email still links to the view page').toEqual([]);
  });

  it('flow: everything else is still there — the product link, the words, the opt-out', () => {
    const html = mail.flow!;
    expect(html.startsWith('<!DOCTYPE html')).toBe(true);
    expect(
      targets(html).some((u) => u.startsWith(TARGET)),
      'the product link is gone',
    ).toBe(true);
    expect(html, 'the words of the view line are gone').toContain('Zobrazit v prohlížeči');
    expect(
      targets(html).some((u) => u.includes('/api/v1/unsubscribe/')),
      'the opt-out link in the footer is gone',
    ).toBe(true);
  });
});
