/**
 * Identity resolution L2-L3 — pure logic (§9 P1).
 *
 * Builds on services/cdp/identity-graph (L1 deterministic single-hop) with:
 *
 *   L2: transitive closure — A↔B and B↔C should resolve A, B, C to one
 *       canonical contact even when no single signal directly links A↔C.
 *
 *   L2: conflict detection — when one signal value (e.g. a shared office
 *       cookie or device_id) is associated with too many distinct
 *       contacts, the signal stops being identifying and starts being
 *       noise. We score the conflict and surface ambiguous signals so
 *       they can be deweighted or quarantined.
 *
 *   L2: confidence decay — old signals are still real but less
 *       load-bearing for "who is this *now*?". 90-day half-life.
 *
 *   L3: probabilistic match — score visitor → contact similarity from
 *       non-PII fingerprint (ip prefix + UA hash + locale + screen sig).
 *       Threshold-based: above 0.7 = suggest merge, above 0.85 = auto.
 *
 * Pure functions live here; the orchestrator delegates so the math
 * stays unit-testable + framework-free.
 */

import { createHash } from 'node:crypto';

// ─── Transitive closure ───────────────────────────────────────────────────

/**
 * Build an adjacency map from a signal-edges list. Each signal value
 * connects every contact that shares it.
 *
 * Input: rows of (contactId, signalKey) — signalKey is "type:value".
 * Output: Map<contactId, Set<contactId>> with edges between contacts
 *         that share at least one signal.
 */
export function buildAdjacency(
  edges: Array<{ contactId: string; signalKey: string }>,
): Map<string, Set<string>> {
  const bySignal = new Map<string, Set<string>>();
  for (const e of edges) {
    let bucket = bySignal.get(e.signalKey);
    if (!bucket) {
      bucket = new Set();
      bySignal.set(e.signalKey, bucket);
    }
    bucket.add(e.contactId);
  }

  const adj = new Map<string, Set<string>>();
  for (const contacts of bySignal.values()) {
    if (contacts.size < 2) continue;
    const arr = Array.from(contacts);
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i]!;
      let bucket = adj.get(a);
      if (!bucket) {
        bucket = new Set();
        adj.set(a, bucket);
      }
      for (let j = 0; j < arr.length; j++) {
        if (i !== j) bucket.add(arr[j]!);
      }
    }
  }
  return adj;
}

/**
 * BFS over the adjacency map starting from `root`. Returns the set of
 * all contacts reachable up to `maxHops` away. Used to find every
 * contact that should be merged together once a chain resolution is
 * triggered.
 */
