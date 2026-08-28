/**
 * Which branch of the send path a campaign takes, decided by the shape its
 * content is stored in.
 *
 * The shape test was written twice — here in batch-sender.ts and again in the
 * archive page — as `'blocks' in content`. That is FALSE for what the visual
 * editor saves:
 *
 *     content: { schema, html }        apps/web .../visual-editor-shell.tsx
 *
 * because the blocks are one level down. So the product's primary authoring
 * path fell through to the raw-HTML branch, which does `parseMergeTags` on the
 * stored string and nothing else — no compliance footer, no sanitisation, no
 * UTM, no protected-URL identity.
 *
 * And the stored string is not a neutral copy of the message. The editor
 * renders it IN THE BROWSER at save time against a hard-coded preview contact
 * (firstName 'Ada', unsubscribeUrl https://forgemsg.example/unsubscribe) and
 * PUTs the result. Every merge tag is already substituted, so nothing
 * downstream can put the real recipient back.
 *
 * Two consequences, and this file pins both:
 *
 *   1. the message would greet every recipient as Ada, with an opt-out link to
 *      a domain that does not exist;
 *   2. it would not go out at all — assertOptOutPresent looks for the real
 *      per-recipient URL or an unresolved `{{unsubscribe_url}}`, finds neither,
 *      and throws. So the failure was loud rather than silent, but the campaign
 *      was undeliverable.
 *
 * Walked, not unit-tested: the real HTTP routes against the real API, the real
 * splitter and batch-sender against the real queues, and the assertion is on
 * the body of the job the MTA would have picked up.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Job, JobType, Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { readSeedOrg } from './setup/seed-org.js';
import { processCampaignSplitter } from '../jobs/campaign-splitter.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import {
  campaignSplitterQueue,
  batchSenderQueue,
  mtaQueues,
  type CampaignSplitterJobData,
  type BatchSenderJobData,
} from '../queues/index.js';

const API = process.env.API_URL!;
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

const tag = randomUUID().slice(0, 8);
const sendingDomain = `shape-${tag}.test`;
const fromEmail = `akce@${sendingDomain}`;

let orgId: string;
let listId: string;
let contactId: string;
let token: string;
/** Read from the seed org, never written by this file. See setup/seed-org.ts. */
let postalAddress: string;
const createdCampaigns: string[] = [];

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[shape] ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as T;
}

function splitterJob(data: CampaignSplitterJobData): Job<CampaignSplitterJobData> {
  return {
    id: `shape-${randomUUID()}`,
    timestamp: Date.now(),
    data,
    log: async () => {},
  } as unknown as Job<CampaignSplitterJobData>;
}
function batchJob(data: BatchSenderJobData): Job<BatchSenderJobData> {
  return { data, log: async () => {} } as unknown as Job<BatchSenderJobData>;
}

// Batch and MTA jobs carry a priority, and BullMQ 5 parks those in
// `prioritized` rather than `waiting`.
const ALL_STATES: JobType[] = [
  'waiting',
  'prioritized',
  'delayed',
  'paused',
  'active',
  'completed',
];

async function jobsFor<T>(queue: Queue, campaignId: string): Promise<T[]> {
  const jobs = await queue.getJobs(ALL_STATES, 0, 5_000);
  return jobs
    .filter((j) => (j.data as { campaignId?: string } | undefined)?.campaignId === campaignId)
    .map((j) => j.data as T);
}

interface MtaJobData {
  campaignId: string;
  toEmail: string;
  htmlBody: string;
  textBody: string;
}

const GS = {
  backgroundColor: '#f1f5f9',
  contentBackgroundColor: '#ffffff',
  fontFamily: 'Arial, Helvetica, sans-serif',
  linkColor: '#2563eb',
  textColor: '#1f2937',
  contentWidth: 600,
};

const textBlock = (content: string) => ({
  id: 'b1',
  type: 'text',
  content,
  fontSize: '15px',
  fontFamily: GS.fontFamily,
  color: '#374151',
  lineHeight: '1.6',
  textAlign: 'left',
});

async function makeCampaign(name: string, content: Record<string, unknown>): Promise<string> {
  const created = await api<{ data: { id: string } }>('POST', '/api/v1/campaigns', {
    name: `${name} ${tag}`,
    subject: 'Akce tohoto týdne',
    fromName: 'Obchod',
    fromEmail,
    listId,
    content,
  });
  createdCampaigns.push(created.data.id);
  return created.data.id;
}

/** Send, run the splitter, run the batch-sender, return the MTA job. */
async function sendAndCollect(campaignId: string): Promise<MtaJobData> {
  await api('POST', `/api/v1/campaigns/${campaignId}/send`);

  const [splitterData] = await jobsFor<CampaignSplitterJobData>(campaignSplitterQueue, campaignId);
  if (!splitterData) throw new Error('[shape] dispatch enqueued no splitter job');
  await processCampaignSplitter(splitterJob(splitterData));

  const [batchData] = await jobsFor<BatchSenderJobData>(batchSenderQueue, campaignId);
  if (!batchData) throw new Error('[shape] splitter enqueued no batch job');
  await processBatchSender(batchJob(batchData));

  const [mta] = await jobsFor<MtaJobData>(mtaQueues.other, campaignId);
  if (!mta) throw new Error('[shape] batch-sender enqueued no MTA job');
  return mta;
}

