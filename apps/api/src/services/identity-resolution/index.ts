/**
 * Identity Resolution L2-L3 orchestrator (§9 P1).
 *
 * Public API:
 *   resolveTransitively(orgId, contactId, maxHops?)
 *     → all contacts reachable via shared signals (closure set)
 *
 *   detectConflicts(orgId, threshold?)
 *     → signals associated with too many contacts (likely shared NAT
 *       gateway, family cookie, office device). Caller can quarantine
 *       these or de-weight them in resolution.
 *
 *   suggestProbabilisticMatches(orgId, fingerprint, sinceDays?)
 *     → anonymous_profiles with non-PII fingerprint similarity above
 *       'suggest' threshold. The route layer surfaces 'auto'-tier
 *       matches as immediate merges and 'suggest'-tier as operator
 *       review queue items.
 *
 *   recordVisitorFingerprint(orgId, visitorId, fingerprint)
 *     → upsert non-PII fingerprint into anonymous_profiles
 *
 * Mutating ops (merge contacts based on closure) live in the existing
 * services/cdp/identity-graph.mergeContacts — we delegate there.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  anonymousProfiles,
  identitySignals,
  type AnonymousProfile,
} from '../../db/schema/index.js';
import {
  buildAdjacency,
  classifyProbabilistic,
  conflictLevel,
  fingerprintSimilarity,
  transitiveClosure,
  type ConflictLevel,
  type ProbabilisticVerdict,
  type VisitorFingerprint,
} from './pure.js';

// ─── L2 transitive resolution ─────────────────────────────────────────────

export interface TransitiveResolutionResult {
  rootContactId: string;
  reachable: string[];
  signalsConsidered: number;
}

export async function resolveTransitively(
  orgId: string,
  contactId: string,
  maxHops = 5,
): Promise<TransitiveResolutionResult> {
  // Pull all signals for this org. For very large orgs we'd scope to
  // signals connected to this contact's first-hop neighbours instead,
  // but org-wide is fine up to ~100k signals which is well above what
  // a single tenant will hold in typical use.
  const rows = await db
    .select({
      contactId: identitySignals.contactId,
      type: identitySignals.signalType,
      value: identitySignals.signalValue,
    })
    .from(identitySignals)
    .where(eq(identitySignals.orgId, orgId));

  const edges = rows.map((r) => ({
    contactId: r.contactId,
    signalKey: `${r.type}:${r.value}`,
  }));
  const adj = buildAdjacency(edges);
  const closure = transitiveClosure(contactId, adj, maxHops);

  return {
    rootContactId: contactId,
    reachable: Array.from(closure).filter((id) => id !== contactId),
    signalsConsidered: rows.length,
  };
}

// ─── L2 conflict detection ───────────────────────────────────────────────

export interface SignalConflict {
  signalType: string;
  signalValue: string;
  distinctContactCount: number;
  level: ConflictLevel;
  identifying: boolean;
  exampleContactIds: string[];
}

export async function detectConflicts(
  orgId: string,
  minDistinctContacts = 3,
  limit = 100,
): Promise<SignalConflict[]> {
  const rows = (await db.execute<{
    signal_type: string;
    signal_value: string;
    distinct_count: string;
    contact_ids: string[];
  }>(sql`
    SELECT
      signal_type,
      signal_value,
      COUNT(DISTINCT contact_id)::text AS distinct_count,
      (array_agg(DISTINCT contact_id::text))[1:3] AS contact_ids
    FROM identity_signals
    WHERE org_id = ${orgId}::uuid
    GROUP BY signal_type, signal_value
    HAVING COUNT(DISTINCT contact_id) >= ${minDistinctContacts}
    ORDER BY COUNT(DISTINCT contact_id) DESC
    LIMIT ${limit}
  `)) as unknown as Array<{
    signal_type: string;
    signal_value: string;
    distinct_count: string;
    contact_ids: string[];
  }>;

  return rows.map((r) => {
    const count = Number(r.distinct_count);
    const level = conflictLevel(count);
    return {
      signalType: r.signal_type,
      signalValue: r.signal_value,
      distinctContactCount: count,
      level,
      identifying: level < 3,
      exampleContactIds: r.contact_ids ?? [],
    };
  });
}

// ─── L3 fingerprint capture ───────────────────────────────────────────────

export async function recordVisitorFingerprint(
  orgId: string,
  visitorId: string,
  fp: VisitorFingerprint,
): Promise<void> {
  await db
    .update(anonymousProfiles)
    .set({
      ipPrefix: fp.ipPrefix,
      userAgentHash: fp.userAgentHash,
      acceptLanguageHash: fp.acceptLanguageHash,
      locale: fp.locale,
      screenSig: fp.screenSig,
      lastSeenAt: new Date(),
    })
    .where(
      and(eq(anonymousProfiles.orgId, orgId), eq(anonymousProfiles.visitorId, visitorId)),
    );
}

// ─── L3 probabilistic matching ────────────────────────────────────────────

export interface ProbabilisticCandidate {
  candidateVisitorId: string;
  candidateContactId: string | null;
  similarity: number;
  verdict: ProbabilisticVerdict;
}

/**
 * Compare a fresh fingerprint against the last `sinceDays` of seen
 * anonymous profiles and return candidates above the 'low' threshold.
 *
 * The DB-side prefilter narrows on (ip_prefix, user_agent_hash) because
 * those are the heaviest-weighted features and have an index. In-memory
 * we then run full similarity across all five features.
 */
