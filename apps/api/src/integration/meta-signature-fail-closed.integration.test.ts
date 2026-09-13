/**
 * A missing app secret means NOT VERIFIED, not "verified".
 *
 *     if (!appSecret) return true; // not configured (dev) — open
 *
 * That line (lib/meta-signature.ts:19) is the last live copy of a shape this
 * repository has already removed four times — `lib/webhook-switches.ts:5-9`
 * says so in as many words. It turns the absence of configuration into a pass:
 * a deployment that has not set META_APP_SECRET, or one where the variable is
 * dropped on a redeploy, accepts a forged lead from anyone who knows the URL.
 *
 * The escape hatch stays, but it has to be asked for. `unsignedWebhooksAllowed()`
 * is the switch that already exists for exactly this, and it is unreachable in
 * production by construction (`webhook-switches.ts:35` checks NODE_ENV first
 * and the flag cannot override it).
 *
 * ─── The vehicle ─────────────────────────────────────────────────────────────
 *
 * The Facebook lead-ads webhook is used here as a caller, not as a subject:
 * nothing about that route changes in this round. It is the one caller of
 * verifyMetaRequest whose success is observable in the database — an accepted
 * payload becomes a contact row — so "the signature check let it through" and
 * "nothing was written" can both be asserted on rows rather than on a status
 * code alone.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * A 401 with an empty table is also what an unregistered route, a rejected
 * page id, or a handler that does nothing look like. So the first case is
 * followed by two that must still write: a correctly signed request, and an
 * unsigned one with the dev flag on. If the fix had simply broken the endpoint,
 * those two would fail.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { organizations, contacts, adAccounts } from '../db/schema/index.js';

const tag = randomUUID().slice(0, 8);
const APP_SECRET = `itest-meta-secret-${tag}`;

/** One address per case, so no assertion can be satisfied by another's row. */
const EMAIL_UNSIGNED = `sig-unsigned-${tag}@example.invalid`;
const EMAIL_SIGNED = `sig-signed-${tag}@example.invalid`;
const EMAIL_DEVFLAG = `sig-devflag-${tag}@example.invalid`;
const EMAIL_FORGED = `sig-forged-${tag}@example.invalid`;

const PAGE = `8100${tag}`;

let app: FastifyInstance;
let orgId: string;

const contactsFor = async (email: string) =>
  db
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.email, email)));

const leadNotification = (email: string) => ({
  object: 'page',
  entry: [
    {
      id: PAGE,
      time: Math.floor(Date.now() / 1000),
      changes: [
        {
          field: 'leadgen',
          value: {
            leadgen_id: `lead-${tag}`,
            page_id: PAGE,
            form_id: `form-${tag}`,
            created_time: Math.floor(Date.now() / 1000),
            field_data: [
              { name: 'email', values: [email] },
              { name: 'first_name', values: ['Ada'] },
            ],
          },
        },
      ],
    },
  ],
});

/** `sign` is the secret to sign with, or undefined to send no signature. */
const post = async (email: string, sign?: string) => {
  const payload = JSON.stringify(leadNotification(email));
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (sign !== undefined) {
    headers['x-hub-signature-256'] =
      `sha256=${createHmac('sha256', sign).update(payload).digest('hex')}`;
  }
  return app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/ads/facebook/leads',
    headers,
    payload,
  });
};

const prev = {
  enable: process.env.ENABLE_META_LEAD_ADS_WEBHOOK,
  meta: process.env.META_APP_SECRET,
  facebook: process.env.FACEBOOK_APP_SECRET,
  unsigned: process.env.ALLOW_UNSIGNED_WEBHOOKS,
};

/** The secret is read per request, so each case sets the world it needs. */
function configure(opts: { secret?: string; allowUnsigned?: boolean }): void {
  if (opts.secret === undefined) {
    delete process.env.META_APP_SECRET;
    delete process.env.FACEBOOK_APP_SECRET;
  } else {
    process.env.META_APP_SECRET = opts.secret;
  }
  if (opts.allowUnsigned) process.env.ALLOW_UNSIGNED_WEBHOOKS = 'true';
  else delete process.env.ALLOW_UNSIGNED_WEBHOOKS;
}

