/**
 * A workflow step that sends a TEMPLATE produces an email, not a JSON dump.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * The internal dispatch handed the batch sender `{ blocks, globalStyles }`.
 * emailSchema requires a subject, so readCampaignContent returned null; and
 * even with one it would still have failed, because the built-in emails point
 * their buttons at `{{order.status_url|default:"#"}}` and the block schema
 * validated urls with z.string().url(). renderEmail therefore fell past the
 * blocks path, found no `html` either, and returned JSON.stringify(content):
 * the recipient's body was the raw block JSON with the tags unsubstituted.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * The real API process (the built-in email is cloned through the real route,
 * the job goes through the real /api/v1/internal/workflow/send-email), the real
 * batch sender, and the assertion is on the body of the job the MTA would have
 * picked up — the same place campaign-content-shape asserts. Nothing here is a
 * stand-in except the BullMQ Job wrapper, which processBatchSender only uses
 * for `.data` and `.log()`.
 *
 * Three Czech templates, three different namespaces in the event: order,
 * invoice and product.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * An email that never got sent would also contain no JSON, so every case reads
 * a real MTA job addressed to the test contact and asserts the body IS an HTML
 * document, carries the event's value, has no raw {{tag}} left, and has no
 * block JSON in it. One case asserts that a value the event omits still renders
 * as its default rather than as a tag.
 *
 * WHAT THIS FILE CANNOT SEE
 * - It does not run the workflow executor; it posts the job that executor
 *   produces (apps/api has the executor half, in
 *   workflow-template-merge-data.integration.test.ts).
 * - Nothing is handed to an SMTP server: the MTA queue is the last hop here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Job, JobType, Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { loginAsSeedUser } from './setup/login.js';
import { readSeedOrg } from './setup/seed-org.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import { batchSenderQueues, mtaQueues, type BatchSenderJobData } from '../queues/index.js';

const API = process.env.API_URL!;
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET!;
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

const tag = randomUUID().slice(0, 8);
const sendingDomain = `wftpl-${tag}.test`;

let orgId: string;
let contactId: string;
let token: string;
const createdTemplates: string[] = [];

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
  textBody: string;
  subject: string;
}

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
  if (!res.ok) throw new Error(`[wftpl] ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as T;
}

/**
 * Where the tracked links in a body actually lead.
 *
 * Every http(s) href is rewritten to `<base>/track/c/<token>`, and the token is
 * a signed JSON payload carrying the original `url`. Asserting on the raw
 * destination would therefore assert on something no recipient sees.
 */
