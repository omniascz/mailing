/**
 * Seven routes behind FEATURE_BEYOND_CORE that authenticate nobody.
 *
 * They are harmless today only because index.ts does not register them in
 * production. The flag is a deployment switch, not a security boundary, and the
 * plan is to turn it on — so each of these is a hole with a date on it.
 *
 * Every case here is written the same way, and the shape is the point:
 *
 *   1. the request WITHOUT credentials is refused, and
 *   2. the same request WITH credentials still does its job.
 *
 * The second assertion is not padding. #86 closed six webhook receivers by
 * making a missing secret a refusal, and the thing that made that a fix rather
 * than an outage was proving the signed path still went through. A guard that
 * refuses everyone is not a guard, it is a deletion — and it looks identical in
 * a test that only checks the 401.
 *
 * Cross-tenant reads and writes are asserted from both sides (org A must not
 * see B, org B must not see A), the way #50 and #52 do it: a one-directional
 * check passes against a handler that simply returns nothing.
 *
 * Everything runs against the real Postgres the rest of this directory uses.
 * No route is mocked; requests go through buildApp() with the auth plugin, the
 * rate limiter and the internal-auth hook all in place.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash, createHmac } from 'node:crypto';
import { eq, inArray, and } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  organizations,
  contacts,
  apiKeys,
  aiAgents,
  ctas,
  ctaImpressions,
  helpdeskTickets,
} from '../db/schema/index.js';
import { cdpSources } from '../db/schema/cdp-sources.js';

let app: FastifyInstance;

const tag = randomUUID().slice(0, 8);

/** Two unrelated tenants. Nothing owned by A may ever be visible to B. */
interface Tenant {
  orgId: string;
  contactId: string;
  /** Secret key — passes app.authenticate. */
  secretKey: string;
  /** Publishable key — passes app.authenticatePublic only. */
  publicKey: string;
}
let orgA: Tenant;
let orgB: Tenant;

const orgIds: string[] = [];

