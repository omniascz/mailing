/**
 * What batch-sender does when an internal filter cannot answer.
 *
 * The filters used to fail OPEN: no answer meant an empty list, an empty list
 * meant nobody was filtered, and the batch went out with suppression,
 * frequency capping, holdout and GDPR consent silently disabled. The API only
 * had to be briefly unreachable for a campaign to ignore every rule it was
 * supposed to respect, and nothing in the job's result said so.
 *
 * These tests point the worker at a fake API whose responses this file
 * controls, so the failure modes are reproducible rather than waited for. The
 * real API cannot be made to return 503 on demand.
 *
 * Two of the five are about NOT over-correcting. Making every filter
 * fail-closed would pass a suite that only tested the protective ones, and
 * would mean a missing newsletter tier name could stop a campaign — which is
 * a worse product than the bug being fixed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import type * as QueuesModuleNs from '../queues/index.js';

let ORIGINAL_API_URL: string | undefined;
type QueuesModule = typeof QueuesModuleNs;

const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

/** Routes the fake API answers with something other than 200. */
type Overrides = Record<string, { status: number; body?: unknown }>;
let overrides: Overrides = {};

let server: http.Server;
let orgId: string;
let contactId: string;
let campaignId: string;

/** Set before importing batch-sender, which reads API_URL at module load. */
let processBatchSender: (job: Job<never>) => Promise<unknown>;
let mtaQueues: QueuesModule['mtaQueues'];

function fakeJob(data: Record<string, unknown>): Job<never> {
  return {
    data,
    log: async () => {},
  } as unknown as Job<never>;
}

