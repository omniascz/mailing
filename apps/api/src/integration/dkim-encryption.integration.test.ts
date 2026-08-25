/**
 * DKIM private keys, encrypted at rest — against a real database.
 *
 * The threat this closes is narrow and worth stating plainly: someone who gets
 * a copy of the database (a dump, a backup, a read replica) could sign mail as
 * every customer domain until each of them changed DNS. Nothing here helps if
 * the application itself is compromised — a process that can send mail can read
 * its own keys. That is an accepted limit, not an oversight.
 *
 * These assertions run against Postgres rather than a mock because the property
 * being claimed is about what is IN the database. A unit test can prove the
 * cipher round-trips; only a `SELECT` can prove the column stopped holding a
 * usable key.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto, { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { eq, inArray } from 'drizzle-orm';

let dnsLive = false;
vi.mock('../services/domains/dkim.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, verifyDkimDns: vi.fn(async () => dnsLive) };
});

import { db } from '../db/client.js';
import { organizations, sendingDomains, dkimKeys } from '../db/schema/index.js';
import {
  createInitialKey,
  generateSelector,
  resolveActiveKey,
  resolveDkimForSender,
  rotateDkimKey,
  verifyAndPromotePending,
  DkimKeyDecryptionError,
  DKIM_MASTER_KEY_ENV,
} from '../services/domains/dkim-rotation.js';
import { generateDkimKeyPair, signEmailDkim } from '../services/domains/dkim.js';

/**
 * A second connection, outside Drizzle, used for the assertions that must not
 * go through any application code. "The key is unreadable without the master
 * key" is a claim about bytes in a column; reading it back through the layer
 * that decrypts would assert nothing.
 */
const raw = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });

const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];
const domainIds: string[] = [];

/** The master key everything in this file is written with. */
const MASTER = 'ab'.repeat(32);
const originalMaster = process.env[DKIM_MASTER_KEY_ENV];

async function makeOrg(label: string): Promise<string> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `dkim-enc-${label}-${tag}`, slug: `dkim-enc-${label}-${tag}` })
    .returning({ id: organizations.id });
  orgIds.push(org!.id);
  return org!.id;
}

async function makeDomain(orgId: string, label: string, activate: boolean) {
  const domain = `${label}-${tag}.test`;
  const [row] = await db.insert(sendingDomains).values({ orgId, domain }).returning();
  domainIds.push(row!.id);

  const selector = generateSelector(new Date());
  const pair = await generateDkimKeyPair('rsa');
  await createInitialKey(db, {
    orgId,
    domainId: row!.id,
    selector,
    privateKeyPem: pair.privateKeyPem,
    publicKeyBase64: pair.publicKeyBase64,
    keyType: pair.keyType,
  });
  if (activate) {
    dnsLive = true;
    await verifyAndPromotePending(orgId, row!.id);
    dnsLive = false;
  }
  return { domainId: row!.id, domain, selector, pem: pair.privateKeyPem, pub: pair.publicKeyBase64 };
}

/** What the column actually holds, straight from SQL. */
async function storedRow(domainId: string) {
  const [row] = await raw<
    { private_key: string; dek_wrapped: string | null; master_key_version: number }[]
  >`SELECT private_key, dek_wrapped, master_key_version FROM dkim_keys WHERE domain_id = ${domainId} LIMIT 1`;
  return row!;
}

let orgA: string;
let shop: Awaited<ReturnType<typeof makeDomain>>;
let victim: Awaited<ReturnType<typeof makeDomain>>;
let attacker: Awaited<ReturnType<typeof makeDomain>>;

beforeAll(async () => {
  process.env[DKIM_MASTER_KEY_ENV] = MASTER;
  orgA = await makeOrg('a');
  shop = await makeDomain(orgA, 'shop', true);
  victim = await makeDomain(orgA, 'victim', true);
  attacker = await makeDomain(orgA, 'attacker', true);
}, 60_000);

