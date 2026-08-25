/**
 * DKIM key rotation lifecycle.
 *
 * `dkim_keys` is the source of truth: many keys per domain, at most one active.
 * This module is the ONLY place that moves a key between states, and — per the
 * mirror rule (C6) — the only place that writes the DKIM key columns on
 * sending_domains (selector / public / private / key_type). Everything else
 * either reads dkim_keys (signing) or reads the mirror (DNS display).
 *
 * The window this closes: rotation used to overwrite the single key in place, so
 * mail was signed with a key not yet in DNS. Here the OLD key stays `active` and
 * keeps signing until the NEW key's DNS record is verified; only then does the
 * new key become active and the old one `retiring` (still in DNS for in-flight
 * mail), later `retired` by a cron.
 */
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { dkimKeys, sendingDomains, type DkimKey } from '../../db/schema/index.js';
import { generateDkimKeyPair, verifyDkimDns, type DkimKeyType } from './dkim.js';
import {
  EnvelopeDecryptionError,
  decryptWithDek,
  encryptWithDek,
  generateDek,
  getMasterKey,
  unwrapDek,
  wrapDek,
} from '../../lib/crypto/envelope.js';

import { env } from '../../config/env.js';

// Imported for what loading it guarantees, not for what it returns.
//
// lib/crypto/envelope.ts reads DKIM_MASTER_KEY from process.env at use time,
// but the DEV default for it lives in the schema — config/env.ts validates the
// variable and publishes the resolved value back to process.env. A caller that
// reaches this service without having booted the app (an integration suite, a
// one-off script) would otherwise find the variable unset in development even
// though the schema says it has a default, and fail on the first key it wrote.
// Making the dependency an import rather than an assumption is what stops that
// being a property of who imported what first.
void env;

/**
 * The environment variable holding the master key that wraps every DEK in
 * dkim_keys. Named once; lib/crypto/envelope.ts takes it as a parameter so the
 * same helper can serve the other secret columns later.
 */
export const DKIM_MASTER_KEY_ENV = 'DKIM_MASTER_KEY';

/** The master key version new rows are written with. Rotation is not implemented. */
const CURRENT_MASTER_KEY_VERSION = 1;

/**
 * A stored DKIM key could not be decrypted.
 *
 * Distinct from "this domain has no key", which `resolveDkimForSender` reports
 * as `null` and both callers treat as "send unsigned". Conflating the two is
 * how a misconfigured master key would turn into a silent stream of unsigned
 * mail instead of a failed job — see the catch in lib/queues.ts, which lets
 * this class through on purpose.
 */
export class DkimKeyDecryptionError extends EnvelopeDecryptionError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DkimKeyDecryptionError';
  }
}

/**
 * Associated data binding a ciphertext to the row that owns it.
 *
 * Both layers (the wrapped DEK and the encrypted key) authenticate this, so
 * lifting another domain's `private_key` + `dek_wrapped` pair onto a row you
 * control produces a decryption failure rather than a signing key for someone
 * else's domain. `domain_id` alone would not do it: a rotation gives the same
 * domain several rows, and the selector is what distinguishes them.
 */
function keyAad(domainId: string, selector: string): string {
  return `${domainId}:${selector}`;
}

/**
 * Seal a PEM for storage: fresh DEK per row, DEK wrapped by the master key.
 *
 * Throws if the environment has no usable master key. There is deliberately no
 * branch that stores the PEM as-is — a deployment that cannot encrypt must fail
 * to write a key, not write one in the clear and log a warning nobody reads.
 */
function sealPrivateKey(
  domainId: string,
  selector: string,
  privateKeyPem: string,
): { privateKey: string; dekWrapped: string; masterKeyVersion: number } {
  const masterKey = getMasterKey(DKIM_MASTER_KEY_ENV, CURRENT_MASTER_KEY_VERSION);
  const aad = keyAad(domainId, selector);
  const dek = generateDek();
  return {
    privateKey: encryptWithDek(privateKeyPem, dek, aad),
    dekWrapped: wrapDek(dek, masterKey, aad),
    masterKeyVersion: CURRENT_MASTER_KEY_VERSION,
  };
}

/**
 * How long a superseded key stays `retiring` (published in DNS) before a cron
 * marks it `retired`. DKIM DNS records commonly carry TTLs up to a few hours,
 * and receivers may have signed-mail in their queues for a while; 72h clears
 * the longest common TTLs plus propagation and in-flight validation with margin.
 */