function trackedTargets(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href="[^"]*\/track\/c\/([^".]+)/g)) {
    const json = Buffer.from(m[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    );
    out.push((JSON.parse(json) as { url: string }).url);
  }
  return out;
}

const batchJob = (data: BatchSenderJobData): Job<BatchSenderJobData> =>
  ({ data, log: async () => {} }) as unknown as Job<BatchSenderJobData>;

/** Ids currently on a queue — nothing on a triggered job names the run. */
async function idsOn(queue: Queue): Promise<Set<string>> {
  const jobs = await queue.getJobs(ALL_STATES, 0, 5_000);
  return new Set(jobs.map((j) => String(j?.id)));
}

async function addedTo<T>(queue: Queue, before: Set<string>): Promise<T[]> {
  const jobs = await queue.getJobs(ALL_STATES, 0, 5_000);
  return jobs.filter((j) => j && !before.has(String(j.id))).map((j) => j.data as T);
}

/** Clone a built-in email into the org the way a fork does, and send it. */
async function sendTemplate(
  builtInId: string,
  subject: string,
  mergeData: Record<string, unknown>,
): Promise<MtaJobData> {
  const used = await api<{ data: { id: string } }>('POST', `/api/v1/templates/${builtInId}/use`, {
    name: `wftpl ${tag} ${builtInId} ${randomUUID().slice(0, 6)}`,
  });
  const templateId = used.data.id;
  createdTemplates.push(templateId);

  const beforeBatch = await idsOn(batchSenderQueues.triggered);
  const res = await fetch(`${API}/api/v1/internal/workflow/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
    body: JSON.stringify({ orgId, contactId, templateId, subject, mergeData }),
    signal: AbortSignal.timeout(20_000),
  });
  const dispatched = (await res.json()) as { data?: { queued?: boolean; reason?: string } };
  // The route answers 200 for "skipped" too (no verified sending domain, no
  // contact email); without this the queue read below would find nothing and
  // every assertion about the body would never run.
  expect(dispatched.data?.queued, `dispatch did not queue: ${JSON.stringify(dispatched)}`).toBe(
    true,
  );

  const [batch] = await addedTo<BatchSenderJobData>(batchSenderQueues.triggered, beforeBatch);
  expect(batch, 'the dispatch enqueued no batch-sender job').toBeTruthy();

  const beforeMta = await idsOn(mtaQueues.other);
  await processBatchSender(batchJob(batch!));
  const mta = (await addedTo<MtaJobData>(mtaQueues.other, beforeMta)).filter(
    (m) => m.toEmail === `wftpl-${tag}@test.local`,
  );
  expect(mta.length, 'the batch sender enqueued no MTA job for this contact').toBe(1);
  return mta[0]!;
}

describe('a templated workflow send renders an email (real DB + Redis + API)', () => {
  beforeAll(async () => {
    const org = await readSeedOrg(sql);
    orgId = org.id;
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified)
      VALUES (${orgId}, ${sendingDomain}, 'fm1', true, true)
    `;
    const [contact] = await sql<{ id: string }[]>`
      INSERT INTO contacts (org_id, email, first_name, status)
      VALUES (${orgId}, ${`wftpl-${tag}@test.local`}, 'Jana', 'active')
      RETURNING id
    `;
    contactId = contact!.id;
    token = await loginAsSeedUser(API, 'wftpl');
  }, 120_000);

  afterAll(async () => {
    if (createdTemplates.length)
      await sql`DELETE FROM templates WHERE id = ANY(${createdTemplates})`;
    if (contactId) await sql`DELETE FROM contacts WHERE id = ${contactId}`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 120_000);

  it('cs-order-confirm: the body is an HTML email carrying the order', async () => {
    const mta = await sendTemplate(
      'cs-order-confirm',
      'Objednávka {{order.number|default:"č. —"}} přijata',
      {
        order: {
          number: 'OBJ-2026-0042',
          total: '1 299 Kč',
          status_url: 'https://shop.example.cz/objednavka/42',
        },
      },
    );

    expect(mta.htmlBody.startsWith('<!DOCTYPE html'), 'the body is not an HTML document').toBe(
      true,
    );
    expect(mta.htmlBody, 'the body is still block JSON').not.toContain('"type":"button"');
    expect(mta.htmlBody).toContain('OBJ-2026-0042');
    // The button's destination came from the event. It is not in the body
    // verbatim — click tracking wraps every http(s) href into /track/c/<token>
    // (editor render.ts) — so the assertion decodes the token it was wrapped
    // into, which is the URL the recipient's click resolves to.
    expect(trackedTargets(mta.htmlBody), 'the button does not lead to the order').toContain(
      'https://shop.example.cz/objednavka/42',
    );
    expect(mta.htmlBody, 'a raw tag reached the body').not.toMatch(/\{\{/);
    expect(mta.subject).toBe('Objednávka OBJ-2026-0042 přijata');
    // The plain-text part is built from the same blocks.
    expect(mta.textBody).toContain('OBJ-2026-0042');
    expect(mta.textBody).not.toMatch(/\{\{/);
  });

  it('cs-invoice: invoice.* and order.* both reach the body', async () => {
    const mta = await sendTemplate(
      'cs-invoice',
      'Faktura {{invoice.number|default:"—"}} k objednávce {{order.number|default:"—"}}',
      {
        invoice: { number: 'FA-2026-118', amount: '1 299 Kč' },
        order: { number: 'OBJ-2026-0043' },
      },
    );

    expect(mta.htmlBody.startsWith('<!DOCTYPE html')).toBe(true);
    expect(mta.htmlBody).toContain('FA-2026-118');
    expect(mta.htmlBody).toContain('OBJ-2026-0043');
    expect(mta.htmlBody).not.toMatch(/\{\{/);
    expect(mta.subject).toBe('Faktura FA-2026-118 k objednávce OBJ-2026-0043');
  });

  it('cs-back-in-stock: product.* reaches the body, and an omitted value falls to its default', async () => {
    // The event names the product but not the number of people waiting.
    const mta = await sendTemplate(
      'cs-back-in-stock',
      '{{product.title|default:"Zboží"}} je zpátky skladem',
      { product: { title: 'Konvice Bialetti 6 šálků', stock_qty: '7' } },
    );

    expect(mta.htmlBody.startsWith('<!DOCTYPE html')).toBe(true);
    expect(mta.htmlBody).toContain('Konvice Bialetti 6 šálků');
    expect(mta.htmlBody).toContain('7');
    expect(mta.htmlBody, 'an unresolved tag leaked into the body').not.toMatch(/\{\{/);
    expect(mta.subject).toBe('Konvice Bialetti 6 šálků je zpátky skladem');
  });

  it('a send with no event data at all still produces an email, on the defaults', async () => {
    const mta = await sendTemplate(
      'cs-order-confirm',
      'Objednávka {{order.number|default:"č. —"}} přijata',
      {},
    );

    expect(mta.htmlBody.startsWith('<!DOCTYPE html')).toBe(true);
    expect(mta.htmlBody).not.toMatch(/\{\{/);
    expect(mta.htmlBody, 'the body is still block JSON').not.toContain('"type":"button"');
    expect(mta.subject).toBe('Objednávka č. — přijata');
  });
});