describe('campaign content shape end to end (real DB + Redis + API)', () => {
  beforeAll(async () => {
    const org = await readSeedOrg(sql);
    orgId = org.id;
    postalAddress = org.postalAddress;
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified)
      VALUES (${orgId}, ${sendingDomain}, 'fm1', true, true)
    `;

    const [list] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name) VALUES (${orgId}, ${`shape ${tag}`}) RETURNING id
    `;
    listId = list!.id;
    const [contact] = await sql<{ id: string }[]>`
      INSERT INTO contacts (org_id, email, first_name, status)
      VALUES (${orgId}, ${`shape-${tag}@test.local`}, 'Jana', 'active')
      RETURNING id
    `;
    contactId = contact!.id;
    await sql`INSERT INTO contact_lists (contact_id, list_id) VALUES (${contactId}, ${listId})`;

    const login = await api<{ token: string }>('POST', '/api/v1/auth/login', {
      email: 'demo@acme.test',
      password: 'Demo1234!',
    });
    token = login.token;
  }, 120_000);

  afterAll(async () => {
    for (const q of [campaignSplitterQueue, batchSenderQueue, mtaQueues.other]) {
      const jobs = await q.getJobs([...ALL_STATES, 'failed'] as JobType[], 0, 5_000);
      await Promise.all(
        jobs
          .filter((j) =>
            createdCampaigns.includes((j.data as { campaignId?: string })?.campaignId ?? ''),
          )
          .map((j) => j.remove().catch(() => {})),
      );
    }
    if (createdCampaigns.length) {
      await sql`DELETE FROM campaigns WHERE id = ANY(${createdCampaigns})`;
    }
    await sql`DELETE FROM contact_lists WHERE list_id = ${listId}`;
    await sql`DELETE FROM contacts WHERE id = ${contactId}`;
    await sql`DELETE FROM lists WHERE id = ${listId}`;
    await sql`DELETE FROM sending_domains WHERE org_id = ${orgId} AND domain = ${sendingDomain}`;
    await sql.end({ timeout: 5 });
  }, 120_000);

  describe('{ schema, html } — the visual editor’s own shape', () => {
    it('renders the schema for this recipient, not the browser’s preview snapshot', async () => {
      const id = await makeCampaign('editor shape', {
        schema: {
          subject: 'Akce tohoto týdne',
          preheader: '',
          globalStyles: GS,
          blocks: [textBlock('Dobrý den, {{contact.first_name}}.')],
        },
        // Exactly what visual-editor-shell.tsx renders and PUTs.
        html: '<html><body><p>Dobrý den, Ada.</p></body></html>',
      });

      const mta = await sendAndCollect(id);
      expect(mta.htmlBody, 'the preview contact went out to a real recipient').not.toContain('Ada');
      expect(mta.htmlBody).toContain('Jana');
    }, 180_000);

    it('gets the compliance footer FROM THE RENDERER, not from the guard', async () => {
      // No footer block, and no `{{unsubscribe_url}}` anywhere in the content.
      // On the raw-HTML branch assertOptOutPresent would throw here — the send
      // would fail rather than arrive. The footer being present means the
      // renderer put it there, which is the difference this change makes.
      const id = await makeCampaign('editor footer', {
        schema: {
          subject: 'Akce tohoto týdne',
          preheader: '',
          globalStyles: GS,
          blocks: [textBlock('Jen text, žádný footer blok, žádný merge tag.')],
        },
        html: '<html><body><p>nic</p></body></html>',
      });

      const mta = await sendAndCollect(id);
      expect(mta.htmlBody, 'no unsubscribe link in the HTML part').toMatch(/\/unsubscribe\//);
      expect(mta.textBody, 'no unsubscribe link in the text part').toMatch(/\/unsubscribe\//);
      expect(mta.htmlBody, 'the postal address is the other half of the footer').toContain(
        postalAddress,
      );
    }, 180_000);

    it('derives the plain text from the blocks, not from the stored html', async () => {
      const id = await makeCampaign('editor text', {
        schema: {
          subject: 'Akce tohoto týdne',
          preheader: '',
          globalStyles: GS,
          blocks: [textBlock('Skladová sleva pro {{contact.first_name}}.')],
        },
        html: '<html><body><p>Skladová sleva pro Ada.</p></body></html>',
      });

      const mta = await sendAndCollect(id);
      expect(mta.textBody).toContain('Jana');
      expect(mta.textBody).not.toContain('Ada');
    }, 180_000);
  });

  describe('{ html } — raw HTML, unchanged by this branch', () => {
    it('goes out byte-for-byte as before, merge tags resolved and nothing added', async () => {
      // The migration promise: a campaign stored as raw HTML renders exactly as
      // it did. Nothing wraps it, nothing sanitises the email body, no footer is
      // appended — the opt-out is in the content because the guard requires it
      // to be. Changing this would change what already-sent campaigns look like.
      const id = await makeCampaign('raw html', {
        html:
          '<!doctype html><html><head><style>.x{color:red}</style></head><body>' +
          '<h1 class="x">Akce</h1><p>Dobrý den, {{contact.first_name}}.</p>' +
          '<a href="{{unsubscribe_url}}">Odhlásit</a></body></html>',
      });

      const mta = await sendAndCollect(id);
      // The document survives whole: head and style are still there, which is
      // the reason this shape is not wrapped in a code block (the sanitiser's
      // allowlist has no html/head/style, so wrapping would drop the stylesheet).
      expect(mta.htmlBody).toContain('<!doctype html>');
      expect(mta.htmlBody).toContain('<style>.x{color:red}</style>');
      expect(mta.htmlBody).toContain('<h1 class="x">Akce</h1>');
      // Merge tags resolved, as this path always did.
      expect(mta.htmlBody).toContain('Jana');
      expect(mta.htmlBody).toMatch(/\/unsubscribe\//);
      // And the renderer's own footer is NOT bolted on, because that would be a
      // second copy of the compliance rule on a path that already has one.
      expect(mta.htmlBody).not.toContain(postalAddress);
    }, 180_000);
  });
});