export async function suggestProbabilisticMatches(
  orgId: string,
  fp: VisitorFingerprint,
  sinceDays = 7,
  limit = 50,
): Promise<ProbabilisticCandidate[]> {
  if (!fp.ipPrefix && !fp.userAgentHash) return [];

  const since = new Date(Date.now() - sinceDays * 86_400_000);

  // Index-friendly prefilter
  const conds = [eq(anonymousProfiles.orgId, orgId), gte(anonymousProfiles.lastSeenAt, since)];
  if (fp.ipPrefix) conds.push(eq(anonymousProfiles.ipPrefix, fp.ipPrefix));
  if (fp.userAgentHash) conds.push(eq(anonymousProfiles.userAgentHash, fp.userAgentHash));

  const candidates = await db
    .select({
      visitorId: anonymousProfiles.visitorId,
      mergedInto: anonymousProfiles.mergedInto,
      ipPrefix: anonymousProfiles.ipPrefix,
      userAgentHash: anonymousProfiles.userAgentHash,
      acceptLanguageHash: anonymousProfiles.acceptLanguageHash,
      locale: anonymousProfiles.locale,
      screenSig: anonymousProfiles.screenSig,
    })
    .from(anonymousProfiles)
    .where(and(...conds))
    .limit(Math.max(1, Math.min(limit, 1000)));

  const out: ProbabilisticCandidate[] = [];
  for (const c of candidates) {
    const sim = fingerprintSimilarity(fp, {
      ipPrefix: c.ipPrefix,
      userAgentHash: c.userAgentHash,
      acceptLanguageHash: c.acceptLanguageHash,
      locale: c.locale,
      screenSig: c.screenSig,
    });
    const verdict = classifyProbabilistic(sim);
    if (verdict === 'no_match') continue;
    out.push({
      candidateVisitorId: c.visitorId,
      candidateContactId: c.mergedInto,
      similarity: sim,
      verdict,
    });
  }
  out.sort((a, b) => b.similarity - a.similarity);
  return out;
}

/**
 * Read the persisted fingerprint for a given visitor — used when the
 * route layer wants to compare two known visitors instead of an
 * incoming snapshot.
 */
export async function getVisitorFingerprint(
  orgId: string,
  visitorId: string,
): Promise<{ fingerprint: VisitorFingerprint; profile: AnonymousProfile } | null> {
  const [row] = await db
    .select()
    .from(anonymousProfiles)
    .where(
      and(eq(anonymousProfiles.orgId, orgId), eq(anonymousProfiles.visitorId, visitorId)),
    )
    .limit(1);
  if (!row) return null;
  return {
    fingerprint: {
      ipPrefix: row.ipPrefix,
      userAgentHash: row.userAgentHash,
      acceptLanguageHash: row.acceptLanguageHash,
      locale: row.locale,
      screenSig: row.screenSig,
    },
    profile: row,
  };
}