export const RETIRING_GRACE_MS = 72 * 60 * 60 * 1000;

/**
 * A `pending` key the customer never publishes would otherwise block rotation
 * forever (the one-pending index). After this it is considered abandoned and
 * swept, freeing the domain to rotate again.
 */
export const PENDING_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;

/** Drizzle transaction handle. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

/**
 * A collision-free, non-recycling selector (C2, option b). Time-based plus a
 * short random suffix so two rotations in the same second still differ. Never
 * reuses fm1..fm9, so a still-`retiring` selector can never collide and no
 * receiver serves a cached record for a selector we have repurposed.
 */
export function generateSelector(now: Date, rand = Math.random): string {
  const stamp = now.toISOString().replace(/[-:T]/g, '').replace(/\..+/, ''); // YYYYMMDDHHMMSS
  const suffix = Math.floor(rand() * 1e4)
    .toString()
    .padStart(4, '0');
  return `fmk${stamp}${suffix}`;
}

/**
 * Write the mirror on sending_domains from the domain's current signing key —
 * the active key if one exists, otherwise the sole pending key (first-time
 * setup, so the DNS-record readers can show what to publish). This is the ONLY
 * writer of the DKIM key columns on sending_domains.
 */
async function syncMirror(tx: DbOrTx, domainId: string): Promise<void> {
  // Explicitly columnar rather than `select()`. A star select would pull the
  // ciphertext and the wrapped DEK into this function, which has no business
  // holding either — and the previous version's habit of copying whatever it
  // read into sending_domains is exactly how the second plaintext copy came to
  // exist.
  const [primary] = await tx
    .select({
      selector: dkimKeys.selector,
      publicKey: dkimKeys.publicKey,
      keyType: dkimKeys.keyType,
    })
    .from(dkimKeys)
    .where(and(eq(dkimKeys.domainId, domainId), sql`status IN ('active','pending')`))
    .orderBy(sql`CASE status WHEN 'active' THEN 0 ELSE 1 END`)
    .limit(1);
  if (!primary) return;
  await tx
    .update(sendingDomains)
    .set({
      dkimSelector: primary.selector,
      // The mirror keeps the three PUBLIC facts a DNS-record view needs and
      // stops carrying the private key at all.
      //
      // Encrypting dkim_keys.private_key while leaving a readable PEM here
      // would have been theatre: the same dump yields the same key from the
      // next column over. Nothing reads this — the only reference in the
      // codebase is routes/v1/domains.ts, where sanitise() deletes it from the
      // response — so emptying it costs nothing and removes a whole copy.
      dkimPrivateKey: null,
      dkimPublicKey: primary.publicKey,
      dkimKeyType: primary.keyType,
      updatedAt: new Date(),
    })
    .where(eq(sendingDomains.id, domainId));
}

/**
 * Create the first key for a brand-new domain (generated or BYODKIM). Inserted
 * as `pending`; it becomes `active` when its DNS is verified. Mirrors so the
 * DNS-record UI shows the record to publish.
 */
export async function createInitialKey(
  tx: DbOrTx,
  input: {
    orgId: string;
    domainId: string;
    selector: string;
    privateKeyPem: string;
    publicKeyBase64: string;
    keyType: DkimKeyType;
    isByo?: boolean;
  },
): Promise<DkimKey> {
  const [key] = await tx
    .insert(dkimKeys)
    .values({
      orgId: input.orgId,
      domainId: input.domainId,
      selector: input.selector,
      ...sealPrivateKey(input.domainId, input.selector, input.privateKeyPem),
      publicKey: input.publicKeyBase64,
      keyType: input.keyType,
      status: 'pending',
      isByo: input.isByo ? 'true' : 'false',
    })
    .returning();
  await syncMirror(tx, input.domainId);
  return key!;
}

export interface RotationResult {
  key: DkimKey;
  reused: boolean; // true = an existing pending was returned unchanged
  dnsRecord: { hostname: string; type: 'TXT'; value: string };
}

/**
 * Takes the three public fields structurally rather than a whole `DkimKey`, so
 * callers that deliberately selected around the ciphertext can still use it
 * without widening their query back out to a star select.
 */
function dnsRecordFor(
  key: Pick<DkimKey, 'selector' | 'keyType' | 'publicKey'>,
  domain: string,
): RotationResult['dnsRecord'] {
  return {
    hostname: `${key.selector}._domainkey.${domain}`,
    type: 'TXT',
    value: `v=DKIM1; k=${key.keyType}; p=${key.publicKey}`,
  };
}

