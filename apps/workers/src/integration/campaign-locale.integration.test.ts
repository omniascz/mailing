/**
 * The language of a campaign, from the gallery to the wire.
 *
 * A Czech template produced an email whose one required link said
 * "Unsubscribe". Not a translation gap — the Czech string existed. The value
 * was dropped four times on the way to the renderer, and every table it passed
 * through already had a column waiting for it:
 *
 *   TemplateMeta.locale ('cs')   the built-in template
 *     → templates.locale         POST /templates/:id/use never copied it
 *     → campaigns.locale         createCampaign never set it
 *     → splitter job payload     dispatch never put it on the job
 *     → batch job payload        the splitter never forwarded it
 *     → renderEmail/renderPlainText
 *
 * Every one of those five functions was correct in isolation, which is why no
 * unit test caught it and why this one does not test a function. It walks the
 * path: the real HTTP routes against the real API, the real splitter and the
 * real batch-sender against the real queues, and it reads the label off the
 * job that would have gone to the MTA.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Job, JobType, Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { loginAsSeedUser } from './setup/login.js';
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
const sendingDomain = `locale-${tag}.test`;
const fromEmail = `akce@${sendingDomain}`;

let orgId: string;
let listId: string;
let contactId: string;
let token: string;
const createdCampaigns: string[] = [];
const createdTemplates: string[] = [];

// ─── HTTP against the running API ───────────────────────────────────────────

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
  if (!res.ok) {
    throw new Error(`[locale] ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as T;
}

// ─── Job stand-ins ──────────────────────────────────────────────────────────

/** The splitter keys its dispatch ledger off id + timestamp. */
function splitterJob(data: CampaignSplitterJobData): Job<CampaignSplitterJobData> {
  return {
    id: `locale-${randomUUID()}`,
    timestamp: Date.now(),
    data,
    log: async () => {},
  } as unknown as Job<CampaignSplitterJobData>;
}

function batchJob(data: BatchSenderJobData): Job<BatchSenderJobData> {
  return { data, log: async () => {} } as unknown as Job<BatchSenderJobData>;
}

// ─── Reading what each hop produced ─────────────────────────────────────────

// Batch and MTA jobs carry a priority, and BullMQ 5 parks those in
// `prioritized` rather than `waiting` — leaving it out reads every queue as
// empty.
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

/** Click Send, run the splitter, and stop with the batch job in hand. */
async function sendToBatch(campaignId: string) {
  await api('POST', `/api/v1/campaigns/${campaignId}/send`);

  const [splitterData] = await jobsFor<CampaignSplitterJobData>(campaignSplitterQueue, campaignId);
  if (!splitterData) throw new Error('[locale] dispatch enqueued no splitter job');

  await processCampaignSplitter(splitterJob(splitterData));

  const [batchData] = await jobsFor<BatchSenderJobData>(batchSenderQueue, campaignId);
  if (!batchData) throw new Error('[locale] splitter enqueued no batch job');

  return { splitterData, batchData };
}

/**
 * Drive one campaign from the click on Send to the message the MTA would pick
 * up, and hand back what each hop carried.
 */
async function sendAndCollect(campaignId: string) {
  const { splitterData, batchData } = await sendToBatch(campaignId);

  await processBatchSender(batchJob(batchData));

  // @test.local is nobody's ISP, so the message lands in the catch-all queue.
  const [mta] = await jobsFor<MtaJobData>(mtaQueues.other, campaignId);
  if (!mta) throw new Error('[locale] batch-sender enqueued no MTA job');

  return { splitterData, batchData, mta };
}

