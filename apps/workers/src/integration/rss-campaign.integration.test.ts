/**
 * An RSS campaign, walked end to end: real API route, real splitter, real
 * batch-sender, and the assertion is on the body of the job the MTA would have
 * picked up.
 *
 * ─── What this pins ─────────────────────────────────────────────────────────
 *
 * api/services/rss used to store the parsed feed as
 * `{ items, sourceFeed, generatedFrom }`. readCampaignContent reports that as
 * 'unknown', so batch-sender fell to its last branch and put
 * `JSON.stringify(content)` in both halves of the message. Measured on master:
 * htmlBody and textBody were the feed's JSON with a tracking pixel appended.
 *
 * The only reason no subscriber received it was assertOptOutPresent — and the
 * feed decides whether that trips. An item whose text contains
 * `{{unsubscribe_url}}` satisfies the guard, and the JSON goes out.
 *
 * So the four things below are the point: the campaign takes the block path,
 * the renderer's compliance footer is in BOTH halves, the sanitiser sees the
 * feed's text, and UTM is applied to the feed's links. None of that is
 * something api/services/rss does; it is what Path 1 does, and this file
 * proves the campaign is on Path 1.
 *
 * The content is built with the same function processOne calls, so a change
 * that stopped producing a block schema fails here too.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Job, JobType, Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { readSeedOrg } from './setup/seed-org.js';
// Not via the package export map: apps/api does not export services/rss, and
// adding an export for a test would be a change to the package's public
// surface. The file imports only a TYPE from ./index.js, so nothing here opens
// a database connection.
import { buildRssCampaignContent } from '../../../api/dist/services/rss/email-schema.js';
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
const sendingDomain = `rss-${tag}.test`;
const fromEmail = `feed@${sendingDomain}`;
const FEED_URL = 'https://eshop.example/rss';

let orgId: string;
let listId: string;
let contactId: string;
let token: string;
/** Read from the seed org, never written by this file. See setup/seed-org.ts. */
let postalAddress: string;

const createdCampaigns: string[] = [];

interface FeedItem {
  guid: string;
  title: string;
  link: string;
  description?: string;
  pubDate?: Date;
}

