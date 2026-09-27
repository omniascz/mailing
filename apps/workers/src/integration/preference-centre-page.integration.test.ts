/**
 * The preference-centre link in an email opens a page a person can use.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * `{{preference_center_url}}` renders to `<tracking base>/p/center/<token>`,
 * and GET on that answered `{"data":{...}}` — JSON, straight into the
 * recipient's browser. apps/web has no page for it. No built-in template
 * carries the tag any more, but the pre-send checklist tells customers to add
 * it (services/pre-send/go-no-go-pure.ts), so every customer who followed that
 * advice sent their readers a JSON dump.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * An email whose body carries the tag goes through the real API and the real
 * batch sender into an MTA job. The link is read out of that job's HTML, and
 * its path — with the token the sender signed, not one made here — is requested
 * from the real API the way a browser would. The page's own forms are then
 * posted, and the database is read to see that they did what they said.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * Every case first finds the link in a real MTA job. The "invalid link" and
 * "no token" cases assert that the contact's masked address and list names are
 * NOT on the page — a page that answers 400 while printing the data would
 * otherwise pass.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The tracking host. The email's link points at TRACKING_BASE_URL; the path
 *   is replayed against API_URL, which is the process that serves it.
 * - A real browser. Requests carry `Accept: text/html` and post the forms as
 *   application/x-www-form-urlencoded, which is what a browser sends.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Job, JobType, Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import { batchSenderQueues, mtaQueues, type BatchSenderJobData } from '../queues/index.js';

const API = process.env.API_URL!;
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET!;
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

const tag = randomUUID().slice(0, 8);
const sendingDomain = `wfpref-${tag}.test`;
const LIST_A = `Novinky ${tag}`;
const LIST_B = `Akce ${tag}`;

let seed: SeedOrg;
let templateId: string;
const contacts: Record<string, { id: string; email: string }> = {};
const listIds: string[] = [];

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

const batchJob = (data: BatchSenderJobData): Job<BatchSenderJobData> =>
  ({ data, log: async () => {} }) as unknown as Job<BatchSenderJobData>;

async function idsOn(queue: Queue): Promise<Set<string>> {
  const jobs = await queue.getJobs(ALL_STATES, 0, 5_000);
  return new Set(jobs.map((j) => String(j?.id)));
}

async function addedTo<T>(queue: Queue, before: Set<string>): Promise<T[]> {
  const jobs = await queue.getJobs(ALL_STATES, 0, 5_000);
  return jobs.filter((j) => j && !before.has(String(j.id))).map((j) => j.data as T);
}

/** Every link target in a body, with click-tracking wrappers undone. */
function hrefs(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const raw = m[1]!.replace(/&amp;/g, '&');
    const tracked = /\/track\/c\/([^".]+)/.exec(raw);
    if (tracked) {
      const json = Buffer.from(
        tracked[1]!.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8');
      out.push((JSON.parse(json) as { url: string }).url);
    } else out.push(raw);
  }
  return out;
}

/** Send the email to one contact and return the path of the link it carries. */
async function linkFromEmail(key: string, pathPart: string): Promise<string> {
  const beforeBatch = await idsOn(batchSenderQueues.triggered);
  const res = await fetch(`${API}/api/v1/internal/workflow/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
    body: JSON.stringify({
      orgId: seed.id,
      contactId: contacts[key]!.id,
      templateId,
      mergeData: {},
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const dispatched = (await res.json()) as { data?: { queued?: boolean } };
  expect(dispatched.data?.queued, `dispatch did not queue: ${JSON.stringify(dispatched)}`).toBe(
    true,
  );
  const [batch] = await addedTo<BatchSenderJobData>(batchSenderQueues.triggered, beforeBatch);
  expect(batch, 'the dispatch enqueued no batch-sender job').toBeTruthy();

  const beforeMta = await idsOn(mtaQueues.other);
  await processBatchSender(batchJob(batch!));
  const mta = (await addedTo<MtaJobData>(mtaQueues.other, beforeMta)).filter(
    (m) => m.toEmail === contacts[key]!.email,
  );
  expect(mta.length, 'the batch sender enqueued no MTA job for this contact').toBe(1);
  expect(mta[0]!.htmlBody.startsWith('<!DOCTYPE html')).toBe(true);

  const link = hrefs(mta[0]!.htmlBody).find((h) => h.includes(pathPart));
  expect(link, `the email carries no ${pathPart} link`).toBeTruthy();
  return new URL(link!).pathname;
}

const asBrowser = { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' };

async function page(path: string) {
  const res = await fetch(`${API}${path}`, {
    headers: asBrowser,
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  return {
    status: res.status,
    type: res.headers.get('content-type') ?? '',
    body: await res.text(),
  };
}

async function postForm(path: string, fields: Array<[string, string]>) {
  return fetch(`${API}${path}`, {
    method: 'POST',
    headers: { ...asBrowser, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
}

async function listState(contactId: string) {
  const rows = await sql<{ list_id: string; unsubscribed_at: Date | null }[]>`
    SELECT list_id, unsubscribed_at FROM contact_lists WHERE contact_id = ${contactId}
  `;
  return new Map(rows.map((r) => [r.list_id, r.unsubscribed_at === null]));
}

describe('the preference-centre link opens a page (real DB + Redis + API)', () => {
  let prefPath: string;
  let masked: string;

  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true)
    `;

    // The email a customer writes after the pre-send checklist told them to
    // add the tag: a line in the body, and the footer block.
    const [tpl] = await sql<{ id: string }[]>`
      INSERT INTO templates (org_id, name, subject, preheader, blocks, global_styles, locale)
      VALUES (${seed.id}, ${`wfpref ${tag}`}, 'Novinky', '',
        ${sql.json([
          {
            id: 'pc1',
            type: 'text',
            content:
              '<p>Dobrý den,</p><p><a href="{{preference_center_url}}">Nastavení odběru</a></p>',
            fontSize: '15px',
            fontFamily: 'Arial',
            color: '#111827',
            lineHeight: '1.5',
            textAlign: 'left',
          },
          {
            id: 'pc2',
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

    for (const name of [LIST_A, LIST_B]) {
      const [l] = await sql<{ id: string }[]>`
        INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${name}) RETURNING id
      `;
      listIds.push(l!.id);
    }

    for (const key of ['reader', 'leaver']) {
      const email = `wfpref-${key}-${tag}@test.local`;
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO contacts (org_id, email, first_name, status, custom_fields)
        VALUES (${seed.id}, ${email}, 'Petra', 'active', ${sql.json({ company: 'Firma Příjemce s.r.o.' })})
        RETURNING id
      `;
      contacts[key] = { id: c!.id, email };
      for (const listId of listIds) {
        await sql`INSERT INTO contact_lists (contact_id, list_id) VALUES (${c!.id}, ${listId})`;
      }
    }

    prefPath = await linkFromEmail('reader', '/p/center/');
    // maskEmail (services/preference-center): first letter, five stars at
    // most, last letter of the local part, then the whole domain.
    masked = `w*****${tag.slice(-1)}@test.local`;
  }, 120_000);

  afterAll(async () => {
    const ids = Object.values(contacts).map((c) => c.id);
    const emails = Object.values(contacts).map((c) => c.email);
    if (emails.length)
      await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email = ANY(${emails})`;
    if (ids.length) {
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${ids})`;
    }
    if (listIds.length) await sql`DELETE FROM lists WHERE id = ANY(${listIds})`;
    if (templateId) await sql`DELETE FROM templates WHERE id = ${templateId}`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 120_000);

  it('the link from the email opens an HTML page with this reader’s lists', async () => {
    const res = await page(prefPath);

    expect(res.type, 'the link still answers with JSON').toContain('text/html');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Spravovat vaše odběry');
    expect(res.body, 'the page does not say whose subscriptions these are').toContain(masked);
    expect(res.body).toContain(LIST_A);
    expect(res.body).toContain(LIST_B);
    expect(res.body, 'the full address leaked onto a public page').not.toContain(
      contacts.reader!.email,
    );
  });

  it('unticking a list and saving leaves that list, and the page says it was saved', async () => {
    const res = await postForm(prefPath, [
      ['action', 'save'],
      ['list', listIds[1]!],
    ]);
    expect(res.status).toBe(303);
    const location = res.headers.get('location')!;
    expect(location).toBe(`${prefPath}?saved=1`);

    const state = await listState(contacts.reader!.id);
    expect(state.get(listIds[0]!), `${LIST_A} is still subscribed`).toBe(false);
    expect(state.get(listIds[1]!), `${LIST_B} was dropped as well`).toBe(true);

    const after = await page(location);
    expect(after.body).toContain('Vaše nastavení bylo uloženo.');
  });

  it('ticking it again rejoins the list', async () => {
    const res = await postForm(prefPath, [
      ['action', 'save'],
      ['list', listIds[0]!],
      ['list', listIds[1]!],
    ]);
    expect(res.status).toBe(303);
    const state = await listState(contacts.reader!.id);
    expect(state.get(listIds[0]!)).toBe(true);
    expect(state.get(listIds[1]!)).toBe(true);
  });

  it('the JSON contract is unchanged for a client that does not ask for HTML', async () => {
    const res = await fetch(`${API}${prefPath}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
    const json = (await res.json()) as { data: { lists: unknown[]; emailMasked: string } };
    expect(json.data.lists).toHaveLength(2);
    expect(json.data.emailMasked).toBe(masked);
  });

  it('"unsubscribe from all" unsubscribes, and the page offers no false way back', async () => {
    const res = await postForm(prefPath, [['action', 'unsubscribe_all']]);
    expect(res.status).toBe(303);

    const [c] = await sql<{ status: string }[]>`
      SELECT status FROM contacts WHERE id = ${contacts.reader!.id}
    `;
    expect(c!.status).toBe('unsubscribed');
    const sup = await sql`
      SELECT 1 FROM suppressions WHERE org_id = ${seed.id} AND email = ${contacts.reader!.email}
    `;
    expect(sup.length, 'no suppression row').toBe(1);

    const after = await page(res.headers.get('location')!);
    expect(after.body).toContain('Jste odhlášeni ze všech zpráv');
    expect(after.body, 'the page still offers list toggles').not.toContain('type="checkbox"');
  });

  it('a tampered token gets a readable page and none of the data', async () => {
    const bad = prefPath.slice(0, -3) + (prefPath.endsWith('AAA') ? 'BBB' : 'AAA');
    const res = await page(bad);
    expect(res.status).toBe(400);
    expect(res.type).toContain('text/html');
    expect(res.body).toContain('Neplatný odkaz');
    expect(res.body).not.toContain(masked);
    expect(res.body).not.toContain(LIST_A);

    const post = await postForm(bad, [['action', 'unsubscribe_all']]);
    expect(post.status).toBe(400);
    expect(await post.text()).toContain('Neplatný odkaz');
  });

  it('no token, no page', async () => {
    // The router answers this without reaching the handler (401 on this app);
    // what matters is that nothing about any contact comes back.
    const res = await page('/p/center/');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body).not.toContain(LIST_A);
    expect(res.body).not.toContain(masked);
  });

  it('the unsubscribe link in the same email still unsubscribes on its own', async () => {
    // Asserted on what the click DOES, not on the confirmation page. For an
    // email sent by a flow that page answers 400 "invalid link" on master as
    // well: the token carries the dispatch's synthetic campaignId (the org id,
    // routes/v1/internal/workflow-dispatch.ts) and writing the unsubscribe
    // event trips the email_events → campaigns foreign key after the contact
    // has already been unsubscribed. That is the unsubscribe path's own bug,
    // outside this change; pinning the 400 here would enshrine it.
    const unsubPath = await linkFromEmail('leaver', '/api/v1/unsubscribe/');
    const res = await page(unsubPath);
    expect(res.type).toContain('text/html');

    const [c] = await sql<{ status: string }[]>`
      SELECT status FROM contacts WHERE id = ${contacts.leaver!.id}
    `;
    expect(c!.status).toBe('unsubscribed');
    const sup = await sql`
      SELECT 1 FROM suppressions WHERE org_id = ${seed.id} AND email = ${contacts.leaver!.email}
    `;
    expect(sup.length, 'the unsubscribe wrote no suppression').toBe(1);
  });
});