/**
 * Begin a rotation: generate a new key as `pending`, leaving the active key
 * signing untouched. Returns the DNS record to publish.
 *
 * At most one pending per domain (C3). A second call returns the EXISTING
 * pending unchanged — idempotent, so a customer who clicks Rotate twice keeps
 * publishing one record rather than chasing a moving selector. `force` discards
 * the current pending and starts a fresh one (for abandoning a half-done
 * rotation).
 */
export async function rotateDkimKey(
  orgId: string,
  domainId: string,
  opts: { force?: boolean; keyType?: DkimKeyType } = {},
): Promise<RotationResult> {
  const [domain] = await db
    .select({ id: sendingDomains.id, domain: sendingDomains.domain, byo: sendingDomains.dkimByo })
    .from(sendingDomains)
    .where(and(eq(sendingDomains.id, domainId), eq(sendingDomains.orgId, orgId)))
    .limit(1);
  if (!domain) throw new Error('domain not found');

  return db.transaction(async (tx) => {
    const [existingPending] = await tx
      .select()
      .from(dkimKeys)
      .where(and(eq(dkimKeys.domainId, domainId), eq(dkimKeys.status, 'pending')))
      .limit(1);

    if (existingPending && !opts.force) {
      return {
        key: existingPending,
        reused: true,
        dnsRecord: dnsRecordFor(existingPending, domain.domain),
      };
    }
    if (existingPending && opts.force) {
      await tx.delete(dkimKeys).where(eq(dkimKeys.id, existingPending.id));
    }

    const keyType = opts.keyType ?? 'rsa';
    const pair = await generateDkimKeyPair(keyType);
    const selector = generateSelector(new Date());
    const [key] = await tx
      .insert(dkimKeys)
      .values({
        orgId,
        domainId,
        selector,
        ...sealPrivateKey(domainId, selector, pair.privateKeyPem),
        publicKey: pair.publicKeyBase64,
        keyType: pair.keyType,
        status: 'pending',
      })
      .returning();
    // Mirror stays on the active key when one exists; only shifts to this
    // pending for a first-time (never-active) domain.
    await syncMirror(tx, domainId);
    return { key: key!, reused: false, dnsRecord: dnsRecordFor(key!, domain.domain) };
  });
}

export interface PromotionResult {
  promoted: boolean;
  activeSelector: string | null;
  retiredOldSelector: string | null;
}

/**
 * Verify each of the domain's `pending` keys against DNS and, for one that is
 * present, promote it: pending → active, and the previous active → retiring.
 * Atomic. The mirror moves to the new active key only here, so the signing key
 * a receiver can look up never lags what mail is signed with.
 *
 * Returns whether a promotion happened. Idempotent: a pending whose DNS is not
 * yet live is left pending for the next call.
 */
export async function verifyAndPromotePending(
  orgId: string,
  domainId: string,
): Promise<PromotionResult> {
  const [domain] = await db
    .select({ id: sendingDomains.id, domain: sendingDomains.domain })
    .from(sendingDomains)
    .where(and(eq(sendingDomains.id, domainId), eq(sendingDomains.orgId, orgId)))
    .limit(1);
  if (!domain) throw new Error('domain not found');

  // Promotion is a lifecycle move: it needs the selector to check DNS and the
  // id to update, and never the key material. Selected by name so it cannot
  // drift back into pulling the ciphertext.
  const [pending] = await db
    .select({ id: dkimKeys.id, selector: dkimKeys.selector, publicKey: dkimKeys.publicKey })
    .from(dkimKeys)
    .where(and(eq(dkimKeys.domainId, domainId), eq(dkimKeys.status, 'pending')))
    .limit(1);
  if (!pending) return { promoted: false, activeSelector: null, retiredOldSelector: null };

  const live = await verifyDkimDns(pending.selector, domain.domain, pending.publicKey);
  if (!live) {
    return { promoted: false, activeSelector: null, retiredOldSelector: null };
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    // The current active (if any) steps down to retiring — still in DNS so mail
    // already signed with it keeps validating.
    const [oldActive] = await tx
      .select({ id: dkimKeys.id, selector: dkimKeys.selector })
      .from(dkimKeys)
      .where(and(eq(dkimKeys.domainId, domainId), eq(dkimKeys.status, 'active')))
      .limit(1);
    if (oldActive) {
      await tx
        .update(dkimKeys)
        .set({ status: 'retiring', retiringAt: now, updatedAt: now })
        .where(eq(dkimKeys.id, oldActive.id));
    }
    await tx
      .update(dkimKeys)
      .set({ status: 'active', activatedAt: now, dnsVerifiedAt: now, updatedAt: now })
      .where(eq(dkimKeys.id, pending.id));
    await syncMirror(tx, domainId);
    return {
      promoted: true,
      activeSelector: pending.selector,
      retiredOldSelector: oldActive?.selector ?? null,
    };
  });
}

