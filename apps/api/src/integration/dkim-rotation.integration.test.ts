/**
 * DKIM rotation without an unsigned/broken window.
 *
 * Real Postgres (the partial unique indexes and the promote transaction only
 * mean anything against a real DB); DNS is the one thing mocked, because
 * "has the customer published the record yet" is exactly the variable under
 * test. `verifyDkimDns` is driven by `dnsLive`.
 *
 * The invariant every test guards: the key mail is signed with
 * (resolveDkimForSender / resolveActiveKey) is ALWAYS one whose public half is
 * in DNS — the old key until the new one is verified, never the pending key.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';

// DNS liveness is a controllable flag. generateDkimKeyPair / importDkimPrivateKey
// stay real so keys are genuine.
let dnsLive = false;
vi.mock('../services/domains/dkim.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, verifyDkimDns: vi.fn(async () => dnsLive) };
});

import { db } from '../db/client.js';
import { organizations, sendingDomains, dkimKeys } from '../db/schema/index.js';
import {
  rotateDkimKey,
  verifyAndPromotePending,
  resolveActiveKey,
  retireExpiredKeys,
  expireStalePending,
  createInitialKey,
  generateSelector,
  RETIRING_GRACE_MS,
  PENDING_EXPIRY_MS,
} from '../services/domains/dkim-rotation.js';
import { generateDkimKeyPair } from '../services/domains/dkim.js';

let orgId: string;
const domainIds: string[] = [];
const tag = randomUUID().slice(0, 8);

/** Fresh domain with one verified (active) key, ready to rotate. */
async function makeVerifiedDomain(label: string): Promise<{ domainId: string; domain: string }> {
  const domain = `${label}-${tag}.test`;
  const [d] = await db
    .insert(sendingDomains)
    .values({ orgId, domain, mailSubdomain: `mail.${domain}` })
    .returning({ id: sendingDomains.id });
  domainIds.push(d!.id);
  const pair = await generateDkimKeyPair();
  await createInitialKey(db, {
    orgId,
    domainId: d!.id,
    selector: generateSelector(new Date()),
    privateKeyPem: pair.privateKeyPem,
    publicKeyBase64: pair.publicKeyBase64,
    keyType: pair.keyType,
  });
  dnsLive = true;
  await verifyAndPromotePending(orgId, d!.id); // pending → active
  dnsLive = false;
  return { domainId: d!.id, domain };
}

async function mirrorOf(domainId: string) {
  const [row] = await db
    .select({ selector: sendingDomains.dkimSelector, pub: sendingDomains.dkimPublicKey })
    .from(sendingDomains)
    .where(eq(sendingDomains.id, domainId))
    .limit(1);
  return row!;
}

async function activeKeyRow(domainId: string) {
  const [row] = await db
    .select()
    .from(dkimKeys)
    .where(and(eq(dkimKeys.domainId, domainId), eq(dkimKeys.status, 'active')))
    .limit(1);
  return row ?? null;
}

beforeAll(async () => {
  const [org] = await db
    .insert(organizations)
    .values({ name: `dkim-rot-${tag}`, slug: `dkim-rot-${tag}` })
    .returning({ id: organizations.id });
  orgId = org!.id;
});

