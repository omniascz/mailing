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
  const [primary] = await tx
    .select()
    .from(dkimKeys)
    .where(and(eq(dkimKeys.domainId, domainId), sql`status IN ('active','pending')`))
    .orderBy(sql`CASE status WHEN 'active' THEN 0 ELSE 1 END`)
    .limit(1);
  if (!primary) return;
  await tx
    .update(sendingDomains)
    .set({
      dkimSelector: primary.selector,
      dkimPrivateKey: primary.privateKey,
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
      privateKey: input.privateKeyPem,
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

function dnsRecordFor(key: DkimKey, domain: string): RotationResult['dnsRecord'] {
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
        privateKey: pair.privateKeyPem,
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

  const [pending] = await db
    .select()
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
      .select()
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
    .select({ selector: dkimKeys.selector, privateKey: dkimKeys.privateKey })
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
  return key ?? null;
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

  const keys = await db
    .select()
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