/** The API key store holds sha256(key); the raw value is never persisted. */
async function issueKey(orgId: string, isPublic: boolean): Promise<string> {
  const raw = `${isPublic ? 'fm_pub_' : 'fm_live_'}${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId,
    name: `guards ${tag} ${isPublic ? 'pub' : 'secret'}`,
    keyHash: createHash('sha256').update(raw).digest('hex'),
    keyPrefix: raw.slice(0, 12),
    // Empty scope list = unscoped key. The global scope hook in plugins/auth.ts
    // treats that as full access, so these tests measure the route's own guard
    // rather than the scope map's opinion of it.
    scopes: [],
    isPublic,
  });
  return raw;
}

async function makeTenant(label: string): Promise<Tenant> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `guards ${label} ${tag}`, slug: `guards-${label}-${tag}` })
    .returning({ id: organizations.id });
  orgIds.push(org!.id);
  const [c] = await db
    .insert(contacts)
    .values({ orgId: org!.id, email: `guards-${label}-${tag}@test.local`, status: 'active' })
    .returning({ id: contacts.id });
  return {
    orgId: org!.id,
    contactId: c!.id,
    secretKey: await issueKey(org!.id, false),
    publicKey: await issueKey(org!.id, true),
  };
}

/**
 * A distinct source address per request.
 *
 * The limiter is 100/min keyed on `x-api-key ?? ip`, and this file deliberately
 * sends the SAME key many times (that is what it is testing). Spreading the
 * calls over addresses is not enough on its own for keyed requests, so the
 * counts here stay well under the limit; the address still separates the
 * unauthenticated calls, which key on the ip.
 */
let addr = 0;
function nextAddress(): string {
  addr = (addr % 250) + 1;
  return `198.51.100.${addr}`;
}

interface InjectOpts {
  method?: 'GET' | 'POST';
  url: string;
  payload?: unknown;
  headers?: Record<string, string>;
}

function call(opts: InjectOpts) {
  return app.inject({
    method: opts.method ?? 'POST',
    url: opts.url,
    payload: opts.payload as never,
    headers: opts.headers,
    remoteAddress: nextAddress(),
  });
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  orgA = await makeTenant('a');
  orgB = await makeTenant('b');
}, 60_000);

afterAll(async () => {
  if (orgIds.length > 0) {
    // organizations cascade to contacts, api_keys, ctas, ai_agents,
    // cdp_sources, helpdesk_tickets and cta_impressions.
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

// ─── 1. CDP push webhook — HMAC, fail-closed ────────────────────────────────

describe('POST /api/v1/cdp/sources/:id/webhook', () => {
  /** Body the attacker would send: one contact, into someone else's org. */
  const injected = (email: string) => ({
    contacts: [{ externalId: `ext-${tag}`, email, firstName: 'Injected' }],
  });

  async function makePushSource(orgId: string, secret: string | null): Promise<string> {
    const [row] = await db
      .insert(cdpSources)
      .values({
        orgId,
        name: `push ${tag} ${randomUUID().slice(0, 6)}`,
        kind: 'webhook',
        direction: 'push',
        config: secret === null ? {} : { webhookSecret: secret },
      })
      .returning({ id: cdpSources.id });
    return row!.id;
  }

  function sign(secret: string, body: string): string {
    return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  }

  it('refuses an unsigned request, and writes no contact', async () => {
    const secret = `s3cr3t-${tag}`;
    const sourceId = await makePushSource(orgA.orgId, secret);
    const email = `unsigned-${tag}@evil.test`;

    const res = await call({
      url: `/api/v1/cdp/sources/${sourceId}/webhook`,
      payload: injected(email),
    });

    expect(res.statusCode, res.body).toBe(401);
    expect(res.json().code).toBe('INVALID_SIGNATURE');

    // The assertion that matters: nothing landed. Before the fix this request
    // returned 200 { received: 1 } and inserted the row.
    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgA.orgId), eq(contacts.email, email)));
    expect(rows, 'an unsigned webhook must not create a contact').toHaveLength(0);
  });

  it('refuses a request signed with the wrong secret', async () => {
    const sourceId = await makePushSource(orgA.orgId, `right-${tag}`);
    const body = JSON.stringify(injected(`wrongsig-${tag}@evil.test`));

    const res = await call({
      url: `/api/v1/cdp/sources/${sourceId}/webhook`,
      payload: body,
      headers: {
        'content-type': 'application/json',
        'x-forgemsg-signature': sign(`wrong-${tag}`, body),
      },
    });

    expect(res.statusCode, res.body).toBe(401);
    expect(res.json().code).toBe('INVALID_SIGNATURE');
  });

  it('refuses when the source has no secret configured — and says which it is', async () => {
    const sourceId = await makePushSource(orgA.orgId, null);
    const body = JSON.stringify(injected(`nosecret-${tag}@evil.test`));

    const res = await call({
      url: `/api/v1/cdp/sources/${sourceId}/webhook`,
      payload: body,
      headers: { 'content-type': 'application/json', 'x-forgemsg-signature': sign('any', body) },
    });

    expect(res.statusCode, res.body).toBe(401);
    // A different code from a bad signature on purpose: this one is the
    // operator's problem, not the sender's.
    expect(res.json().code).toBe('WEBHOOK_SECRET_NOT_CONFIGURED');
  });

  it('accepts a correctly signed request and ingests the batch', async () => {
    const secret = `s3cr3t-${tag}`;
    const sourceId = await makePushSource(orgA.orgId, secret);
    const email = `signed-${tag}@partner.test`;
    const body = JSON.stringify(injected(email));

    const res = await call({
      url: `/api/v1/cdp/sources/${sourceId}/webhook`,
      payload: body,
      headers: {
        'content-type': 'application/json',
        'x-forgemsg-signature': sign(secret, body),
      },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data.received).toBe(1);

    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgA.orgId), eq(contacts.email, email)));
    expect(rows, 'a signed webhook must still ingest').toHaveLength(1);
  });

  it('accepts the sha256= prefixed form too', async () => {
    const secret = `s3cr3t-${tag}`;
    const sourceId = await makePushSource(orgA.orgId, secret);
    const email = `prefixed-${tag}@partner.test`;
    const body = JSON.stringify(injected(email));

    const res = await call({
      url: `/api/v1/cdp/sources/${sourceId}/webhook`,
      payload: body,
      headers: {
        'content-type': 'application/json',
        'x-forgemsg-signature': `sha256=${sign(secret, body)}`,
      },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data.received).toBe(1);
  });

  it("org B's secret does not open org A's source", async () => {
    const sourceA = await makePushSource(orgA.orgId, `secret-a-${tag}`);
    await makePushSource(orgB.orgId, `secret-b-${tag}`);
    const email = `crossorg-${tag}@evil.test`;
    const body = JSON.stringify(injected(email));

    const res = await call({
      url: `/api/v1/cdp/sources/${sourceA}/webhook`,
      payload: body,
      headers: {
        'content-type': 'application/json',
        'x-forgemsg-signature': sign(`secret-b-${tag}`, body),
      },
    });

    expect(res.statusCode, res.body).toBe(401);
    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgA.orgId), eq(contacts.email, email)));
    expect(rows).toHaveLength(0);
  });
});

// ─── 2. ai-agents — auth, and orgId from the verified identity ──────────────

describe('ai-agents routes', () => {
  async function seedAgent(orgId: string, name: string): Promise<string> {
    const [row] = await db
      .insert(aiAgents)
      .values({ orgId, name, agentType: 'custom', goal: 'guard test' })
      .returning({ id: aiAgents.id });
    return row!.id;
  }

  const anonymous = [
    { method: 'GET' as const, url: '/api/v1/ai-agents' },
    { method: 'GET' as const, url: `/api/v1/ai-agents/${randomUUID()}` },
    { method: 'GET' as const, url: `/api/v1/ai-agents/${randomUUID()}/runs` },
    { method: 'POST' as const, url: `/api/v1/ai-agents/${randomUUID()}/run`, payload: {} },
    {
      method: 'POST' as const,
      url: '/api/v1/ai-agents',
      payload: { name: `x-${tag}`, agentType: 'custom', goal: 'g' },
    },
    {
      method: 'POST' as const,
      url: '/api/v1/ai-agents/build-campaign',
      payload: { goal: 'sell more widgets to people', audienceDescription: 'everyone' },
    },
  ];

  it.each(anonymous)('refuses $method $url without a session', async (c) => {
    const res = await call(c);
    // 401, not 500. Before the fix the three GETs answered 500 UNDEFINED_VALUE
    // — Drizzle binding `undefined` for org_id — which is why they sat in
    // route-smoke/known-failures.ts. The undefined and the missing guard were
    // the same defect seen from two sides.
    expect(res.statusCode, `${c.method} ${c.url} -> ${res.body}`).toBe(401);
  });

  it('no route in this file 500s on an anonymous call', async () => {
    for (const c of anonymous) {
      const res = await call(c);
      expect(res.statusCode, `${c.url} answered ${res.statusCode}: ${res.body}`).toBeLessThan(500);
    }
  });

  it('lists the agents of the calling org, with the org taken from the key', async () => {
    const idA = await seedAgent(orgA.orgId, `agent-a-${tag}`);
    const idB = await seedAgent(orgB.orgId, `agent-b-${tag}`);

    const res = await call({
      method: 'GET',
      url: '/api/v1/ai-agents',
      headers: { 'x-api-key': orgA.secretKey },
    });
    expect(res.statusCode, res.body).toBe(200);

    const ids = (res.json().data as { id: string }[]).map((a) => a.id);
    expect(ids, 'org A must see its own agent').toContain(idA);
    expect(ids, "org A must not see org B's agent").not.toContain(idB);
  });

  it('the isolation holds in the other direction too', async () => {
    const idA = await seedAgent(orgA.orgId, `agent-a2-${tag}`);
    const idB = await seedAgent(orgB.orgId, `agent-b2-${tag}`);

    const res = await call({
      method: 'GET',
      url: '/api/v1/ai-agents',
      headers: { 'x-api-key': orgB.secretKey },
    });
    expect(res.statusCode, res.body).toBe(200);

    const ids = (res.json().data as { id: string }[]).map((a) => a.id);
    expect(ids).toContain(idB);
    expect(ids).not.toContain(idA);
  });

  it("GET /:id answers 404 for another org's agent, not that agent", async () => {
    const idB = await seedAgent(orgB.orgId, `agent-b3-${tag}`);
    const res = await call({
      method: 'GET',
      url: `/api/v1/ai-agents/${idB}`,
      headers: { 'x-api-key': orgA.secretKey },
    });
    expect(res.statusCode, res.body).toBe(404);
  });

  it('GET /:id/runs is org-scoped and answers 200 for an own agent', async () => {
    const idA = await seedAgent(orgA.orgId, `agent-a4-${tag}`);
    const res = await call({
      method: 'GET',
      url: `/api/v1/ai-agents/${idA}/runs`,
      headers: { 'x-api-key': orgA.secretKey },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });

  it('POST creates the agent under the key’s org, never a null one', async () => {
    const name = `created-${tag}`;
    const res = await call({
      method: 'POST',
      url: '/api/v1/ai-agents',
      payload: { name, agentType: 'custom', goal: 'created through the guard' },
      headers: { 'x-api-key': orgA.secretKey },
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().data.orgId).toBe(orgA.orgId);

    const rows = await db.select().from(aiAgents).where(eq(aiAgents.name, name));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.orgId, 'the row must carry the caller’s org').toBe(orgA.orgId);
  });
});

// ─── 3. helpdesk CSAT ───────────────────────────────────────────────────────

describe('POST /api/v1/helpdesk/tickets/:id/csat', () => {
  async function seedTicket(orgId: string): Promise<string> {
    const [row] = await db
      .insert(helpdeskTickets)
      .values({ orgId, subject: `csat ${tag}`, status: 'open' })
      .returning({ id: helpdeskTickets.id });
    return row!.id;
  }

  async function csatOf(ticketId: string): Promise<unknown> {
    const [row] = await db
      .select({ meta: helpdeskTickets.channelMetadata })
      .from(helpdeskTickets)
      .where(eq(helpdeskTickets.id, ticketId));
    return (row?.meta as Record<string, unknown> | null)?.csat_score;
  }

  it('refuses an anonymous score and writes nothing', async () => {
    const ticket = await seedTicket(orgA.orgId);

    const res = await call({
      url: `/api/v1/helpdesk/tickets/${ticket}/csat`,
      payload: { score: 1, orgId: orgA.orgId },
    });

    expect(res.statusCode, res.body).toBe(401);
    expect(await csatOf(ticket), 'no score may be written without a session').toBeUndefined();
  });

  it('an authenticated agent can score their own ticket', async () => {
    const ticket = await seedTicket(orgA.orgId);

    const res = await call({
      url: `/api/v1/helpdesk/tickets/${ticket}/csat`,
      payload: { score: 5 },
      headers: { 'x-api-key': orgA.secretKey },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(await csatOf(ticket)).toBe(5);
  });

  it("org B cannot score org A's ticket even with a valid key of its own", async () => {
    const ticket = await seedTicket(orgA.orgId);

    const res = await call({
      url: `/api/v1/helpdesk/tickets/${ticket}/csat`,
      payload: { score: 1, orgId: orgA.orgId },
      headers: { 'x-api-key': orgB.secretKey },
    });

    // recordCsat scopes its UPDATE by org, so the write matches no row. The
    // route reports success because nothing failed; what matters is that org
    // A's ticket is untouched — the body's orgId claim is now ignored.
    expect(res.statusCode).toBe(200);
    expect(await csatOf(ticket), "org B must not reach org A's ticket").toBeUndefined();
  });
});

// ─── 4. AI recommendations ──────────────────────────────────────────────────

describe('POST /api/v1/ai/recommend', () => {
  it('refuses an anonymous call before it can reach the Claude API', async () => {
    const res = await call({
      url: '/api/v1/ai/recommend',
      payload: { currentPage: '/campaigns' },
    });
    expect(res.statusCode, res.body).toBe(401);
  });

  it('a publishable key is not enough to spend an org’s AI quota', async () => {
    const res = await call({
      url: '/api/v1/ai/recommend',
      payload: { currentPage: '/campaigns' },
      headers: { 'x-api-key': orgA.publicKey },
    });
    // app.authenticate refuses public keys explicitly (403), which is the
    // property that makes an embedded fm_pub_ key safe on a customer's page.
    expect(res.statusCode, res.body).toBe(403);
  });

  it('a secret key gets past the guard', async () => {
    const res = await call({
      url: '/api/v1/ai/recommend',
      payload: { currentPage: '/campaigns' },
      headers: { 'x-api-key': orgA.secretKey },
    });
    // No ANTHROPIC_API_KEY in the test environment, so the call fails INSIDE
    // the handler. That is the assertion: it is no longer refused at the door.
    // Anything but 401/403 proves the guard let an authenticated caller in.
    expect([401, 403], `guard refused a valid key: ${res.body}`).not.toContain(res.statusCode);
  });
});

// ─── 5. CTA serve / click / dismiss ─────────────────────────────────────────

describe('CTA browser endpoints', () => {
  async function seedCta(orgId: string, name: string): Promise<string> {
    const [row] = await db
      .insert(ctas)
      .values({ orgId, name, type: 'button', content: { ctaText: 'Buy' }, active: true })
      .returning({ id: ctas.id });
    return row!.id;
  }

  async function impressionsFor(ctaId: string): Promise<number> {
    const rows = await db
      .select({ id: ctaImpressions.id })
      .from(ctaImpressions)
      .where(eq(ctaImpressions.ctaId, ctaId));
    return rows.length;
  }

  /**
   * Clicks only. `serveCtas` writes an impression row of its own for every CTA
   * it returns, so a serve followed by a click leaves two rows and counting all
   * of them would measure the wrong thing.
   */
  async function clicksFor(ctaId: string): Promise<number> {
    const rows = await db
      .select({ id: ctaImpressions.id })
      .from(ctaImpressions)
      .where(and(eq(ctaImpressions.ctaId, ctaId), eq(ctaImpressions.clicked, true)));
    return rows.length;
  }

  it('refuses /serve without a key, so targeting rules stay unreadable', async () => {
    const res = await call({
      url: '/api/v1/ctas/serve',
      payload: { orgId: orgA.orgId, context: {} },
    });
    expect(res.statusCode, res.body).toBe(401);
  });

  it('refuses /click and /dismiss without a key, and records nothing', async () => {
    const ctaId = await seedCta(orgA.orgId, `cta-anon-${tag}`);

    const click = await call({
      url: `/api/v1/ctas/${ctaId}/click`,
      payload: { orgId: orgA.orgId },
    });
    const dismiss = await call({
      url: `/api/v1/ctas/${ctaId}/dismiss`,
      payload: { orgId: orgA.orgId },
    });

    expect(click.statusCode, click.body).toBe(401);
    expect(dismiss.statusCode, dismiss.body).toBe(401);
    expect(await impressionsFor(ctaId), 'no impression row may be written').toBe(0);
  });

  it('the publishable key the web-sdk embeds still serves and still tracks', async () => {
    const ctaId = await seedCta(orgA.orgId, `cta-pub-${tag}`);

    const served = await call({
      url: '/api/v1/ctas/serve',
      payload: { context: {} },
      headers: { 'x-api-key': orgA.publicKey },
    });
    expect(served.statusCode, served.body).toBe(200);
    expect((served.json().data as { ctaId: string }[]).map((c) => c.ctaId)).toContain(ctaId);

    const click = await call({
      url: `/api/v1/ctas/${ctaId}/click`,
      payload: { visitorId: `v-${tag}` },
      headers: { 'x-api-key': orgA.publicKey },
    });
    expect(click.statusCode, click.body).toBe(204);
    expect(await clicksFor(ctaId), 'the click must be recorded').toBe(1);
  });

  it("org B's key serves org B's CTAs, not org A's", async () => {
    const ctaA = await seedCta(orgA.orgId, `cta-iso-a-${tag}`);
    const ctaB = await seedCta(orgB.orgId, `cta-iso-b-${tag}`);

    const asB = await call({
      url: '/api/v1/ctas/serve',
      payload: { context: {} },
      headers: { 'x-api-key': orgB.publicKey },
    });
    expect(asB.statusCode, asB.body).toBe(200);
    const idsB = (asB.json().data as { ctaId: string }[]).map((c) => c.ctaId);
    expect(idsB).toContain(ctaB);
    expect(idsB, "org B must not be served org A's CTA").not.toContain(ctaA);

    const asA = await call({
      url: '/api/v1/ctas/serve',
      payload: { context: {} },
      headers: { 'x-api-key': orgA.publicKey },
    });
    const idsA = (asA.json().data as { ctaId: string }[]).map((c) => c.ctaId);
    expect(idsA).toContain(ctaA);
    expect(idsA).not.toContain(ctaB);
  });

  it("a click sent with org B's key cannot land on org A's CTA", async () => {
    const ctaA = await seedCta(orgA.orgId, `cta-cross-${tag}`);

    const res = await call({
      url: `/api/v1/ctas/${ctaA}/click`,
      // The old body carried orgId; sending it now proves it is ignored.
      payload: { orgId: orgA.orgId, visitorId: `v2-${tag}` },
      headers: { 'x-api-key': orgB.publicKey },
    });
    expect(res.statusCode).toBe(204);

    // The impression is attributed to B, so A's statistics are untouched.
    const rows = await db
      .select({ orgId: ctaImpressions.orgId })
      .from(ctaImpressions)
      .where(eq(ctaImpressions.ctaId, ctaA));
    expect(rows.every((r) => r.orgId === orgB.orgId)).toBe(true);
    expect(
      rows.some((r) => r.orgId === orgA.orgId),
      "the body's orgId claim must not attribute a click to org A",
    ).toBe(false);
  });
});
