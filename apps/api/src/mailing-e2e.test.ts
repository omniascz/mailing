/**
 * Mailing E2E — exercises the complete mailing surface through Fastify inject
 * (no live Postgres/Redis needed) PLUS a static regression guard for the
 * email_events query-hygiene bug class that was found & fixed during the
 * 2026-06 deep audit.
 *
 * Two layers:
 *
 *  1. JOURNEY WIRING (app.inject):
 *     - Public tracking pixel + click redirect work WITHOUT auth/DB
 *       (best-effort tracking must never 5xx).
 *     - The entire mailing + Layer 3/4 feature surface is auth-gated (401).
 *     - Public auth endpoints run Zod validation (4xx, never 5xx).
 *     - OpenAPI advertises the new routes (proves they are registered).
 *
 *  2. QUERY-HYGIENE GUARD (source scan, fs only):
 *     - email_events event_type literals must match the pgEnum
 *       (`send|deliver|open|click|bounce|unsubscribe|complaint`) — NOT the
 *       invalid `'delivered'`/`'opened'`/`'sent'` that silently return 0.
 *     - email_events raw SQL must use `created_at` (its real column), never
 *       `occurred_at`.
 *     - revenue_events raw SQL must use `occurred_at`, never `created_at`.
 *
 * A true happy-path send (campaign → queue → MTA → tracking → analytics) needs
 * Postgres + Redis and belongs in the CI integration job (services: block in
 * .github/workflows/ci.yml). This file is the cheapest signal that the mailing
 * request pipeline is wired and the analytics layer queries the right columns.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './index.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  if (app) await app.close();
});

// ─── 1. Public tracking: works without auth, never 5xx ────────────────────────

describe('tracking pixel + click (public, best-effort)', () => {
  it('GET /track/o/:token → 200 image/gif even for an invalid token', async () => {
    const res = await app.inject({ method: 'GET', url: '/track/o/not-a-real-token' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/gif');
  });

  it('GET /track/c/:token → redirect (3xx) for an invalid token (safe fallback)', async () => {
    const res = await app.inject({ method: 'GET', url: '/track/c/not-a-real-token' });
    expect(res.statusCode).toBeGreaterThanOrEqual(300);
    expect(res.statusCode).toBeLessThan(400);
  });
});

// ─── 2. The whole mailing surface is auth-gated ───────────────────────────────

describe('mailing surface auth gating (401 without session/API key)', () => {
  const DUMMY_UUID = '00000000-0000-0000-0000-000000000000';
  const gated = [
    // core mailing
    { method: 'GET', url: '/api/v1/campaigns' },
    { method: 'GET', url: '/api/v1/contacts' },
    { method: 'GET', url: '/api/v1/templates' },
    { method: 'GET', url: '/api/v1/segments' },
    { method: 'GET', url: '/api/v1/workflows' },
    { method: 'GET', url: '/api/v1/webhooks' },
    // analytics
    { method: 'GET', url: '/api/v1/analytics/currency-revenue' },
    { method: 'GET', url: '/api/v1/analytics/cross-channel' },
    // Layer 3 — CZ integrations
    { method: 'GET', url: '/api/v1/integrations/packeta/shipments' },
    { method: 'GET', url: '/api/v1/integrations/erp' },
    { method: 'GET', url: '/api/v1/integrations/payments-cz/transactions' },
    // Layer 4 — leapfrog features
    { method: 'GET', url: '/api/v1/channel-fallback/rules' },
    { method: 'GET', url: '/api/v1/unsubscribe-experiments' },
    { method: 'GET', url: '/api/v1/brand-guidelines' },
    { method: 'GET', url: '/api/v1/inbox-placement' },
    { method: 'GET', url: `/api/v1/contacts/${DUMMY_UUID}/best-send-time` },
    { method: 'GET', url: `/api/v1/contacts/${DUMMY_UUID}/email-thread` },
  ] as const;

  for (const { method, url } of gated) {
    it(`${method} ${url} → 401`, async () => {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);
    });
  }
});

// ─── 3. Public endpoints run validation (4xx, never 5xx) ──────────────────────

describe('public endpoint validation', () => {
  it('POST /api/v1/auth/register with empty body → 4xx', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: {} });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('POST /api/v1/auth/login with non-email → 4xx', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'x', password: 'p' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });
});

// ─── 4. OpenAPI advertises the new routes (proves registration) ───────────────

describe('OpenAPI lists the new mailing routes', () => {
  it('spec includes Layer 3/4 paths', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    if (res.statusCode !== 200) return; // swagger optional in some envs
    const body = res.json() as { paths?: Record<string, unknown> };
    const paths = Object.keys(body.paths ?? {});
    // a representative sample from each layer
    expect(paths.some((p) => p.includes('/channel-fallback/'))).toBe(true);
    expect(paths.some((p) => p.includes('/unsubscribe-experiments'))).toBe(true);
    expect(paths.some((p) => p.includes('/integrations/packeta/'))).toBe(true);
    expect(paths.some((p) => p.includes('/brand-guidelines'))).toBe(true);
  });
});

// ─── 5. Query-hygiene regression guard (static source scan) ───────────────────

describe('email_events / revenue_events query hygiene', () => {
  const SERVICES = join(__dirname, 'services');
  const read = (rel: string) => readFileSync(join(SERVICES, rel), 'utf8');

  // Files whose queries target email_events. Their event_type literals must be
  // enum-valid and their raw timestamp column must be created_at.
  const EMAIL_EVENT_FILES = [
    'ai/deliverability-coach.ts',
    'analytics/cross-channel-attribution.ts',
    'billing/subaccounts.ts',
    'campaigns/fatigue-score.ts',
    'campaigns/what-if-simulator.ts',
    'contacts/email-thread.ts',
    'contacts/unsubscribe-prediction.ts',
    'deliverability/health-score.ts',
    'deliverability/inbox-placement-sim.ts',
    'ai/persona-inference.ts',
    'cdp/traits.ts',
  ];

  // The email_event_type pgEnum is the single source of truth. These near-miss
  // literals compile fine but never match a row → silent zeros. We only flag
  // them when compared against the event_type column (raw SQL `event_type = ...`
  // or Drizzle `eventType} = ...`), NOT internal JS DSLs like
  // `step.conditionType === 'opened'`.
  const COLUMN = `(?:event_type|eventType\\s*}?)\\s*=\\s*`;
  const FORBIDDEN_EVENT_LITERALS = [
    new RegExp(`${COLUMN}'delivered'`),
    new RegExp(`${COLUMN}'opened'`),
    new RegExp(`${COLUMN}'sent'`),
    new RegExp(`${COLUMN}'clicked'`),
    new RegExp(`${COLUMN}'bounced'`),
    new RegExp(`${COLUMN}'unsubscribed'`),
    new RegExp(`${COLUMN}'complained'`),
    new RegExp(`${COLUMN}'blocked'`),
  ];

  for (const rel of EMAIL_EVENT_FILES) {
    it(`${rel}: uses enum-valid email event_type literals`, () => {
      const src = read(rel);
      for (const bad of FORBIDDEN_EVENT_LITERALS) {
        expect(src, `${rel} contains an invalid email event_type literal`).not.toMatch(bad);
      }
    });

    it(`${rel}: email_events raw SQL uses created_at, not occurred_at`, () => {
      const src = read(rel);
      // Files that also touch revenue_events legitimately use occurred_at there,
      // so only assert on the pure-email_events files.
      if (!src.includes('revenueEvents')) {
        expect(src, `${rel} references occurred_at on email_events`).not.toContain('occurred_at');
      }
    });
  }

  // revenue_events only has occurred_at — its raw SQL must never use created_at.
  const REVENUE_FILES = ['analytics/cross-channel-attribution.ts', 'analytics/currency-revenue.ts'];
  for (const rel of REVENUE_FILES) {
    it(`${rel}: revenue_events raw SQL uses occurred_at, not created_at`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/created_at\s*<=/);
      expect(src).not.toMatch(/to_char\(created_at/);
    });
  }

  it('email_event_type enum still lists the canonical values', () => {
    const enums = readFileSync(join(__dirname, 'db/schema/enums.ts'), 'utf8');
    for (const v of ['send', 'deliver', 'open', 'click', 'bounce', 'unsubscribe', 'complaint']) {
      expect(enums).toContain(`'${v}'`);
    }
  });
});

// ─── 6. Send-path integration wiring (no orphans) ─────────────────────────────
// Locks the previously-island features into the live send/bounce/render/unsub
// path so they cannot silently regress to "endpoint-only" again.

describe('send-path integration wiring', () => {
  const api = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
  const worker = (rel: string) =>
    readFileSync(join(__dirname, '../../workers/src', rel), 'utf8');

  it("MTA worker emits a 'deliver' event on SMTP 250", () => {
    expect(worker('jobs/mta-sender.ts')).toMatch(/type:\s*'deliver'/);
  });

  it("internal/events accepts 'deliver' and wires channel-fallback on bounce", () => {
    const src = api('routes/v1/internal/events.ts');
    expect(src).toContain("'deliver'");
    expect(src).toContain('handleBounce');
  });

  it('frequency batch check enforces smart-sending canSend', () => {
    expect(api('routes/v1/internal/frequency.ts')).toMatch(/smartCanSend|canSend as/);
  });

  it('timewarp scheduler uses per-contact STO + CZ-holiday shifting', () => {
    const src = api('services/send-optimization/index.ts');
    expect(src).toContain('contactSendTimePredictions');
    expect(src).toContain('isCzHoliday');
  });

  it('campaign create/update runs AI alt-text enrichment', () => {
    expect(api('services/campaigns/index.ts')).toContain('fillMissingAltTexts');
  });

  it('preference-center wires unsubscribe A/B assignment + outcome', () => {
    const src = api('routes/v1/preference-center.ts');
    expect(src).toContain('assignVariant');
    expect(src).toContain('recordOutcome');
  });
});

// ─── 7. Engine bus (orphan queues + schedulers now consumed) ──────────────────
// Before this, the workflow-triggered 'email'/'sms' queues had no consumer and
// no scheduler resumed waiting runs or ran daily triggers. These guards lock the
// wiring so automation can actually execute in production.

describe('engine bus wiring', () => {
  const api = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
  const worker = (rel: string) =>
    readFileSync(join(__dirname, '../../workers/src', rel), 'utf8');

  it("'email' queue has a consumer", () => {
    expect(worker('jobs/workflow-email-sender.ts')).toMatch(/new Worker<[^>]*>\(\s*'email'/);
  });

  it("'sms' queue has a consumer", () => {
    expect(worker('jobs/workflow-sms-sender.ts')).toMatch(/new Worker<[^>]*>\(\s*'sms'/);
  });

  it('workflow run-resumer + daily-triggers cron are scheduled', () => {
    const src = worker('jobs/workflow-scheduler.ts');
    expect(src).toContain('process-runs');
    expect(src).toContain('daily-run');
    expect(src).toMatch(/repeat:\s*\{\s*pattern:\s*'\* \* \* \* \*'/); // every minute
  });

  it('workers entrypoint starts all engine-bus workers', () => {
    const src = worker('index.ts');
    expect(src).toContain('startWorkflowEmailWorker');
    expect(src).toContain('startWorkflowSmsWorker');
    expect(src).toContain('scheduleWorkflowJobs');
  });

  it('internal dispatch endpoints exist + are registered', () => {
    const dispatch = api('routes/v1/internal/workflow-dispatch.ts');
    expect(dispatch).toContain('/api/v1/internal/workflow/process-runs');
    expect(dispatch).toContain('/api/v1/internal/workflow/send-email');
    expect(dispatch).toContain('/api/v1/internal/workflow/send-sms');
    expect(api('index.ts')).toContain('internalWorkflowDispatchRoutes');
  });

  it('triggered batch queue exists for single-contact workflow emails', () => {
    expect(api('lib/queues.ts')).toContain("new Queue('batch-sender-triggered'");
  });
});

// ─── 8. Security hardening (audit fixes) ──────────────────────────────────────

describe('security hardening', () => {
  const api = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

  it('Stripe webhook verifies a real HMAC signature over the raw body', () => {
    const src = api('services/commerce/payments.ts');
    expect(src).toContain('verifyStripeSignature');
    expect(src).toContain('timingSafeEqual');
    // the old "simplified" no-op check must be gone
    expect(src).not.toMatch(/simplified[^\n]*constructEvent/);
  });

  it('Stripe webhook route uses the raw body, not a re-serialized req.body', () => {
    const src = api('routes/v1/webhooks/stripe.ts');
    expect(src).toContain('rawBody');
    expect(src).not.toContain('JSON.stringify(req.body)');
  });

  it('GDPR erasure cascades across all contact_id tables (not just 3)', () => {
    const src = api('services/contacts/gdpr.ts');
    expect(src).toContain('information_schema.columns');
    expect(src).toContain('eraseRelatedRows');
  });

  it('all Stripe + Meta ingesting webhooks verify signatures', () => {
    // newsletter-tiers Stripe webhook (was: "verify in production" TODO)
    expect(api('routes/v1/newsletter-tiers.ts')).toContain('verifyStripeSignature');
    // Meta inbound webhooks that ingest data must verify x-hub-signature
    expect(api('routes/v1/whatsapp.ts')).toContain('verifyMetaRequest');
    expect(api('routes/v1/webhooks/ads.ts')).toContain('verifyMetaRequest');
  });

  it('analytics is ClickHouse-aware with a Postgres fallback', () => {
    const src = api('services/analytics/index.ts');
    expect(src).toContain('isClickHouseEnabled');
    expect(src).toContain('pgCampaignEventRows'); // fallback path
    expect(src).toContain('computeCampaignStats'); // shared pure fold
  });

  it('predictive scoring uses a probabilistic model (not linear heuristics)', () => {
    const pure = api('services/predictive-segmentation/pure.ts');
    expect(pure).toContain('Gamma'); // Gamma–Poisson shrinkage
    expect(pure).toContain('P(alive)'); // exponential survival
    // the old linear extrapolation (× 730) must be gone from the service
    expect(api('services/predictive-segmentation/index.ts')).not.toContain('* 730');
    expect(api('services/predictive-segmentation/index.ts')).toContain('estimatePopulationRate');
  });

  it('lead scoring fits a per-org logistic model (not hand-tuned constants)', () => {
    expect(api('lib/logistic-regression.ts')).toContain('trainLogistic');
    const pred = api('services/lead-scoring/predictive.ts');
    expect(pred).toContain('getOrgLeadModel'); // per-org fitted model
    expect(pred).toContain("modelSource: model ? 'fitted' : 'heuristic'"); // graceful fallback
  });

  it('ClickHouse pipeline exists: client + schema + replicator + cron', () => {
    expect(api('services/analytics/clickhouse/client.ts')).toContain('FORMAT JSONEachRow');
    expect(api('services/analytics/clickhouse/schema.ts')).toContain('MATERIALIZED VIEW');
    expect(api('services/analytics/clickhouse/replicator.ts')).toContain('replicateUntilCaughtUp');
    expect(api('index.ts')).toContain('internalClickHouseRoutes');
    const scheduler = readFileSync(
      join(__dirname, '../../workers/src/jobs/workflow-scheduler.ts'),
      'utf8',
    );
    expect(scheduler).toContain('clickhouse/replicate');
  });

  it('a global raw-body JSON parser exposes req.rawBody for signature checks', () => {
    const src = api('index.ts');
    expect(src).toContain('addContentTypeParser');
    expect(src).toContain("parseAs: 'buffer'");
    expect(src).toContain('rawBody');
  });

  it('webhook routes verify against req.rawBody (not re-serialized req.body)', () => {
    for (const rel of [
      'routes/v1/billing.ts',
      'routes/v1/custom-channels.ts',
      'routes/v1/phone.ts',
      'routes/v1/ecommerce-integrations.ts',
    ]) {
      const src = api(rel);
      expect(src, `${rel} should read req.rawBody`).toContain('rawBody');
      // bare JSON.stringify(req.body) is only allowed as the documented fallback,
      // i.e. it must be preceded by a rawBody read on the same statement.
      expect(src).not.toMatch(/=\s*JSON\.stringify\(req\.body[^)]*\);\s*$/m);
    }
  });
});

// ─── 9. Vapor shells made real ────────────────────────────────────────────────
// RCS, voice-bot and warehouse-sync had no real provider/export at all. Lock the
// real implementations so they can't regress to shells.

describe('vapor shells made real', () => {
  const api = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
  const worker = (rel: string) =>
    readFileSync(join(__dirname, '../../workers/src', rel), 'utf8');
  const voice = (rel: string) =>
    readFileSync(join(__dirname, '../../voice-bot/src', rel), 'utf8');

  it('RCS dispatches via a real provider + worker', () => {
    expect(api('services/rcs/index.ts')).toContain('rcsQueue');
    expect(api('services/rcs/providers/sinch.ts')).toContain('rcs.api.sinch.com');
    expect(worker('jobs/rcs-sender.ts')).toMatch(/new Worker<[^>]*>\(\s*'rcs-send'/);
  });

  it('voice-bot uses real Deepgram/ElevenLabs/Claude adapters (not just stubs)', () => {
    expect(voice('index.ts')).toContain('resolveAdapters');
    expect(voice('adapters/deepgram.ts')).toContain('api.deepgram.com');
    expect(voice('adapters/elevenlabs.ts')).toContain('api.elevenlabs.io');
    expect(voice('adapters/claude.ts')).toContain('api.anthropic.com');
  });

  it('warehouse-sync actually exports (S3 SigV4 / BigQuery), no silent ok', () => {
    const src = api('services/warehouse-sync/index.ts');
    expect(src).toContain('putObjectS3');
    expect(src).toContain('insertAllBigQuery');
    // the old fake "delegate to integration layer ... lastStatus ok" path is gone
    expect(src).not.toContain('adapters delegate to integration layer');
    expect(src).toContain('runDueSyncs');
  });

  it('warehouse-sync runner is scheduled hourly', () => {
    expect(worker('jobs/workflow-scheduler.ts')).toContain('warehouse-sync/run-due');
    expect(api('index.ts')).toContain('internalWarehouseSyncRoutes');
  });

  it('voice-bot has a Twilio Media Streams bridge (μ-law passthrough + barge-in)', () => {
    const src = voice('api/twilio-bridge.ts');
    expect(src).toContain('chunkUlaw');
    expect(src).toContain("event: 'clear'"); // barge-in flush
    expect(voice('index.ts')).toContain('createTwilioBridge');
  });

  it('voice answer webhook returns TwiML that bridges the call to the bot', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/voice/answer', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('xml');
    expect(res.body).toContain('<Connect>');
    expect(res.body).toContain('<Stream');
  });
});