export function transitiveClosure(
  root: string,
  adjacency: Map<string, Set<string>>,
  maxHops = 5,
): Set<string> {
  const visited = new Set<string>([root]);
  let frontier = [root];
  for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const node of frontier) {
      const neighbours = adjacency.get(node);
      if (!neighbours) continue;
      for (const n of neighbours) {
        if (!visited.has(n)) {
          visited.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return visited;
}

// ─── Conflict scoring ─────────────────────────────────────────────────────

/**
 * A signal shared across too many distinct contacts has lost its power
 * to identify. Examples:
 *   - office shared device_id used by 12 employees
 *   - corporate gateway IP prefix
 *   - shared family cookie
 *
 * Conflict scale (heuristic):
 *   1 contact      → 0   (no conflict, identifying)
 *   2 contacts     → 1   (might be normal merge candidate)
 *   3-4 contacts   → 2   (suspicious)
 *   5-9 contacts   → 3   (high — likely shared device / NAT)
 *   10+ contacts   → 4   (noise — quarantine)
 *
 * Above threshold 3, the signal stops contributing to auto-resolution.
 */
export type ConflictLevel = 0 | 1 | 2 | 3 | 4;

export function conflictLevel(distinctContactCount: number): ConflictLevel {
  if (distinctContactCount <= 1) return 0;
  if (distinctContactCount === 2) return 1;
  if (distinctContactCount <= 4) return 2;
  if (distinctContactCount <= 9) return 3;
  return 4;
}

/** True when the signal still identifies — under conflict 3. */
export function isIdentifying(level: ConflictLevel): boolean {
  return level < 3;
}

// ─── Confidence decay ─────────────────────────────────────────────────────

/**
 * Apply exponential decay to a signal's stored confidence as it ages.
 * Half-life 90 days. A signal stored as 80 confidence stays meaningful
 * for the first 30-60 days, then fades.
 */
export const CONFIDENCE_HALF_LIFE_DAYS = 90;

export function decayConfidence(storedConfidence: number, ageDays: number): number {
  if (ageDays <= 0) return storedConfidence;
  const factor = Math.pow(0.5, ageDays / CONFIDENCE_HALF_LIFE_DAYS);
  return Math.round(storedConfidence * factor);
}

// ─── L3 probabilistic fingerprint ─────────────────────────────────────────

export interface VisitorFingerprint {
  ipPrefix: string | null;
  userAgentHash: string | null;
  acceptLanguageHash: string | null;
  locale: string | null;
  screenSig: string | null;
}

/**
 * Per-feature weights — sum to 1.0 when all are present. Missing
 * features are skipped (score normalises against present-feature weight).
 */
const FP_WEIGHTS = {
  ipPrefix: 0.35,
  userAgentHash: 0.25,
  acceptLanguageHash: 0.15,
  locale: 0.1,
  screenSig: 0.15,
} as const;

/**
 * Pairwise similarity 0-1 between two visitor fingerprints. A perfect
 * match across every available feature returns 1; complete mismatch
 * returns 0. Each feature is binary equal/not-equal; we don't do
 * edit-distance because the values are hashes or short fixed strings.
 */
export function fingerprintSimilarity(a: VisitorFingerprint, b: VisitorFingerprint): number {
  let totalWeight = 0;
  let matchedWeight = 0;
  for (const [key, weight] of Object.entries(FP_WEIGHTS) as Array<
    [keyof typeof FP_WEIGHTS, number]
  >) {
    const av = a[key];
    const bv = b[key];
    if (!av || !bv) continue;
    totalWeight += weight;
    if (av === bv) matchedWeight += weight;
  }
  if (totalWeight === 0) return 0;
  return Math.round((matchedWeight / totalWeight) * 1000) / 1000;
}

/**
 * Verdict from a similarity score:
 *   < 0.5   →  'no_match' (don't surface)
 *   0.5-0.7 →  'low'       (note, don't act)
 *   0.7-0.85→  'suggest'   (propose merge, require operator approval)
 *   ≥ 0.85  →  'auto'      (safe to auto-merge)
 */
export type ProbabilisticVerdict = 'no_match' | 'low' | 'suggest' | 'auto';

export function classifyProbabilistic(similarity: number): ProbabilisticVerdict {
  if (similarity < 0.5) return 'no_match';
  if (similarity < 0.7) return 'low';
  if (similarity < 0.85) return 'suggest';
  return 'auto';
}

// ─── IP / UA normalisation ────────────────────────────────────────────────

/**
 * Convert a raw IP to a /24 prefix (IPv4) or /48 prefix (IPv6) string.
 * Coarse enough to avoid storing PII while still identifying household /
 * office colocation.
 *
 * Examples:
 *   192.0.2.34   → "192.0.2"
 *   2001:db8:abcd::1 → "2001:db8:abcd"
 */
export function ipToPrefix(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;
  if (trimmed.includes(':')) {
    // IPv6 — first three groups
    const parts = trimmed.split(':').filter((p) => p.length > 0);
    if (parts.length < 3) return null;
    return parts.slice(0, 3).join(':');
  }
  const parts = trimmed.split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  return parts.slice(0, 3).join('.');
}

/** SHA-256 hash truncated to first 32 hex chars (128 bits — enough for collision avoidance). */
export function shortHash(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return createHash('sha256').update(trimmed).digest('hex').slice(0, 32);
}

/**
 * Build a `screenSig` string "{width}x{height}@{dpr}" with all values
 * clamped to sensible buckets so 1920×1080 + 1921×1080 don't break match.
 * Returns null when any required field is missing.
 */
export function buildScreenSig(input: {
  width?: number;
  height?: number;
  dpr?: number;
}): string | null {
  const { width, height, dpr } = input;
  if (!width || !height) return null;
  const bucket = (n: number) => Math.round(n / 10) * 10;
  const d = dpr && dpr > 0 ? Math.round(dpr * 10) / 10 : 1;
  return `${bucket(width)}x${bucket(height)}@${d}`;
}

/** Extract the primary locale tag from an Accept-Language header value. */
export function extractLocale(acceptLanguage: string | null | undefined): string | null {
  if (!acceptLanguage) return null;
  const first = acceptLanguage.split(',')[0]?.trim();
  if (!first) return null;
  // "en-US;q=0.9" → "en-US"
  const tag = first.split(';')[0]?.trim();
  if (!tag) return null;
  // Restrict to letters + hyphen + digits
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(tag)) return null;
  return tag.length > 16 ? tag.slice(0, 16) : tag;
}

/**
 * Compose a full fingerprint from a raw request snapshot. Used by the
 * orchestrator + the route layer so we have one canonical pipeline.
 */
export function buildFingerprint(input: {
  ip?: string | null;
  userAgent?: string | null;
  acceptLanguage?: string | null;
  width?: number;
  height?: number;
  dpr?: number;
}): VisitorFingerprint {
  const locale = extractLocale(input.acceptLanguage);
  return {
    ipPrefix: ipToPrefix(input.ip ?? null),
    userAgentHash: shortHash(input.userAgent ?? null),
    acceptLanguageHash: shortHash(input.acceptLanguage ?? null),
    locale,
    screenSig: buildScreenSig({
      width: input.width,
      height: input.height,
      dpr: input.dpr,
    }),
  };
}
