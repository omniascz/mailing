/**
 * The invoice email announces the shop's invoice. It is not the invoice.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * cs-invoice called itself a tax document ("Daňový doklad", "Tento e-mail je
 * daňový doklad zaslaný elektronicky"), said the invoice was attached as PDF
 * and ISDOC, and filled the supplier from `{{company}}` — the RECIPIENT's own
 * company — with an IČO and DIČ that nothing in the product carries. The
 * workflow path carries no attachment at all. The shop issues the invoice;
 * this email only tells the customer it is there and links to it.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * The real API (the built-in cloned through the real route, the job posted to
 * the real /api/v1/internal/workflow/send-email), the real batch sender, and
 * the assertions are on the HTML and text of the job the MTA would pick up.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * The recipient carries a company of their own, so "the supplier is the shop"
 * cannot pass by printing whoever is on file. Every "does not say" below runs
 * only after the body is shown to be a real HTML email with the invoice number
 * from the event in it.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The workflow executor and the one-day wait in pickup-invoice-cs; apps/api
 *   czech-flow-templates covers the fork and the steps.
 * - Whether the shop's PDF link works. It asserts the button leads to the URL
 *   the event carried.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Job, JobType, Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { loginAsSeedUser } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import { batchSenderQueues, mtaQueues, type BatchSenderJobData } from '../queues/index.js';

const API = process.env.API_URL!;
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET!;
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

const tag = randomUUID().slice(0, 8);
const RECIPIENT_FIRM = 'Firma Příjemce s.r.o.';
const EMAIL = `wfinv-${tag}@test.local`;
const PDF_URL = 'https://shop.example.cz/faktura/FA-2026-0077.pdf';

let seed: SeedOrg;
let token: string;
let contactId: string;
const sendingDomain = `wfinv-${tag}.test`;
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
  toEmail: string;
  htmlBody: string;
  textBody: string;
  subject: string;
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

/** Where tracked links lead: click tracking wraps every href in a signed token. */
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

/** The visible text of an HTML body, whitespace collapsed. */
const visible = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

async function sendInvoice(): Promise<MtaJobData> {
  const res = await fetch(`${API}/api/v1/templates/cs-invoice/use`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `wfinv ${tag}` }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[wfinv] clone → ${res.status}: ${text.slice(0, 300)}`);
  const templateId = (JSON.parse(text) as { data: { id: string } }).data.id;
  createdTemplates.push(templateId);

  const beforeBatch = await idsOn(batchSenderQueues.triggered);
  const dispatch = await fetch(`${API}/api/v1/internal/workflow/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
    // The subject pickup-invoice-cs step e2 sends with (registry.ts).
    body: JSON.stringify({
      orgId: seed.id,
      contactId,
      templateId,
      subject: 'Faktura {{invoice.number|default:"—"}} k objednávce {{order.number|default:"—"}}',
      mergeData: {
        invoice: {
          number: 'FA-2026-0077',
          pdf_url: PDF_URL,
          total: '1 299 Kč',
          due_date: '10. 10. 2026',
          customer_html: 'Petra Nová, Dlouhá 5, 602 00 Brno',
        },
        order: { number: 'OBJ-2026-0077' },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const dispatched = (await dispatch.json()) as { data?: { queued?: boolean } };
  expect(dispatched.data?.queued, `dispatch did not queue: ${JSON.stringify(dispatched)}`).toBe(
    true,
  );

  const [batch] = await addedTo<BatchSenderJobData>(batchSenderQueues.triggered, beforeBatch);
  expect(batch, 'the dispatch enqueued no batch-sender job').toBeTruthy();

  const beforeMta = await idsOn(mtaQueues.other);
  await processBatchSender(batchJob(batch!));
  const mta = (await addedTo<MtaJobData>(mtaQueues.other, beforeMta)).filter(
    (m) => m.toEmail === EMAIL,
  );
  expect(mta.length, 'the batch sender enqueued no MTA job for this contact').toBe(1);
  return mta[0]!;
}

describe('cs-invoice announces the shop’s invoice (real DB + Redis + API)', () => {
  let mta: MtaJobData;
  let body: string;

  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await loginAsSeedUser(API, 'wfinv');
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true)
    `;
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO contacts (org_id, email, first_name, status, custom_fields)
      VALUES (${seed.id}, ${EMAIL}, 'Petra', 'active', ${sql.json({ company: RECIPIENT_FIRM })})
      RETURNING id
    `;
    contactId = c!.id;

    mta = await sendInvoice();
    body = visible(mta.htmlBody);
  }, 120_000);

  afterAll(async () => {
    if (createdTemplates.length)
      await sql`DELETE FROM templates WHERE id = ANY(${createdTemplates})`;
    if (contactId) await sql`DELETE FROM contacts WHERE id = ${contactId}`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 120_000);

  it('went all the way to an MTA job, as an HTML email about this invoice', () => {
    expect(mta.htmlBody.startsWith('<!DOCTYPE html')).toBe(true);
    expect(body).toContain('FA-2026-0077');
    expect(mta.subject).toBe('Faktura FA-2026-0077 k objednávce OBJ-2026-0077');
    expect(mta.htmlBody, 'a raw tag reached the body').not.toMatch(/\{\{/);
  });

  it('names the shop as the supplier, with its address — not the recipient', () => {
    const start = body.indexOf('Dodavatel');
    const end = body.indexOf('Odběratel');
    expect(start, 'no supplier block').toBeGreaterThanOrEqual(0);
    expect(end, 'no customer block after the supplier').toBeGreaterThan(start);
    const supplier = body.slice(start, end);

    expect(supplier).toContain(seed.companyName);
    expect(supplier).toContain(seed.postalAddress);
    expect(supplier, 'the recipient is printed as the supplier').not.toContain(RECIPIENT_FIRM);
    expect(body.slice(end), 'the customer block lost the customer').toContain('Petra Nová');
  });

  it('claims no attachment and no tax document, in either part', () => {
    for (const [part, text] of [
      ['HTML', body],
      ['text', mta.textBody],
    ] as const) {
      expect(text, `${part}: claims an attachment`).not.toMatch(/přílo[hz]/i);
      expect(text, `${part}: mentions ISDOC`).not.toContain('ISDOC');
      expect(text, `${part}: calls itself a tax document`).not.toMatch(/daňov/i);
      expect(text, `${part}: prints an IČO with no source`).not.toContain('IČO');
      expect(text, `${part}: prints a DIČ with no source`).not.toContain('DIČ');
    }
  });

  it('the button leads to the invoice the shop issued', () => {
    expect(trackedTargets(mta.htmlBody)).toContain(PDF_URL);
  });
});