/**
 * The signing key: the domain's single `active` key. Never the pending
 * (not-yet-in-DNS) key, and — as long as an active key exists — never null
 * because a rotation is in progress.
 */
export async function resolveActiveKey(
  orgId: string,
  domain: string,
): Promise<{ selector: string; privateKey: string } | null> {
  const [key] = await db
    .select({
      selector: dkimKeys.selector,
      privateKey: dkimKeys.privateKey,
      dekWrapped: dkimKeys.dekWrapped,
      masterKeyVersion: dkimKeys.masterKeyVersion,
      // Half of the AAD. Selecting it here rather than passing the domain name
      // is deliberate: the AAD is bound to the row's identity, and the row is
      // identified by domain_id, not by the string a caller typed.
      domainId: dkimKeys.domainId,
    })
    .from(dkimKeys)
    .innerJoin(sendingDomains, eq(sendingDomains.id, dkimKeys.domainId))
    .where(
      and(
        eq(sendingDomains.orgId, orgId),
        eq(sendingDomains.domain, domain),
        eq(dkimKeys.status, 'active'),
      ),
    )
    .limit(1);
  if (!key) return null;
  return { selector: key.selector, privateKey: decryptStoredKey(key) };
}

/**
 * THE decryption point. The only one in the repository.
 *
 * Everything that signs mail arrives here, and everything else selects around
 * `private_key` rather than through it — so the number of places that can hold
 * a plaintext DKIM key is one, and it is this function.
 *
 * Every failure path throws. None of them returns the stored value, an empty
 * string, or null:
 *   - no `dek_wrapped`  -> a row the backfill has not reached. Reading it as
 *     plaintext would "work" and would be the exact bug this branch exists to
 *     remove, so it is an error instead.
 *   - missing / malformed master key -> EnvelopeKeyError from getMasterKey.
 *   - wrong master key, wrong row, tampered bytes -> the GCM tag fails.
 * All of them surface as DkimKeyDecryptionError so a caller can tell "cannot
 * read this key" apart from "there is no key".
 */
function decryptStoredKey(row: {
  selector: string;
  privateKey: string;
  dekWrapped: string | null;
  masterKeyVersion: number;
  domainId: string;
}): string {
  if (!row.dekWrapped) {
    throw new DkimKeyDecryptionError(
      `DKIM key for selector ${row.selector} has no wrapped DEK — the row predates ` +
        `encryption and has not been backfilled. Run scripts/backfill-dkim-encryption.ts. ` +
        `Refusing to treat the stored value as a plaintext key.`,
    );
  }
  const aad = keyAad(row.domainId, row.selector);
  try {
    const masterKey = getMasterKey(DKIM_MASTER_KEY_ENV, row.masterKeyVersion);
    const dek = unwrapDek(row.dekWrapped, masterKey, aad);
    return decryptWithDek(row.privateKey, dek, aad);
  } catch (err) {
    // Wrapped, not rethrown, so the selector is in the message — an operator
    // needs to know WHICH key failed. The cause carries no key material; see
    // envelope.ts, which never puts any in an error.
    throw new DkimKeyDecryptionError(
      `Cannot decrypt the DKIM private key for selector ${row.selector}. ` +
        `Check ${DKIM_MASTER_KEY_ENV} matches the key this row was written with.`,
      { cause: err instanceof Error ? err.message : undefined },
    );
  }
}

/** The three fields the MTA payload carries. Absent as a group or present as a group. */
export interface DkimSigningMaterial {
  dkimDomain: string;
  dkimSelector: string;
  dkimPrivateKey: string;
}