afterAll(async () => {
  if (originalMaster === undefined) delete process.env[DKIM_MASTER_KEY_ENV];
  else process.env[DKIM_MASTER_KEY_ENV] = originalMaster;
  if (domainIds.length) {
    await db.delete(dkimKeys).where(inArray(dkimKeys.domainId, domainIds));
    await db.delete(sendingDomains).where(inArray(sendingDomains.id, domainIds));
  }
  for (const id of orgIds) await db.delete(organizations).where(eq(organizations.id, id));
  await raw.end();
});

// ─── C1 ───────────────────────────────────────────────────────────────────────

describe('C1 — what a database dump yields', () => {
  it('the stored key is not a usable PEM', async () => {
    const row = await storedRow(shop.domainId);
    expect(row.private_key.startsWith('dk1:')).toBe(true);
    expect(row.private_key).not.toContain('BEGIN PRIVATE KEY');
    // The claim is not "it looks different" but "it cannot be used". Node's
    // key parser is the arbiter, the same one the signer would use.
    expect(() => crypto.createPrivateKey(row.private_key)).toThrow();
  });

  it('the base64 payload does not decode to a PEM either', async () => {
    const row = await storedRow(shop.domainId);
    const decoded = Buffer.from(row.private_key.slice(4), 'base64').toString('latin1');
    expect(decoded).not.toContain('PRIVATE KEY');
  });

  it('carries a wrapped DEK and a master key version', async () => {
    const row = await storedRow(shop.domainId);
    expect(row.dek_wrapped?.startsWith('dw1:')).toBe(true);
    expect(row.master_key_version).toBe(1);
  });

  it('gives every row its own DEK — one leaked DEK does not open the rest', async () => {
    const a = await storedRow(shop.domainId);
    const b = await storedRow(victim.domainId);
    expect(a.dek_wrapped).not.toBe(b.dek_wrapped);
    expect(a.private_key).not.toBe(b.private_key);
  });
});

// ─── C2 ───────────────────────────────────────────────────────────────────────

describe('C2 — the key still works', () => {
  it('resolveActiveKey returns the exact PEM that was stored', async () => {
    const got = await resolveActiveKey(orgA, shop.domain);
    expect(got!.privateKey).toBe(shop.pem);
    expect(got!.selector).toBe(shop.selector);
  });

  it('a signature made with the decrypted key verifies against the published public key', async () => {
    const got = await resolveActiveKey(orgA, shop.domain);
    const headers = {
      from: `orders@${shop.domain}`,
      to: 'someone@example.com',
      subject: 'Round trip',
      date: new Date(0).toUTCString(),
      'message-id': '<rt@forgemsg>',
      messageId: '<rt@forgemsg>',
    };
    const body = 'hello\r\n';
    const sig = signEmailDkim({
      headers,
      body,
      privateKeyPem: got!.privateKey,
      domain: shop.domain,
      selector: got!.selector,
    });

    // Re-derive exactly what signEmailDkim signed, then check the signature
    // against the PUBLIC key — the half that lives in DNS. This is the receiver
    // side of the transaction, which is the only side that matters.
    const b = /b=([A-Za-z0-9+/=]+)$/.exec(sig)![1]!;
    const partial = sig.slice(0, sig.length - `b=${b}`.length);
    const signed = [
      ...['from', 'to', 'subject', 'date', 'message-id'].map(
        (n) => `${n}:${(headers as Record<string, string>)[n]!.trim().replace(/\s+/g, ' ')}`,
      ),
      `dkim-signature:${partial}b=`,
    ].join('\r\n');

    const pubKey = crypto.createPublicKey({
      key: Buffer.from(shop.pub, 'base64'),
      format: 'der',
      type: 'spki',
    });
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(signed);
    expect(verifier.verify(pubKey, b, 'base64')).toBe(true);
  });

  it('rotation writes an encrypted key too — and the new one also round-trips', async () => {
    const rotating = await makeDomain(orgA, 'rot', true);
    const before = await resolveActiveKey(orgA, rotating.domain);

    await rotateDkimKey(orgA, rotating.domainId);
    dnsLive = true;
    const promoted = await verifyAndPromotePending(orgA, rotating.domainId);
    dnsLive = false;
    expect(promoted.promoted).toBe(true);

    const after = await resolveActiveKey(orgA, rotating.domain);
    expect(after!.selector).not.toBe(before!.selector);
    // A real, parseable key — not a decryption that silently produced junk.
    expect(() => crypto.createPrivateKey(after!.privateKey)).not.toThrow();
    expect(after!.privateKey).toContain('BEGIN PRIVATE KEY');

    // …and the retiring key is still ciphertext in the table, not resurrected
    // plaintext.
    const rows = await raw<{ private_key: string }[]>`
      SELECT private_key FROM dkim_keys WHERE domain_id = ${rotating.domainId}
    `;
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) expect(r.private_key.startsWith('dk1:')).toBe(true);
  });
});

