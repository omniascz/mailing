/**
 * Which key signs a given From address — against a real database.
 *
 * The unit test next to queues.ts proves the wiring: that the transactional
 * path asks the shared resolver and puts back what it gets. It cannot prove the
 * resolution, because `resolveDkimForSender` calls `resolveActiveKey` in the
 * same module and an intra-module call cannot be intercepted by a module mock —
 * stubbing it would only assert the stub.
 *
 * So the part that decides whether a receiver can validate the signature is
 * asserted here, against real rows: the right domain's key, this org's key
 * only, the ACTIVE key rather than a pending one, and a From parsed the way the
 * ownership guard parses it.
 *
 * Getting this wrong is not a smaller version of sending unsigned. Signing with
 * a key whose public half is not in that domain's DNS produces a signature that
 * fails verification, and a failed DKIM signature is a worse signal to a
 * receiver than no signature at all.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';

// The one thing mocked: whether the customer has published the DNS record.
// Everything else — key generation, the promote transaction, the partial unique
// indexes — is real, which is the point of running this against Postgres.
let dnsLive = false;
vi.mock('../services/domains/dkim.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, verifyDkimDns: vi.fn(async () => dnsLive) };
});

import { db } from '../db/client.js';
import { organizations, sendingDomains, dkimKeys } from '../db/schema/index.js';
import {
  resolveDkimForSender,
  createInitialKey,
  verifyAndPromotePending,
  generateSelector,
} from '../services/domains/dkim-rotation.js';
import { generateDkimKeyPair } from '../services/domains/dkim.js';

const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];
const domainIds: string[] = [];

async function makeOrg(label: string): Promise<string> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `txn-dkim-${label}-${tag}`, slug: `txn-dkim-${label}-${tag}` })
    .returning({ id: organizations.id });
  orgIds.push(org!.id);
  return org!.id;
}

/** A domain with one key. `activate` false leaves it pending (not yet in DNS). */
async function makeDomain(
  orgId: string,
  label: string,
  activate: boolean,
): Promise<{ domain: string; selector: string; privateKeyPem: string }> {
  const domain = `${label}-${tag}.test`;
  const [d] = await db
    .insert(sendingDomains)
    .values({ orgId, domain, mailSubdomain: `mail.${domain}` })
    .returning({ id: sendingDomains.id });
  domainIds.push(d!.id);

  const pair = await generateDkimKeyPair();
  const selector = generateSelector(new Date());
  await createInitialKey(db, {
    orgId,
    domainId: d!.id,
    selector,
    privateKeyPem: pair.privateKeyPem,
    publicKeyBase64: pair.publicKeyBase64,
    keyType: pair.keyType,
  });

  if (activate) {
    dnsLive = true;
    await verifyAndPromotePending(orgId, d!.id);
    dnsLive = false;
  }
  return { domain, selector, privateKeyPem: pair.privateKeyPem };
}

let orgA: string;
let orgB: string;
let shop: Awaited<ReturnType<typeof makeDomain>>;
let other: Awaited<ReturnType<typeof makeDomain>>;
let pendingOnly: Awaited<ReturnType<typeof makeDomain>>;
let foreign: Awaited<ReturnType<typeof makeDomain>>;

beforeAll(async () => {
  orgA = await makeOrg('a');
  orgB = await makeOrg('b');
  shop = await makeDomain(orgA, 'shop', true);
  other = await makeDomain(orgA, 'other', true);
  pendingOnly = await makeDomain(orgA, 'pending', false);
  foreign = await makeDomain(orgB, 'foreign', true);
}, 60_000);

afterAll(async () => {
  if (domainIds.length) {
    await db.delete(dkimKeys).where(inArray(dkimKeys.domainId, domainIds));
    await db.delete(sendingDomains).where(inArray(sendingDomains.id, domainIds));
  }
  for (const id of orgIds) await db.delete(organizations).where(eq(organizations.id, id));
});

describe('resolveDkimForSender — which key, for which From', () => {
  it('returns the From domain’s own key material', async () => {
    const got = await resolveDkimForSender(orgA, `orders@${shop.domain}`);
    expect(got).not.toBeNull();
    expect(got!.dkimDomain).toBe(shop.domain);
    expect(got!.dkimSelector).toBe(shop.selector);
    expect(got!.dkimPrivateKey).toBe(shop.privateKeyPem);
  });

  it('does not hand back another domain of the same org', async () => {
    const got = await resolveDkimForSender(orgA, `noreply@${other.domain}`);
    expect(got!.dkimDomain).toBe(other.domain);
    expect(got!.dkimSelector).toBe(other.selector);
    expect(
      got!.dkimPrivateKey,
      'signing other.test mail with shop.test’s key produces a signature DNS cannot back',
    ).toBe(other.privateKeyPem);
    expect(got!.dkimSelector).not.toBe(shop.selector);
  });

  it('is scoped to the org — another tenant’s verified domain is invisible', async () => {
    // The domain exists and has an active key. It is simply not this org's.
    expect(await resolveDkimForSender(orgA, `spoof@${foreign.domain}`)).toBeNull();
    // …and is resolvable by the org that owns it, so the null above is scoping
    // rather than the fixture being broken.
    expect((await resolveDkimForSender(orgB, `real@${foreign.domain}`))!.dkimSelector).toBe(
      foreign.selector,
    );
  });

  it('refuses a pending key — its public half is not in DNS yet', async () => {
    // A signature made with this key cannot be verified by anyone. Null here
    // means the mail goes unsigned, which is the better of the two.
    expect(await resolveDkimForSender(orgA, `hello@${pendingOnly.domain}`)).toBeNull();
  });

  it('reads the address out of a display-name From', async () => {
    const got = await resolveDkimForSender(orgA, `Shop Orders <orders@${shop.domain}>`);
    expect(
      got,
      'splitting on @ by hand yields "…>" for this From and silently finds no key',
    ).not.toBeNull();
    expect(got!.dkimDomain).toBe(shop.domain);
  });

  it('matches the domain case-insensitively', async () => {
    const got = await resolveDkimForSender(orgA, `Orders@${shop.domain.toUpperCase()}`);
    expect(got!.dkimDomain).toBe(shop.domain);
    expect(got!.dkimSelector).toBe(shop.selector);
  });

  it('returns null for a domain with no row at all, without throwing', async () => {
    expect(await resolveDkimForSender(orgA, `x@nothing-${tag}.test`)).toBeNull();
  });

  it('returns null for an unparseable From instead of guessing', async () => {
    expect(await resolveDkimForSender(orgA, 'not-an-address')).toBeNull();
  });
});