afterAll(async () => {
  if (domainIds.length) {
    await db.delete(dkimKeys).where(inArray(dkimKeys.domainId, domainIds));
    await db.delete(sendingDomains).where(inArray(sendingDomains.id, domainIds));
  }
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

beforeEach(() => {
  dnsLive = false;
});

describe('DKIM rotation lifecycle', () => {
  it('(a) after rotation, mail is still signed with the OLD key (which is in DNS)', async () => {
    const { domainId, domain } = await makeVerifiedDomain('a');
    const before = await activeKeyRow(domainId);
    expect(before).not.toBeNull();
    // The signing key as the sender sees it, captured before the rotation.
    // Compared against the resolved key rather than against `before.privateKey`
    // because that column now holds ciphertext: two equal ciphertexts would
    // also compare equal if decryption were broken, so resolving both ends is
    // the stronger claim, not a weaker one.
    const signingBefore = await resolveActiveKey(orgId, domain);

    const { key: pending, reused } = await rotateDkimKey(orgId, domainId);
    expect(reused).toBe(false);
    expect(pending.status).toBe('pending');
    expect(pending.selector).not.toBe(before!.selector); // fresh, non-recycled selector

    // Customer has NOT published the new record yet.
    const signing = await resolveActiveKey(orgId, domain);
    expect(signing).not.toBeNull();
    expect(signing!.selector).toBe(before!.selector); // STILL the old, in-DNS key
    expect(signing!.privateKey).toBe(signingBefore!.privateKey);
    // …and it is a real key, not a decryption that quietly produced junk.
    expect(signing!.privateKey).toContain('BEGIN PRIVATE KEY');

    // Mirror also still points at the old active key.
    expect((await mirrorOf(domainId)).selector).toBe(before!.selector);
  });

  it('(b) after verifyDkimDns of the new key, signing switches to the new key', async () => {
    const { domainId, domain } = await makeVerifiedDomain('b');
    const old = await activeKeyRow(domainId);
    const { key: pending } = await rotateDkimKey(orgId, domainId);

    dnsLive = true; // customer published the new record
    const promo = await verifyAndPromotePending(orgId, domainId);
    expect(promo.promoted).toBe(true);
    expect(promo.activeSelector).toBe(pending.selector);
    expect(promo.retiredOldSelector).toBe(old!.selector);

    const signing = await resolveActiveKey(orgId, domain);
    expect(signing!.selector).toBe(pending.selector); // now the new key signs
  });

  it('(c) the old key stays retiring — it does not vanish immediately', async () => {
    const { domainId } = await makeVerifiedDomain('c');
    const old = await activeKeyRow(domainId);
    await rotateDkimKey(orgId, domainId);
    dnsLive = true;
    await verifyAndPromotePending(orgId, domainId);

    const [oldRow] = await db.select().from(dkimKeys).where(eq(dkimKeys.id, old!.id)).limit(1);
    expect(oldRow!.status).toBe('retiring');
    expect(oldRow!.retiringAt).not.toBeNull();

    // A cron run now (before the grace elapses) must NOT retire it.
    const retiredNow = await retireExpiredKeys(new Date());
    const [stillRetiring] = await db
      .select()
      .from(dkimKeys)
      .where(eq(dkimKeys.id, old!.id))
      .limit(1);
    expect(stillRetiring!.status).toBe('retiring');
    void retiredNow;

    // After the grace window, the cron retires it.
    await retireExpiredKeys(new Date(Date.now() + RETIRING_GRACE_MS + 1000));
    const [nowRetired] = await db.select().from(dkimKeys).where(eq(dkimKeys.id, old!.id)).limit(1);
    expect(nowRetired!.status).toBe('retired');
  });

  it('(d) resolveActiveKey never returns null while an active key exists — through a whole rotation', async () => {
    const { domainId, domain } = await makeVerifiedDomain('d');
    expect(await resolveActiveKey(orgId, domain)).not.toBeNull(); // steady state
    await rotateDkimKey(orgId, domainId);
    expect(await resolveActiveKey(orgId, domain)).not.toBeNull(); // mid-rotation (pending exists)
    dnsLive = true;
    await verifyAndPromotePending(orgId, domainId);
    expect(await resolveActiveKey(orgId, domain)).not.toBeNull(); // after promotion
  });

  it('(e) resolveActiveKey never returns a pending key', async () => {
    const { domainId, domain } = await makeVerifiedDomain('e');
    const active = await activeKeyRow(domainId);
    const { key: pending } = await rotateDkimKey(orgId, domainId);
    const signing = await resolveActiveKey(orgId, domain);
    expect(signing!.selector).not.toBe(pending.selector);
    expect(signing!.selector).toBe(active!.selector);
    // And the pending key really is pending, not accidentally active.
    const [pendingRow] = await db
      .select()
      .from(dkimKeys)
      .where(eq(dkimKeys.id, pending.id))
      .limit(1);
    expect(pendingRow!.status).toBe('pending');
  });
});

describe('rotation guards', () => {
  it('(C3) a second rotate returns the existing pending, not a second one', async () => {
    const { domainId } = await makeVerifiedDomain('c3');
    const first = await rotateDkimKey(orgId, domainId);
    const second = await rotateDkimKey(orgId, domainId);
    expect(second.reused).toBe(true);
    expect(second.key.id).toBe(first.key.id);
    const pendingCount = (
      await db
        .select({ id: dkimKeys.id })
        .from(dkimKeys)
        .where(and(eq(dkimKeys.domainId, domainId), eq(dkimKeys.status, 'pending')))
    ).length;
    expect(pendingCount).toBe(1); // the one-pending index held; no DB error either
  });

  it('(C3/force) force starts a fresh pending, replacing the old one', async () => {
    const { domainId } = await makeVerifiedDomain('c3f');
    const first = await rotateDkimKey(orgId, domainId);
    const forced = await rotateDkimKey(orgId, domainId, { force: true });
    expect(forced.reused).toBe(false);
    expect(forced.key.id).not.toBe(first.key.id);
    const [oldPending] = await db
      .select()
      .from(dkimKeys)
      .where(eq(dkimKeys.id, first.key.id))
      .limit(1);
    expect(oldPending).toBeUndefined(); // the abandoned pending was removed
  });

  it('(C2/C3 collision) a retiring key on a selector never blocks the next rotation', async () => {
    // Two full rotations: after the first, an old key is retiring. The second
    // rotation must generate a brand-new selector that cannot collide with it.
    const { domainId } = await makeVerifiedDomain('coll');
    await rotateDkimKey(orgId, domainId);
    dnsLive = true;
    await verifyAndPromotePending(orgId, domainId); // key #1 → retiring, #2 → active
    dnsLive = false;

    // Now rotate again — must not throw on the unique(domain, selector) index.
    const third = await rotateDkimKey(orgId, domainId);
    expect(third.key.status).toBe('pending');
    const selectors = (
      await db
        .select({ s: dkimKeys.selector })
        .from(dkimKeys)
        .where(eq(dkimKeys.domainId, domainId))
    ).map((r) => r.s);
    expect(new Set(selectors).size).toBe(selectors.length); // all distinct
  });

  it('(C8) a stale unpublished pending is swept so the domain can rotate again', async () => {
    const { domainId } = await makeVerifiedDomain('stale');
    await rotateDkimKey(orgId, domainId);
    // Nothing expires yet.
    expect(await expireStalePending(new Date())).toBeGreaterThanOrEqual(0);
    const stillThere = await db
      .select()
      .from(dkimKeys)
      .where(and(eq(dkimKeys.domainId, domainId), eq(dkimKeys.status, 'pending')));
    expect(stillThere.length).toBe(1);
    // After the expiry window the pending is gone.
    await expireStalePending(new Date(Date.now() + PENDING_EXPIRY_MS + 1000));
    const gone = await db
      .select()
      .from(dkimKeys)
      .where(and(eq(dkimKeys.domainId, domainId), eq(dkimKeys.status, 'pending')));
    expect(gone.length).toBe(0);
  });
});

describe('mirror invariant (D2)', () => {
  it('after every state transition, the mirror equals the active key (or the sole pending)', async () => {
    const { domainId } = await makeVerifiedDomain('mirror');

    const assertMirrorMatchesActive = async () => {
      const active = await activeKeyRow(domainId);
      const mirror = await mirrorOf(domainId);
      expect(mirror.selector).toBe(active!.selector);
      expect(mirror.pub).toBe(active!.publicKey);
    };

    await assertMirrorMatchesActive(); // steady state

    await rotateDkimKey(orgId, domainId);
    await assertMirrorMatchesActive(); // during rotation, mirror stays on active

    dnsLive = true;
    await verifyAndPromotePending(orgId, domainId);
    await assertMirrorMatchesActive(); // after promotion, mirror moved to new active

    await retireExpiredKeys(new Date(Date.now() + RETIRING_GRACE_MS + 1000));
    await assertMirrorMatchesActive(); // after retirement, mirror unchanged (still active)
  });
});

describe('original-bug reproduction (D5)', () => {
  it('rotation must NOT switch signing to a key that is not in DNS', async () => {
    // The old code overwrote the single key in place, so immediately after
    // rotate, resolveDkimForSender returned the NEW (unpublished) key. This
    // asserts the opposite: signing stays on the old, published key.
    const { domainId, domain } = await makeVerifiedDomain('bug');
    const oldActive = await activeKeyRow(domainId);
    const { key: pending } = await rotateDkimKey(orgId, domainId); // customer has NOT published

    const signing = await resolveActiveKey(orgId, domain);
    expect(signing!.selector).toBe(oldActive!.selector);
    expect(signing!.selector).not.toBe(pending.selector); // never the unpublished key
  });
});