const ITEMS: FeedItem[] = [
  {
    guid: 'boty',
    title: 'Nove boty na podzim',
    link: 'https://eshop.example/blog/boty',
    description: 'Podzimni kolekce je skladem.',
    pubDate: new Date('2026-08-25T08:00:00.000Z'),
  },
  {
    guid: 'bundy',
    title: 'Sleva 20 % na bundy',
    link: 'https://eshop.example/blog/bundy',
    description: 'Jen do nedele.',
    pubDate: new Date('2026-08-26T08:00:00.000Z'),
  },
];

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
  if (!res.ok) throw new Error(`[rss] ${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as T;
}

function splitterJob(data: CampaignSplitterJobData): Job<CampaignSplitterJobData> {
  return {
    id: `rss-${randomUUID()}`,
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

/**
 * The URLs behind the click-tracking wrapper.
 *
 * Links in a marketing body are rewritten to `/track/c/<payload>.<sig>` before
 * they reach the wire, so an assertion on `href="https://eshop.example/..."`
 * would fail for a reason that has nothing to do with this change. The payload
 * is base64url JSON carrying the real destination — decoded here so the tests
 * below can assert on where the link actually goes.
 */
function clickTargets(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/\/track\/c\/([A-Za-z0-9_-]+)\./g)) {
    const json = Buffer.from(m[1]!, 'base64url').toString('utf8');
    const url = (JSON.parse(json) as { url?: string }).url;
    if (url) out.push(url);
  }
  return out;
}

async function makeRssCampaign(name: string, items: FeedItem[]): Promise<string> {
  const subject = 'Novinky z blogu';
  const created = await api<{ data: { id: string } }>('POST', '/api/v1/campaigns', {
    name: `${name} ${tag}`,
    subject,
    fromName: 'Blog',
    fromEmail,
    listId,
    // Exactly what processOne writes.
    content: buildRssCampaignContent(subject, items, FEED_URL),
    utmTracking: { enabled: true, source: 'email', medium: 'rss', campaign: 'blog' },
  });
  createdCampaigns.push(created.data.id);
  return created.data.id;
}

/** Send, run the splitter, run the batch-sender, return the MTA job. */
async function sendAndCollect(campaignId: string): Promise<MtaJobData> {
  await api('POST', `/api/v1/campaigns/${campaignId}/send`);

  const [splitterData] = await jobsFor<CampaignSplitterJobData>(campaignSplitterQueue, campaignId);
  if (!splitterData) throw new Error('[rss] dispatch enqueued no splitter job');
  await processCampaignSplitter(splitterJob(splitterData));

  const [batchData] = await jobsFor<BatchSenderJobData>(batchSenderQueue, campaignId);
  if (!batchData) throw new Error('[rss] splitter enqueued no batch job');
  await processBatchSender(batchJob(batchData));

  const [mta] = await jobsFor<MtaJobData>(mtaQueues.other, campaignId);
  if (!mta) throw new Error('[rss] batch-sender enqueued no MTA job');
  return mta;
}

describe('RSS campaign end to end (real DB + Redis + API)', () => {
  beforeAll(async () => {
    const org = await readSeedOrg(sql);
    orgId = org.id;
    postalAddress = org.postalAddress;
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified)
      VALUES (${orgId}, ${sendingDomain}, 'fm1', true, true)
    `;

    const [list] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name) VALUES (${orgId}, ${`rss ${tag}`}) RETURNING id
    `;
    listId = list!.id;
    const [contact] = await sql<{ id: string }[]>`
      INSERT INTO contacts (org_id, email, first_name, status)
      VALUES (${orgId}, ${`rss-${tag}@test.local`}, 'Jana', 'active')
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

  it('sends the feed as HTML, not as the feed’s JSON', async () => {
    const id = await makeRssCampaign('rss body', ITEMS);
    const mta = await sendAndCollect(id);

    // The exact failure this replaces: the body WAS the serialised content.
    expect(mta.htmlBody, 'the body is the feed’s JSON').not.toContain('"generatedFrom":"rss"');
    expect(mta.htmlBody).not.toContain('"sourceFeed"');
    expect(mta.textBody).not.toContain('"generatedFrom":"rss"');

    // Both items, with their links, rendered as HTML.
    expect(mta.htmlBody).toContain('Nove boty na podzim');
    expect(mta.htmlBody).toContain('Sleva 20 % na bundy');
    expect(mta.htmlBody).toContain('Podzimni kolekce je skladem.');
    // The feed's links are real anchors. They arrive click-wrapped, so the
    // destination is read out of the token rather than off the href.
    expect(clickTargets(mta.htmlBody).map((u) => u.split('?')[0])).toEqual(
      expect.arrayContaining([
        'https://eshop.example/blog/boty',
        'https://eshop.example/blog/bundy',
      ]),
    );

    // And the plain-text alternative is derived from the blocks, not absent.
    expect(mta.textBody).toContain('Nove boty na podzim');
    expect(mta.textBody).toContain('Sleva 20 % na bundy');
  }, 180_000);

  it('gets the compliance footer from the renderer, in both halves', async () => {
    // The feed carries no opt-out and no postal address. On the old path the
    // guard threw here; on the block path the renderer appends the footer,
    // which is the difference between a campaign that cannot be sent and one
    // that is lawful to send.
    const id = await makeRssCampaign('rss footer', ITEMS);
    const mta = await sendAndCollect(id);

    expect(mta.htmlBody, 'no unsubscribe link in the HTML part').toMatch(/\/unsubscribe\//);
    expect(mta.textBody, 'no unsubscribe link in the text part').toMatch(/\/unsubscribe\//);
    expect(mta.htmlBody, 'the postal address is the other half of the footer').toContain(
      postalAddress,
    );
    expect(mta.textBody).toContain(postalAddress);
  }, 180_000);

  it('applies UTM to the links that came out of the feed', async () => {
    const id = await makeRssCampaign('rss utm', ITEMS);
    const mta = await sendAndCollect(id);

    // UTM is appended by the renderer BEFORE the link is click-wrapped, so the
    // parameters live in the tracked destination.
    const targets = clickTargets(mta.htmlBody);
    expect(targets.length, 'no tracked links at all').toBeGreaterThan(0);
    const boty = targets.find((u) => u.startsWith('https://eshop.example/blog/boty'));
    expect(boty, 'the feed link is not among the tracked links').toBeDefined();
    const params = new URL(boty!).searchParams;
    expect(params.get('utm_source')).toBe('email');
    expect(params.get('utm_medium')).toBe('rss');
    expect(params.get('utm_campaign')).toBe('blog');
  }, 180_000);

  it('sanitises hostile feed content at the renderer, not by trusting the parser', async () => {
    // parseRssXml runs cleanText, which only strips TAGS — `javascript:` in a
    // <link> passes through it untouched, and cleanText is not reached at all
    // by anything that writes items another way. So the items here are hostile
    // as delivered to the builder, and the assertion is on what the RENDERER
    // produced.
    const hostile: FeedItem[] = [
      {
        guid: 'x1',
        title: '<script>alert(1)</script>Sleva',
        link: 'https://eshop.example/ok',
        description: '<img src=x onerror=alert(1)>',
      },
      {
        guid: 'x2',
        title: 'Klikni sem',
        link: 'javascript:alert(document.domain)',
        description: 'Neskodny popis.',
      },
    ];
    const id = await makeRssCampaign('rss hostile', hostile);
    const mta = await sendAndCollect(id);

    // The same HTML is served by view-in-browser on our own origin, so this is
    // script in our origin, not just something a mail client would ignore.
    // The body is checked for MARKUP, not for the substrings. The hostile text
    // is expected to be present as escaped text — that is the point of
    // escaping — so `not.toContain('onerror=')` would fail on a body that is
    // in fact safe, and would be a test that only passes when the text is lost.
    expect(mta.htmlBody, 'a script tag survived into the body').not.toMatch(/<script/i);
    expect(mta.htmlBody, 'an img tag with an event handler survived').not.toMatch(
      /<img[^>]*onerror/i,
    );
    expect(mta.htmlBody, 'an inline event handler survived on some tag').not.toMatch(
      /<[a-z][^>]*\son[a-z]+\s*=/i,
    );
    expect(mta.htmlBody, 'a javascript: URL survived in an href').not.toMatch(
      /href="[^"]*javascript:/i,
    );

    // Escaped, not dropped: the reader still sees what the feed said.
    expect(mta.htmlBody).toContain('&lt;script&gt;alert(1)&lt;/script&gt;Sleva');
    expect(mta.htmlBody).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(mta.htmlBody).toContain('Klikni sem');

    // The javascript: item got no link at all — not a stripped href, no anchor.
    expect(clickTargets(mta.htmlBody).some((u) => u.includes('alert'))).toBe(false);
    expect(mta.htmlBody).toMatch(/<h2[^>]*>Klikni sem<\/h2>/);
  }, 180_000);

  it('a feed item quoting {{unsubscribe_url}} no longer ships JSON', async () => {
    // This was the way past the guard: on the old path the body was the feed's
    // JSON, and an item containing this tag satisfied assertOptOutPresent, so
    // the JSON went out with a literal `{{unsubscribe_url}}` where the opt-out
    // should have been. On the block path the tag is resolved by the renderer
    // like any other merge tag.
    const items: FeedItem[] = [
      {
        guid: 'u1',
        title: 'Novinka',
        link: 'https://eshop.example/blog/novinka',
        description: 'Odhlasit: {{unsubscribe_url}}',
      },
    ];
    const id = await makeRssCampaign('rss optout tag', items);
    const mta = await sendAndCollect(id);

    expect(mta.htmlBody).not.toContain('"generatedFrom":"rss"');
    expect(mta.htmlBody, 'the merge tag reached the wire unresolved').not.toContain(
      '{{unsubscribe_url}}',
    );
    expect(mta.textBody).not.toContain('{{unsubscribe_url}}');
    expect(mta.htmlBody).toMatch(/\/unsubscribe\//);
  }, 180_000);
});
