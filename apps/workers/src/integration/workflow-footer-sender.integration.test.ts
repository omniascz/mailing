/**
 * A workflow email's footer names the shop that sent it, in the email's language.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * The campaign dispatch reads the organisation's company name and postal
 * address and the campaign's locale, and hands all three to the batch sender
 * (services/campaigns/dispatch.ts). The workflow dispatch handed none of them.
 * The renderer appends the sender's name and address to the footer only when
 * it has an address, and words the opt-out link by locale with English as the
 * fallback — so every email a flow sent went out with no sender, no address
 * and an English "Unsubscribe" under Czech copy.
 *
 * The Czech footers made it worse on their own: they opened with
 * `{{company|default:"Váš e-shop"}}`, and `company` is not a system value, so
 * it resolved from the RECIPIENT's contact fields. A B2B contact with a company
 * on file saw their own firm printed where the sender belongs.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * The real API (built-in email cloned through the real route, the job posted
 * to the real /api/v1/internal/workflow/send-email), the real batch sender,
 * and the assertion is on the rendered footer cell of the job the MTA would
 * have picked up. Two Czech emails with different footers, one English email,
 * and an organisation that has filled in neither field.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * Every case first asserts that a real HTML body addressed to the test contact
 * came out and that it has a footer cell at all — a missing footer would
 * otherwise pass every "does not contain" below. The recipient carries a
 * company of their own, so "the sender is named" cannot pass by printing it.
 *
 * WHAT THIS FILE CANNOT SEE
 * - It does not run the workflow executor; it posts the job the executor
 *   produces, as workflow-template-body does.
 * - Nothing is handed to an SMTP server: the MTA queue is the last hop.
 * - The campaign path is not exercised here; campaign-content-shape and
 *   campaign-locale cover it.
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

let seed: SeedOrg;
let token: string;
let bareOrgId: string;
const contacts: Record<string, string> = {};
const createdTemplates: string[] = [];
const createdDomains: string[] = [];

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

/** Clone a built-in email into the seed org through the real route. */
async function cloneIntoSeed(builtInId: string): Promise<string> {
  const res = await fetch(`${API}/api/v1/templates/${builtInId}/use`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `wffoot ${tag} ${builtInId} ${randomUUID().slice(0, 6)}` }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`[wffoot] clone ${builtInId} → ${res.status}: ${text.slice(0, 300)}`);
  const id = (JSON.parse(text) as { data: { id: string } }).data.id;
  createdTemplates.push(id);
  return id;
}

async function makeOrgReady(orgId: string, key: string): Promise<void> {
  const domain = `wffoot-${key}-${tag}.test`;
  createdDomains.push(domain);
  await sql`
    INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified)
    VALUES (${orgId}, ${domain}, 'fm1', true, true)
  `;
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status, custom_fields)
    VALUES (${orgId}, ${`wffoot-${key}-${tag}@test.local`}, 'Petra', 'active',
            ${sql.json({ company: RECIPIENT_FIRM })})
    RETURNING id
  `;
  contacts[key] = c!.id;
}

/** Post the job a workflow step produces, run the batch sender, return the footer. */
async function sendAndReadFooter(
  orgId: string,
  key: string,
  templateId: string,
): Promise<{ html: string; footer: string }> {
  const beforeBatch = await idsOn(batchSenderQueues.triggered);
  const res = await fetch(`${API}/api/v1/internal/workflow/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
    body: JSON.stringify({ orgId, contactId: contacts[key], templateId, mergeData: {} }),
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
    (m) => m.toEmail === `wffoot-${key}-${tag}@test.local`,
  );
  expect(mta.length, 'the batch sender enqueued no MTA job for this contact').toBe(1);

  const html = mta[0]!.htmlBody;
  expect(html.startsWith('<!DOCTYPE html'), 'the body is not an HTML document').toBe(true);
  const cell = /<td[^>]*data-fm-optout="1"[^>]*>([\s\S]*?)<\/td>/.exec(html);
  expect(cell, 'the email has no footer cell').toBeTruthy();
  return { html, footer: cell![1]! };
}

describe('a workflow email footer names its sender, in its language (real DB + Redis + API)', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await loginAsSeedUser(API, 'wffoot');
    await makeOrgReady(seed.id, 'seed');

    // An organisation that never filled in Settings › Workspace. Its own row,
    // because the seed row is read-only (setup/seed-org.ts).
    const [org] = await sql<{ id: string }[]>`
      INSERT INTO organizations (name, slug)
      VALUES (${`wffoot bare ${tag}`}, ${`wffoot-bare-${tag}`})
      RETURNING id
    `;
    bareOrgId = org!.id;
    await makeOrgReady(bareOrgId, 'bare');
  }, 120_000);

  afterAll(async () => {
    if (createdTemplates.length)
      await sql`DELETE FROM templates WHERE id = ANY(${createdTemplates})`;
    const ids = Object.values(contacts);
    if (ids.length) await sql`DELETE FROM contacts WHERE id = ANY(${ids})`;
    if (createdDomains.length)
      await sql`DELETE FROM sending_domains WHERE domain = ANY(${createdDomains})`;
    if (bareOrgId) await sql`DELETE FROM organizations WHERE id = ${bareOrgId}`;
    await sql.end();
  }, 120_000);

  it.each(['cs-welcome-1', 'cs-winback'])(
    '%s: the shop, its address and a Czech opt-out — not the recipient’s firm',
    async (builtInId) => {
      const { footer } = await sendAndReadFooter(seed.id, 'seed', await cloneIntoSeed(builtInId));

      expect(footer, 'the sender is not named').toContain(seed.companyName);
      expect(footer, 'the postal address is missing').toContain(seed.postalAddress);
      expect(footer, 'the opt-out link is not in Czech').toContain('Odhlásit z odběru');
      expect(footer, 'the opt-out link is still English').not.toContain('Unsubscribe');
      expect(footer, 'the recipient’s own firm is printed as the sender').not.toContain(
        RECIPIENT_FIRM,
      );
    },
  );

  it('an English email keeps its English link, and now carries the sender too', async () => {
    // The locale comes from the template, not from a Czech default: an English
    // flow must not start saying "Odhlásit".
    const { footer } = await sendAndReadFooter(
      seed.id,
      'seed',
      await cloneIntoSeed('onboarding-001'),
    );

    expect(footer).toContain('Unsubscribe');
    expect(footer).not.toContain('Odhlásit');
    expect(footer, 'the postal address is missing').toContain(seed.postalAddress);
  });

  it('an organisation with no name or address on file still sends, on the fallback', async () => {
    // Not cloned through the route: the seed user's token belongs to the seed
    // org. Copied row-for-row from a clone instead, including its locale.
    const source = await cloneIntoSeed('cs-welcome-1');
    const [copy] = await sql<{ id: string }[]>`
      INSERT INTO templates (org_id, name, subject, preheader, blocks, global_styles, locale)
      SELECT ${bareOrgId}, name, subject, preheader, blocks, global_styles, locale
      FROM templates WHERE id = ${source}
      RETURNING id
    `;
    createdTemplates.push(copy!.id);

    const { footer } = await sendAndReadFooter(bareOrgId, 'bare', copy!.id);

    expect(footer, 'the fallback name is missing').toContain('Váš e-shop');
    expect(footer, 'the opt-out link is not in Czech').toContain('Odhlásit z odběru');
    expect(footer, 'the recipient’s own firm is printed as the sender').not.toContain(
      RECIPIENT_FIRM,
    );
  });
});