/**
 * Signing material for a From address, or null when the domain has no active
 * key. THE resolver — campaign dispatch and the transactional path both call
 * this one, so a campaign and an order confirmation from the same address are
 * signed with the same key by construction.
 *
 * It lives here rather than in campaigns/dispatch.ts, where it used to, for two
 * reasons: the name was the only thing about it that was campaign-specific, and
 * lib/queues.ts cannot reach into campaigns/dispatch.ts without a cycle (that
 * module imports the splitter queue from it).
 *
 * Null is a normal answer, not an error. Two senders reach it legitimately — a
 * verified single email identity, which has no domain row to hold a key, and
 * system mail from our own domain under a customer's org id. The caller decides
 * what to do about it; both current callers send unsigned rather than refuse.
 */
export async function resolveDkimForSender(
  orgId: string,
  from: string,
): Promise<DkimSigningMaterial | null> {
  // The same parser the From-ownership guard uses, so "Shop <a@b>" and a bare
  // address resolve identically on both. Splitting on '@' by hand — which this
  // function used to do — returns "b>" for a display-name From and then finds
  // no key for it, silently.
  const { fromAddressDomain } = await import('../sending/from-domain.js');
  const domain = fromAddressDomain(from);
  if (!domain) return null;

  const key = await resolveActiveKey(orgId, domain);
  if (!key) return null;
  return { dkimDomain: domain, dkimSelector: key.selector, dkimPrivateKey: key.privateKey };
}

/**
 * Cron: retire keys whose grace has elapsed. A retired key is safe to remove
 * from DNS; we mark it (not delete it) so history and the "delete these records"
 * API list survive. Returns how many were retired.
 */
export async function retireExpiredKeys(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETIRING_GRACE_MS);
  const rows = await db
    .update(dkimKeys)
    .set({ status: 'retired', retiredAt: now, updatedAt: now })
    .where(and(eq(dkimKeys.status, 'retiring'), lt(dkimKeys.retiringAt, cutoff)))
    .returning({ id: dkimKeys.id });
  return rows.length;
}

/**
 * Cron: sweep pending keys the customer never published (older than
 * PENDING_EXPIRY_MS). Deleted outright — nothing signed with a pending key, and
 * removing it frees the domain to rotate again. Returns how many were swept.
 */
export async function expireStalePending(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PENDING_EXPIRY_MS);
  const rows = await db
    .delete(dkimKeys)
    .where(and(eq(dkimKeys.status, 'pending'), lt(dkimKeys.createdAt, cutoff)))
    .returning({ id: dkimKeys.id });
  return rows.length;
}

/** The rotation status the API surfaces (C10). */
export interface DkimRotationStatus {
  active: { selector: string; verifiedAt: string | null } | null;
  pending: { selector: string; dnsRecord: RotationResult['dnsRecord'] } | null;
  retiring: Array<{ selector: string; retiringAt: string | null; safeToDeleteAt: string | null }>;
}

export async function getRotationStatus(
  orgId: string,
  domainId: string,
): Promise<DkimRotationStatus> {
  const [domain] = await db
    .select({ domain: sendingDomains.domain })
    .from(sendingDomains)
    .where(and(eq(sendingDomains.id, domainId), eq(sendingDomains.orgId, orgId)))
    .limit(1);
  if (!domain) throw new Error('domain not found');

  // A status view. Everything it returns is public (selectors, the DNS value,
  // timestamps), so it selects the public columns and never the ciphertext.
  const keys = await db
    .select({
      selector: dkimKeys.selector,
      publicKey: dkimKeys.publicKey,
      keyType: dkimKeys.keyType,
      status: dkimKeys.status,
      dnsVerifiedAt: dkimKeys.dnsVerifiedAt,
      retiringAt: dkimKeys.retiringAt,
    })
    .from(dkimKeys)
    .where(and(eq(dkimKeys.orgId, orgId), eq(dkimKeys.domainId, domainId)));

  const active = keys.find((k) => k.status === 'active');
  const pending = keys.find((k) => k.status === 'pending');
  const retiring = keys.filter((k) => k.status === 'retiring');

  return {
    active: active
      ? { selector: active.selector, verifiedAt: active.dnsVerifiedAt?.toISOString() ?? null }
      : null,
    pending: pending
      ? { selector: pending.selector, dnsRecord: dnsRecordFor(pending, domain.domain) }
      : null,
    retiring: retiring.map((k) => ({
      selector: k.selector,
      retiringAt: k.retiringAt?.toISOString() ?? null,
      // When the record may be deleted from DNS — grace after it entered retiring.
      safeToDeleteAt: k.retiringAt
        ? new Date(k.retiringAt.getTime() + RETIRING_GRACE_MS).toISOString()
        : null,
    })),
  };
}