/** Create a campaign the way the UI does: saved template + its schema as content. */
async function campaignFromSavedTemplate(builtInId: string, name: string) {
  const use = await api<{ data: Record<string, unknown> }>(
    'POST',
    `/api/v1/templates/${builtInId}/use`,
    { name: `${name} ${tag}` },
  );
  const saved = use.data as {
    id: string;
    locale?: string;
    subject: string;
    preheader: string;
    blocks: unknown[];
    globalStyles: Record<string, unknown>;
  };
  createdTemplates.push(saved.id);

  const created = await api<{ data: { id: string; locale?: string } }>(
    'POST',
    '/api/v1/campaigns',
    {
      name: `${name} ${tag}`,
      subject: saved.subject,
      preheader: saved.preheader,
      fromName: 'Obchod',
      fromEmail,
      templateId: saved.id,
      listId,
      content: {
        subject: saved.subject,
        preheader: saved.preheader,
        blocks: saved.blocks,
        globalStyles: saved.globalStyles,
      },
    },
  );
  createdCampaigns.push(created.data.id);
  return { saved, campaign: created.data };
}

describe('campaign language end to end (real DB + Redis + API)', () => {
  beforeAll(async () => {
    // Three things the send path insists on before it will enqueue anything:
    // production mode, a verified From domain, and a postal address for the
    // footer the language is printed in. The first and third are seed data and
    // this file only reads them — writing them here is what made three suites
    // depend on which of them ran first. See setup/seed-org.ts.
    const org = await readSeedOrg(sql);
    orgId = org.id;
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified)
      VALUES (${orgId}, ${sendingDomain}, 'fm1', true, true)
    `;

    const [list] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name) VALUES (${orgId}, ${`locale ${tag}`}) RETURNING id
    `;
    listId = list!.id;
    const [contact] = await sql<{ id: string }[]>`
      INSERT INTO contacts (org_id, email, first_name, status)
      VALUES (${orgId}, ${`locale-${tag}@test.local`}, 'Jana', 'active')
      RETURNING id
    `;
    contactId = contact!.id;
    await sql`INSERT INTO contact_lists (contact_id, list_id) VALUES (${contactId}, ${listId})`;

    // Through setup/login.ts, not the local api() helper: the login route is
    // rate limited per process and this suite is run repeatedly.
    token = await loginAsSeedUser(API, 'locale');
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
    if (createdTemplates.length) {
      await sql`DELETE FROM templates WHERE id = ANY(${createdTemplates})`;
    }
    await sql`DELETE FROM contact_lists WHERE list_id = ${listId}`;
    await sql`DELETE FROM contacts WHERE id = ${contactId}`;
    await sql`DELETE FROM lists WHERE id = ${listId}`;
    await sql`DELETE FROM sending_domains WHERE org_id = ${orgId} AND domain = ${sendingDomain}`;
    await sql.end({ timeout: 5 });
  }, 60_000);

  it('a Czech template arrives in Czech — in the HTML and in the text', async () => {
    const { saved, campaign } = await campaignFromSavedTemplate('cs-black-friday', 'Black Friday');

    // The hops are soft so one run names every place the value is dropped,
    // rather than stopping at the first. The message itself, below, is hard.
    expect.soft(saved.locale, '/templates/:id/use dropped the language').toBe('cs');

    expect.soft(campaign.locale, 'the campaign did not inherit the template language').toBe('cs');
    const [row] = await sql<{ locale: string }[]>`
      SELECT locale FROM campaigns WHERE id = ${campaign.id}
    `;
    expect.soft(row!.locale, 'campaigns.locale was not written').toBe('cs');

    const { splitterData, batchData, mta } = await sendAndCollect(campaign.id);

    expect.soft(splitterData.locale, 'dispatch left the language off the job').toBe('cs');
    expect.soft(batchData.locale, 'the splitter did not forward the language').toBe('cs');

    // And what the recipient would actually read, in both parts of the message.
    expect(mta.toEmail).toBe(`locale-${tag}@test.local`);
    expect(mta.htmlBody, 'HTML part is in English').toContain('Odhlásit z odběru');
    expect(mta.textBody, 'text part is in English').toContain('Odhlásit z odběru');
    expect(mta.htmlBody).not.toContain('>Unsubscribe<');
    expect(mta.textBody).not.toContain('Unsubscribe:');
  }, 120_000);

  it('a campaign with no language renders English and does not fail', async () => {
    // Written from scratch: no template, nothing said about language. The
    // column default is 'en' and every hop has to be happy with that.
    const created = await api<{ data: { id: string; locale?: string } }>(
      'POST',
      '/api/v1/campaigns',
      {
        name: `From scratch ${tag}`,
        subject: 'Novinky',
        fromName: 'Obchod',
        fromEmail,
        listId,
        content: {
          subject: 'Novinky',
          preheader: '',
          globalStyles: {},
          blocks: [
            {
              id: 'fs1',
              type: 'text',
              content: '<p>Máme novinky.</p>',
              fontSize: '15px',
              fontFamily: 'Arial',
              color: '#000000',
              lineHeight: '1.6',
              textAlign: 'left',
            },
          ],
        },
      },
    );
    createdCampaigns.push(created.data.id);
    expect(created.data.locale).toBe('en');

    const { splitterData, batchData, mta } = await sendAndCollect(created.data.id);
    expect(splitterData.locale).toBe('en');
    expect(batchData.locale).toBe('en');
    expect(mta.htmlBody).toContain('Unsubscribe');
    expect(mta.textBody).toContain('Unsubscribe:');
  }, 120_000);

  it('an explicit language beats the template it was started from', async () => {
    // A Czech template sent in Slovak. One organisation, more than one
    // language — which is why this is a property of the message and not a
    // setting on the organisation.
    const use = await api<{
      data: {
        id: string;
        subject: string;
        preheader: string;
        blocks: unknown[];
        globalStyles: Record<string, unknown>;
      };
    }>('POST', '/api/v1/templates/cs-black-friday/use', { name: `BF explicit ${tag}` });
    createdTemplates.push(use.data.id);

    const created = await api<{ data: { id: string; locale?: string } }>(
      'POST',
      '/api/v1/campaigns',
      {
        name: `BF explicit ${tag}`,
        subject: use.data.subject,
        fromName: 'Obchod',
        fromEmail,
        templateId: use.data.id,
        listId,
        locale: 'sk',
        content: {
          subject: use.data.subject,
          preheader: use.data.preheader,
          blocks: use.data.blocks,
          globalStyles: use.data.globalStyles,
        },
      },
    );
    createdCampaigns.push(created.data.id);
    expect.soft(created.data.locale, 'the stated language was ignored').toBe('sk');

    const { mta } = await sendAndCollect(created.data.id);
    expect(mta.htmlBody, 'HTML part is not Slovak').toContain('Odhlásiť z odberu');
    expect(mta.textBody, 'text part is not Slovak').toContain('Odhlásiť z odberu');
  }, 120_000);

  it('a message with the opt-out in the HTML but not in the text is refused', async () => {
    // The renderer cannot reach this one. A legacy campaign stored as raw
    // { html, text } supplies its own text part verbatim, so the two halves
    // can disagree — and this is the disagreement that matters. The guard in
    // the sender is the last place it can be caught.
    const created = await api<{ data: { id: string } }>('POST', '/api/v1/campaigns', {
      name: `Half-compliant ${tag}`,
      subject: 'Akce',
      fromName: 'Obchod',
      fromEmail,
      listId,
      content: {
        html: '<p>Akce jen dnes.</p><a href="{{unsubscribe_url}}">Odhlásit</a>',
        text: 'Akce jen dnes.',
      },
    });
    createdCampaigns.push(created.data.id);

    const { batchData } = await sendToBatch(created.data.id);

    await expect(processBatchSender(batchJob(batchData))).rejects.toThrow(
      /rendered text has no unsubscribe link/,
    );

    // Refused means refused: the compliant-looking half must not go out alone.
    const queued = await jobsFor<MtaJobData>(mtaQueues.other, created.data.id);
    expect(queued, 'the batch was sent anyway').toHaveLength(0);
  }, 120_000);
});