beforeAll(async () => {
  // Registration needs the flag AND a secret (webhook-switches.ts:52). Both are
  // set for the boot; the cases below then change what the handler sees at
  // request time, which is the situation this is about — a deployment that
  // loses the variable, or never had it.
  process.env.ENABLE_META_LEAD_ADS_WEBHOOK = 'true';
  process.env.META_APP_SECRET = APP_SECRET;
  delete process.env.ALLOW_UNSIGNED_WEBHOOKS;

  const { createTestApp } = await import('./setup/harness.js');
  app = await createTestApp();
  await app.ready();

  const [org] = await db
    .insert(organizations)
    .values({ name: 'meta signature', slug: `sig-${tag}` })
    .returning({ id: organizations.id });
  orgId = org!.id;

  await db.insert(adAccounts).values({
    orgId,
    platform: 'facebook_ads',
    platformAccountId: PAGE,
    accountName: `facebook ${PAGE}`,
    accessToken: `token-${PAGE}`,
    active: true,
  });
}, 120_000);

beforeEach(() => {
  configure({ secret: APP_SECRET });
});

afterAll(async () => {
  for (const email of [EMAIL_UNSIGNED, EMAIL_SIGNED, EMAIL_DEVFLAG, EMAIL_FORGED]) {
    await db.delete(contacts).where(eq(contacts.email, email));
  }
  if (orgId) {
    await db.delete(adAccounts).where(eq(adAccounts.orgId, orgId));
    await db.delete(contacts).where(eq(contacts.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  for (const [k, v] of Object.entries({
    ENABLE_META_LEAD_ADS_WEBHOOK: prev.enable,
    META_APP_SECRET: prev.meta,
    FACEBOOK_APP_SECRET: prev.facebook,
    ALLOW_UNSIGNED_WEBHOOKS: prev.unsigned,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await app?.close();
}, 120_000);

describe('an unconfigured app secret does not verify anything', () => {
  it('an unsigned request with no secret configured is refused and writes nothing', async () => {
    configure({ secret: undefined });

    const res = await post(EMAIL_UNSIGNED);
    expect(res.statusCode, `body: ${res.body}`).toBe(401);

    expect(
      await contactsFor(EMAIL_UNSIGNED),
      'a forged lead became a contact because the secret was missing',
    ).toHaveLength(0);
  });

  it('a forged signature with no secret configured is refused too', async () => {
    // The same hole from the other side: the attacker may send a signature; it
    // is the missing secret, not the missing header, that used to open it.
    configure({ secret: undefined });

    const res = await post(EMAIL_FORGED, 'not-the-app-secret');
    expect(res.statusCode, `body: ${res.body}`).toBe(401);
    expect(await contactsFor(EMAIL_FORGED)).toHaveLength(0);
  });

  it('a correctly signed request is still accepted and still writes', async () => {
    // Negative control, and the evidence that these cases reach the write at
    // all: without it, every assertion above would also hold for an endpoint
    // that had simply stopped working.
    const res = await post(EMAIL_SIGNED, APP_SECRET);
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    const rows = await contactsFor(EMAIL_SIGNED);
    expect(rows, 'the handler never reached the contact upsert').toHaveLength(1);
    expect(rows[0]!.orgId).toBe(orgId);
    expect(rows[0]!.source).toBe('facebook_lead_ads');
  });

  it('the dev escape hatch still opens it, but only when asked for', async () => {
    // ALLOW_UNSIGNED_WEBHOOKS is the switch that already exists for this, and
    // it is unreachable in production (webhook-switches.ts:35 checks NODE_ENV
    // first). Asking for it is the difference; a missing secret is not.
    configure({ secret: undefined, allowUnsigned: true });

    const res = await post(EMAIL_DEVFLAG);
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    const rows = await contactsFor(EMAIL_DEVFLAG);
    expect(rows, 'the escape hatch did not let the request through').toHaveLength(1);
    expect(rows[0]!.orgId).toBe(orgId);
  });
});