// ─── C3 ───────────────────────────────────────────────────────────────────────

describe('C3 — the wrong master key', () => {
  it('throws DkimKeyDecryptionError rather than returning null or plaintext', async () => {
    process.env[DKIM_MASTER_KEY_ENV] = 'cd'.repeat(32);
    try {
      const p = resolveActiveKey(orgA, shop.domain);
      await expect(p).rejects.toThrow(DkimKeyDecryptionError);
      // Explicitly NOT null: null is the answer for "this domain has no key",
      // and a caller that reads it as such sends unsigned mail.
      await expect(p).rejects.not.toBeNull();
    } finally {
      process.env[DKIM_MASTER_KEY_ENV] = MASTER;
    }
  });

  it('throws when the master key is absent entirely', async () => {
    delete process.env[DKIM_MASTER_KEY_ENV];
    try {
      await expect(resolveActiveKey(orgA, shop.domain)).rejects.toThrow(DkimKeyDecryptionError);
    } finally {
      process.env[DKIM_MASTER_KEY_ENV] = MASTER;
    }
  });

  it('the error names the selector but carries no key material', async () => {
    process.env[DKIM_MASTER_KEY_ENV] = 'cd'.repeat(32);
    try {
      await resolveActiveKey(orgA, shop.domain);
      throw new Error('expected a throw');
    } catch (err) {
      const e = err as Error & { cause?: unknown };
      const text = `${e.message} ${String(e.cause ?? '')}`;
      expect(text).toContain(shop.selector); // useful
      expect(text).not.toContain(shop.pem); // never
      expect(text).not.toContain(MASTER);
      expect(text).not.toContain('cd'.repeat(32));
    } finally {
      process.env[DKIM_MASTER_KEY_ENV] = MASTER;
    }
  });
});

// ─── C4 ───────────────────────────────────────────────────────────────────────

describe('C4 — a ciphertext is bound to its row', () => {
  it('a stolen key+DEK pasted onto another domain will not decrypt', async () => {
    // The attack the AAD exists for. Someone with write access to the database
    // but not the master key copies a victim domain's encrypted key and its
    // wrapped DEK onto a row for a domain they control, then asks the
    // application to sign for it. Both blobs are internally consistent, so
    // without associated data this would simply work — and the application
    // would sign mail as the victim's domain using the victim's real key.
    const stolen = await storedRow(victim.domainId);
    const original = await storedRow(attacker.domainId);

    await raw`
      UPDATE dkim_keys
      SET private_key = ${stolen.private_key}, dek_wrapped = ${stolen.dek_wrapped}
      WHERE domain_id = ${attacker.domainId}
    `;
    try {
      await expect(resolveActiveKey(orgA, attacker.domain)).rejects.toThrow(
        DkimKeyDecryptionError,
      );
      // And the victim's own row is untouched and still works — the failure is
      // the binding, not collateral damage.
      const ok = await resolveActiveKey(orgA, victim.domain);
      expect(ok!.privateKey).toBe(victim.pem);
    } finally {
      await raw`
        UPDATE dkim_keys
        SET private_key = ${original.private_key}, dek_wrapped = ${original.dek_wrapped}
        WHERE domain_id = ${attacker.domainId}
      `;
    }
  });

  it('moving a row to a different selector breaks it too — the AAD is row identity', async () => {
    const [before] = await raw<{ selector: string }[]>`
      SELECT selector FROM dkim_keys WHERE domain_id = ${attacker.domainId} LIMIT 1
    `;
    await raw`UPDATE dkim_keys SET selector = ${'tampered1'} WHERE domain_id = ${attacker.domainId}`;
    try {
      await expect(resolveActiveKey(orgA, attacker.domain)).rejects.toThrow(
        DkimKeyDecryptionError,
      );
    } finally {
      await raw`UPDATE dkim_keys SET selector = ${before!.selector} WHERE domain_id = ${attacker.domainId}`;
    }
  });
});

