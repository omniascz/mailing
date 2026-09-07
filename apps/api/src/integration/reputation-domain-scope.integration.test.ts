/**
 * Sender reputation, scoped to the domains an organisation actually sends from.
 *
 * `fetchAllReputation` and the four provider adapters took a bare domain and
 * trusted whoever passed it. Both routes passed one straight off the query
 * string. That is #123's shape exactly — a check split across layers, where the
 * layer holding the data does not enforce it and the next caller reassembles
 * the hole — and it survives precisely as long as nobody adds a third caller.
 *
 * What is at stake is not our data. These adapters read public DNS and
 * third-party APIs, and the answer about someone else's domain is the answer
 * anyone could get. What is at stake is the SHARED CREDENTIAL: the keys are
 * account-wide, every provider rate-limits or bills per key, and the response
 * is cached under a key naming only the domain. One tenant could spend the
 * quota every tenant depends on, on domains none of them own.
 *
 * Asserted from both sides. "Refuse everything" passes half of this file on its
 * own, so each organisation must also succeed on its own domain.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations, apiKeys, sendingDomains } from '../db/schema/index.js';
import {
  assertDomainOwned,
  fetchAllReputation,
  fetchSenderScore,
} from '../services/deliverability/reputation.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];

let addr = 0;
const nextAddress = () => `198.51.100.${(addr = (addr % 200) + 1)}`;

interface Tenant {
  orgId: string;
  key: string;
  domain: string;
  mailSubdomain: string;
}
let A: Tenant;
let B: Tenant;

async function makeTenant(label: string): Promise<Tenant> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `rep ${label} ${tag}`, slug: `rep-${label}-${tag}` })
    .returning({ id: organizations.id });
  const orgId = org!.id;
  orgIds.push(orgId);

  const domain = `${label}-${tag}.test`;
  const mailSubdomain = `mail.${domain}`;
  await db.insert(sendingDomains).values({ orgId, domain, mailSubdomain });

  const raw = `fm_live_${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId,
    name: `rep scope ${tag}`,
    keyHash: createHash('sha256').update(raw).digest('hex'),
    keyPrefix: raw.slice(0, 12),
    scopes: [],
    isPublic: false,
  });

  return { orgId, key: raw, domain, mailSubdomain };
}

const get = (t: Tenant, url: string) =>
  app.inject({
    method: 'GET',
    url,
    headers: { 'x-api-key': t.key },
    remoteAddress: nextAddress(),
  });

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  A = await makeTenant('a');
  B = await makeTenant('b');
}, 90_000);

afterAll(async () => {
  await db.delete(apiKeys).where(eq(apiKeys.name, `rep scope ${tag}`));
  if (orgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

describe('assertDomainOwned', () => {
  it('accepts the org’s own domain', async () => {
    await expect(assertDomainOwned(A.orgId, A.domain)).resolves.toBeUndefined();
  });

  it('accepts the mail subdomain, which is what mail actually leaves from', async () => {
    await expect(assertDomainOwned(A.orgId, A.mailSubdomain)).resolves.toBeUndefined();
  });

  it('is case- and whitespace-insensitive, because a query string is neither', async () => {
    await expect(
      assertDomainOwned(A.orgId, `  ${A.domain.toUpperCase()}  `),
    ).resolves.toBeUndefined();
  });

  it('ISOLATION: refuses the other tenant’s domain, from both sides', async () => {
    await expect(assertDomainOwned(A.orgId, B.domain)).rejects.toMatchObject({ statusCode: 404 });
    await expect(assertDomainOwned(B.orgId, A.domain)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses a domain nobody has registered', async () => {
    await expect(assertDomainOwned(A.orgId, `unknown-${tag}.test`)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('NOT FOUND rather than FORBIDDEN — the refusal does not confirm the domain exists', async () => {
    const foreign = await assertDomainOwned(A.orgId, B.domain).catch((e) => e);
    const unknown = await assertDomainOwned(A.orgId, `unknown-${tag}.test`).catch((e) => e);
    expect(foreign.statusCode).toBe(unknown.statusCode);
    expect(foreign.code, 'a foreign domain is distinguishable from an unknown one').toBe(
      unknown.code,
    );
  });
});

describe('the service functions enforce it themselves', () => {
  it('fetchAllReputation refuses a foreign domain before it fans out', async () => {
    await expect(fetchAllReputation(A.orgId, B.domain)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('a single provider refuses it too — the check is not only on the aggregate', async () => {
    // The point of putting it inside each exported function rather than in one
    // wrapper: a future caller reaching for one provider does not reassemble
    // the hole.
    await expect(fetchSenderScore(A.orgId, B.domain)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('and returns an answer for the org’s own domain', async () => {
    const res = await fetchAllReputation(A.orgId, A.domain);
    expect(res.domain).toBe(A.domain);
    expect(res.providers).toHaveLength(4);
  });
});

describe('through the routes', () => {
  it('ISOLATION: the aggregate route answers 404 for the other tenant’s domain', async () => {
    const res = await get(A, `/api/v1/deliverability/reputation?domain=${B.domain}`);
    expect(res.statusCode, res.body).toBe(404);
    expect(
      res.body,
      'reputation data was returned for a domain the caller does not own',
    ).not.toContain('providers');
  });

  it('ISOLATION: and from the other side', async () => {
    const res = await get(B, `/api/v1/deliverability/reputation?domain=${A.domain}`);
    expect(res.statusCode, res.body).toBe(404);
  });

  it('the aggregate route still works on the caller’s own domain', async () => {
    const res = await get(A, `/api/v1/deliverability/reputation?domain=${A.domain}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data.domain).toBe(A.domain);
  });

  it('ISOLATION: the per-provider route refuses a foreign domain', async () => {
    const res = await get(A, `/api/v1/deliverability/reputation/senderscore?domain=${B.domain}`);
    expect(res.statusCode, res.body).toBe(404);
  });

  it('the per-provider route still works on the caller’s own domain', async () => {
    const res = await get(A, `/api/v1/deliverability/reputation/senderscore?domain=${A.domain}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data.provider).toBe('senderscore');
  });
});
