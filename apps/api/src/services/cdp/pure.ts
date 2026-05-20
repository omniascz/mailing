/**
 * CDP pure helpers (#264/#402).
 *
 * Identity-signal normalisation + confidence scoring + trait aggregation.
 * Pulled out of `identity-graph.ts` / `unified-profile.ts` for unit tests
 * that don't need the DB.
 */

import { createHash } from 'node:crypto';

export type SignalType =
  | 'email'
  | 'phone'
  | 'cookie'
  | 'device_id'
  | 'visitor_id'
  | 'social_id'
  | 'account_id'
  | 'user_id'
  | 'hashed_id';

/**
 * Bring a signal value to canonical form so `User@EXAMPLE.com` and
 * `user@example.com` map to the same graph edge. `hashed_id` accepts
 * either already-hashed values or raw strings to be SHA-256 hashed.
 */
export function normaliseSignal(type: SignalType, value: string): string {
  const v = value.trim();
  switch (type) {
    case 'email':
      return v.toLowerCase();
    case 'phone':
      return v.replace(/[^+\d]/g, '');
    case 'hashed_id':
      return /^[a-f0-9]{64}$/i.test(v)
        ? v.toLowerCase()
        : createHash('sha256').update(v.toLowerCase()).digest('hex');
    case 'cookie':
    case 'device_id':
    case 'visitor_id':
    case 'social_id':
    case 'account_id':
    case 'user_id':
      return v;
  }
}

/**
 * Default confidence for each signal type (0-100). Higher = stronger
 * indicator of unique identity. Callers can override per-signal.
 */
export const DEFAULT_SIGNAL_CONFIDENCE: Record<SignalType, number> = {
  user_id: 95,
  account_id: 90,
  email: 85,
  phone: 80,
  hashed_id: 75,
  social_id: 70,
  device_id: 60,
  cookie: 40,
  visitor_id: 30,
};

export function signalConfidence(type: SignalType, override?: number): number {
  if (override !== undefined) return Math.max(0, Math.min(100, override));
  return DEFAULT_SIGNAL_CONFIDENCE[type];
}

// ─── Profile merge scoring ──────────────────────────────────────────────────

export interface IdentityEdge {
  type: SignalType;
  value: string;
  confidence: number;
}

/**
 * Decide whether two contact profiles should be auto-merged based on
 * overlapping identity edges. We require a combined confidence ≥ threshold.
 */
export function shouldMergeProfiles(
  left: IdentityEdge[],
  right: IdentityEdge[],
  threshold = 150,
): { merge: boolean; score: number; overlap: IdentityEdge[] } {
  const leftMap = new Map<string, IdentityEdge>();
  for (const e of left) {
    leftMap.set(`${e.type}:${normaliseSignal(e.type, e.value)}`, e);
  }
  const overlap: IdentityEdge[] = [];
  let score = 0;
  for (const e of right) {
    const key = `${e.type}:${normaliseSignal(e.type, e.value)}`;
    const lhs = leftMap.get(key);
    if (lhs) {
      overlap.push(e);
      score += Math.min(lhs.confidence, e.confidence);
    }
  }
  return { merge: score >= threshold, score, overlap };
}

// ─── Trait aggregation ─────────────────────────────────────────────────────

export interface TraitValue {
  source: string;
  value: unknown;
  updatedAt: Date;
  /** Source-level confidence 0-100 */
  confidence?: number;
}

/**
 * For a single trait collected from multiple sources, pick the winning
 * value. Strategy: highest confidence, ties broken by most recent `updatedAt`.
 * Returns null when no values.
 */
export function resolveTrait(values: TraitValue[]): TraitValue | null {
  if (values.length === 0) return null;
  return (
    [...values].sort((a, b) => {
      const ac = a.confidence ?? 50;
      const bc = b.confidence ?? 50;
      if (ac !== bc) return bc - ac;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })[0] ?? null
  );
}