// ─── C5 ───────────────────────────────────────────────────────────────────────

describe('C5 — a legacy row the backfill has not reached', () => {
  it('throws instead of handing back the plaintext it finds', async () => {
    // Exactly the shape every row had before this branch: a PEM in
    // private_key, no wrapped DEK. The tempting implementation returns it —
    // "it is already a key, just use it" — and that is the bug: a deployment
    // that forgot the backfill would keep signing happily, encryption reported
    // as on, plaintext keys still in every dump.
    const legacyPem = (await generateDkimKeyPair('rsa')).privateKeyPem;
    const saved = await storedRow(attacker.domainId);
    await raw`
      UPDATE dkim_keys SET private_key = ${legacyPem}, dek_wrapped = NULL
      WHERE domain_id = ${attacker.domainId}
    `;
    try {
      const p = resolveActiveKey(orgA, attacker.domain);
      await expect(p).rejects.toThrow(DkimKeyDecryptionError);
      await expect(p).rejects.toThrow(/backfill/i);
    } finally {
      await raw`
        UPDATE dkim_keys SET private_key = ${saved.private_key}, dek_wrapped = ${saved.dek_wrapped}
        WHERE domain_id = ${attacker.domainId}
      `;
    }
  });
});

// ─── C7 ───────────────────────────────────────────────────────────────────────

describe('C7 — the mirror stops holding a second copy', () => {
  it('sending_domains.dkim_private_key is NULL after createInitialKey', async () => {
    const fresh = await makeDomain(orgA, 'mirror-new', false);
    const [row] = await raw<{ dkim_private_key: string | null; dkim_selector: string | null }[]>`
      SELECT dkim_private_key, dkim_selector FROM sending_domains WHERE id = ${fresh.domainId}
    `;
    expect(row!.dkim_private_key).toBeNull();
    // The public half of the mirror is untouched — the DNS-record views still
    // have what they read.
    expect(row!.dkim_selector).toBe(fresh.selector);
  });

  it('stays NULL after a promotion moves the mirror to the new key', async () => {
    const d = await makeDomain(orgA, 'mirror-rot', true);
    await rotateDkimKey(orgA, d.domainId);
    dnsLive = true;
    await verifyAndPromotePending(orgA, d.domainId);
    dnsLive = false;
    const [row] = await raw<{ dkim_private_key: string | null; dkim_selector: string | null }[]>`
      SELECT dkim_private_key, dkim_selector FROM sending_domains WHERE id = ${d.domainId}
    `;
    expect(row!.dkim_private_key).toBeNull();
    expect(row!.dkim_selector).not.toBe(d.selector); // it did move
  });

  it('no sending_domains row anywhere still holds a private key', async () => {
    const [row] = await raw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM sending_domains WHERE dkim_private_key IS NOT NULL
    `;
    expect(row!.n).toBe(0);
  });
});

// ─── resolveDkimForSender keeps its two answers distinct ──────────────────────

describe('null still means "no key", not "cannot read the key"', () => {
  it('a domain with no active key resolves to null', async () => {
    const pendingOnly = await makeDomain(orgA, 'nokey', false);
    expect(await resolveDkimForSender(orgA, `x@${pendingOnly.domain}`)).toBeNull();
  });

  it('an unreadable key throws rather than resolving to null', async () => {
    process.env[DKIM_MASTER_KEY_ENV] = 'cd'.repeat(32);
    try {
      await expect(resolveDkimForSender(orgA, `orders@${shop.domain}`)).rejects.toThrow(
        DkimKeyDecryptionError,
      );
    } finally {
      process.env[DKIM_MASTER_KEY_ENV] = MASTER;
    }
  });
});