/** Minimal stand-in for the internal API, with per-route failure injection. */
function startFakeApi(): Promise<number> {
  server = http.createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0]!;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const override = overrides[path];
      if (override) {
        res.writeHead(override.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(override.body ?? { error: 'injected' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: defaultBody(path) }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

/** The happy-path answer for every route batch-sender calls. */
function defaultBody(path: string): unknown {
  switch (path) {
    case '/api/v1/internal/contacts/batch':
      return [
        {
          id: contactId,
          email: 'fail-closed-probe@test.local',
          firstName: 'Probe',
          lastName: null,
          customFields: {},
        },
      ];
    case '/api/v1/internal/suppressions/check-batch':
      return { suppressed: [] };
    case '/api/v1/internal/frequency/check-batch':
      return { capped: [] };
    case '/api/v1/internal/holdout/check-batch':
      return { heldOut: [] };
    case '/api/v1/internal/consent/check-batch':
      return { blocked: [], reasons: {}, featureEnabled: false };
    case '/api/v1/internal/consent/opted-in-batch':
      return { optedIn: [] };
    case '/api/v1/internal/org/suspended':
      return { suspended: false };
    case '/api/v1/internal/org/tracking-strict':
      return { strict: false };
    case '/api/v1/internal/newsletter-tiers/batch':
      return [{ contactId, tierName: 'Pro' }];
    case '/api/v1/internal/tracking-domain':
      return { baseUrl: 'https://links.probe.test', branded: true };
    default:
      return {};
  }
}

async function queuedCount(): Promise<number> {
  const jobs = await mtaQueues.other.getJobs(['waiting', 'delayed', 'prioritized', 'active']);
  return jobs.length;
}

describe('batch-sender fail-closed policy (fake API + real Redis)', () => {
  beforeAll(async () => {
    const port = await startFakeApi();
    // This lane runs files sequentially in one process, so a URL left pointing
    // at a closed mock server would break whatever runs next.
    ORIGINAL_API_URL = process.env.API_URL;
    process.env.API_URL = `http://127.0.0.1:${port}`;

    const [org] = await sql<{ id: string }[]>`
      SELECT id FROM organizations WHERE slug = 'acme-demo' LIMIT 1
    `;
    if (!org) throw new Error('[workers-integration] seed org missing');
    orgId = org.id;

    const [c] = await sql<{ id: string }[]>`
      INSERT INTO contacts (org_id, email, status)
      VALUES (${orgId}, ${`fc-${randomUUID().slice(0, 8)}@test.local`}, 'active')
      RETURNING id
    `;
    contactId = c!.id;

    const [camp] = await sql<{ id: string }[]>`
      INSERT INTO campaigns (org_id, name, subject, from_email, status)
      VALUES (${orgId}, 'fail-closed probe', 'Probe', 'demo@acme.test', 'sending')
      RETURNING id
    `;
    campaignId = camp!.id;

    // Imported after API_URL is set — batch-sender binds it at module load.
    const mod = await import('../jobs/batch-sender.js');
    processBatchSender = mod.processBatchSender as unknown as typeof processBatchSender;
    mtaQueues = (await import('../queues/index.js')).mtaQueues;
  }, 60_000);

  afterAll(async () => {
    if (ORIGINAL_API_URL === undefined) delete process.env.API_URL;
    else process.env.API_URL = ORIGINAL_API_URL;
    await new Promise<void>((r) => server.close(() => r()));
    await sql`DELETE FROM campaigns WHERE id = ${campaignId}`;
    await sql`DELETE FROM contacts WHERE id = ${contactId}`;
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    overrides = {};
    await mtaQueues.other.obliterate({ force: true });
  });

  const job = () =>
    fakeJob({
      campaignId,
      orgId,
      batchIndex: 0,
      contactIds: [contactId],
      // `content` is the editor blob the renderer reads; a plain html string is
      // one of the shapes it accepts.
      content: {
        html: '<p>Hello {{contact.first_name}}</p><a href="{{unsubscribe_url}}">Unsubscribe</a>',
      },
      subject: 'Probe',
      fromName: 'Demo',
      fromEmail: 'demo@acme.test',
      priority: 5,
      stream: 'broadcast',
    });

  // ── a) transient failure on a protective route ───────────────────────────
  it('a) stops the batch on a 500 from a protective route, and queues nothing', async () => {
    overrides['/api/v1/internal/suppressions/check-batch'] = { status: 500 };

    await expect(processBatchSender(job())).rejects.toThrow(/suppressions\/check-batch/);
    expect(await queuedCount(), 'nothing may reach the MTA queue').toBe(0);
  }, 60_000);

  it('a2) names the org in the error, so the stopped batch is diagnosable', async () => {
    overrides['/api/v1/internal/frequency/check-batch'] = { status: 503 };

    await expect(processBatchSender(job())).rejects.toThrow(new RegExp(orgId));
    expect(await queuedCount()).toBe(0);
  }, 60_000);

  // ── b) permanent failure on a protective route ───────────────────────────
  it('b) stops the batch on a 403 from a protective route', async () => {
    overrides['/api/v1/internal/holdout/check-batch'] = { status: 403 };

    await expect(processBatchSender(job())).rejects.toThrow(/INTERNAL_API_SECRET/);
    expect(await queuedCount()).toBe(0);
  }, 60_000);

  it('b2) stops the batch on a 400, which no retry will fix', async () => {
    overrides['/api/v1/internal/consent/check-batch'] = { status: 400 };

    await expect(processBatchSender(job())).rejects.toThrow(/refuse it again/);
    expect(await queuedCount()).toBe(0);
  }, 60_000);

  // ── c) cosmetic route must NOT stop the batch ────────────────────────────
  it('c) sends anyway when a cosmetic route fails, using the fallback', async () => {
    // Newsletter tier names and the branded tracking domain are both cosmetic:
    // the mail is worse without them, but no rule is broken.
    overrides['/api/v1/internal/newsletter-tiers/batch'] = { status: 500 };
    overrides['/api/v1/internal/tracking-domain'] = { status: 500 };

    await expect(processBatchSender(job())).resolves.toBeDefined();
    expect(await queuedCount(), 'the mail must still go out').toBeGreaterThan(0);
  }, 60_000);

  // ── d) contacts could not be loaded ──────────────────────────────────────
  it('d) stops rather than reporting an empty batch as a success', async () => {
    // This one used to `console.error` and return [], which the job then
    // reported as a completed batch with zero recipients.
    overrides['/api/v1/internal/contacts/batch'] = { status: 500 };

    await expect(processBatchSender(job())).rejects.toThrow(/contacts\/batch/);
    expect(await queuedCount()).toBe(0);
  }, 60_000);

  // ── e) the fail-closed filter stays fail-closed ──────────────────────────
  it('e) sends without tracking when the opt-in lookup fails under strict mode', async () => {
    // Strict mode on, so the opt-in list decides who may be tracked. Its
    // failure must not stop the send — it must send with tracking off, which
    // is what "fail-closed" means for this one filter.
    overrides['/api/v1/internal/org/tracking-strict'] = {
      status: 200,
      body: { data: { strict: true } },
    };
    overrides['/api/v1/internal/consent/opted-in-batch'] = { status: 500 };

    await expect(processBatchSender(job())).resolves.toBeDefined();
    expect(await queuedCount(), 'the mail goes out, just untracked').toBeGreaterThan(0);
  }, 60_000);

  // ── the happy path still works ───────────────────────────────────────────
  it('queues the send when every filter answers', async () => {
    await expect(processBatchSender(job())).resolves.toBeDefined();
    expect(await queuedCount()).toBeGreaterThan(0);
  }, 60_000);
});
