/**
 * Channel scoring — pure math (§9 P1 Channel Scoring per recipient).
 *
 * For each channel we score 0–100 based on:
 *   • engagement rate (opens or clicks or replies / sends)
 *   • absolute volume (capped — one open ≠ proven channel)
 *   • recency decay (last 90 days weighted higher than older)
 *   • channel availability (token/phone/consent present?)
 *
 * The orchestrator collects per-channel facts from email_events,
 * sms_send_log, calls, whatsapp_conversations and push_send_log,
 * then hands them here for a deterministic score. The score is
 * cached on contact_engagement so the smart_channel workflow node
 * doesn't recompute on every send.
 */

export type ChannelKind = 'email' | 'sms' | 'whatsapp' | 'voice' | 'push';

export const CHANNEL_KINDS: readonly ChannelKind[] = [
  'email',
  'sms',
  'whatsapp',
  'voice',
  'push',
] as const;

export interface ChannelFacts {
  /** Total sends in window. */
  sends: number;
  /** Engagements: opens for email, replies for SMS, reads for WhatsApp,
   *  answers for voice, clicks for push. */
  engagements: number;
  /** Days since the most recent engagement (null if none). */
  daysSinceLastEngagement: number | null;
  /** Whether the channel is reachable for this contact at all
   *  (consent + token/phone present). */
  reachable: boolean;
}

export interface ChannelScores {
  email: number | null;
  sms: number | null;
  whatsapp: number | null;
  voice: number | null;
  push: number | null;
}

export interface ChannelFactsBundle {
  email: ChannelFacts;
  sms: ChannelFacts;
  whatsapp: ChannelFacts;
  voice: ChannelFacts;
  push: ChannelFacts;
}

const RECENCY_HALF_LIFE_DAYS = 30; // engagement half-life

/**
 * Score a single channel 0–100 (or null when not reachable + zero data —
 * `unscored`). Roughly: engagement rate × volume confidence × recency.
 *
 * Returns null only when the channel is unreachable AND has no historical
 * sends. That lets the orchestrator distinguish "we tried but it failed"
 * (low score) from "we never had a way to reach this contact".
 */
export function scoreChannel(facts: ChannelFacts): number | null {
  if (!facts.reachable && facts.sends === 0) return null;

  // 1. engagement rate — uncapped 0..1
  const rate = facts.sends > 0 ? Math.min(1, facts.engagements / facts.sends) : 0;

  // 2. volume confidence — log curve, asymptotic to 1 at ~50 sends. One
  //    open out of one send is suspicious; 10/10 less so; 50/50 trustworthy.
  const volume = facts.sends === 0 ? 0 : Math.min(1, Math.log10(facts.sends + 1) / Math.log10(51));

  // 3. recency decay — half-life ~30 days. Older engagement is real but
  //    not load-bearing for "today, what channel to use?".
  const recency =
    facts.daysSinceLastEngagement === null
      ? 0
      : Math.pow(0.5, facts.daysSinceLastEngagement / RECENCY_HALF_LIFE_DAYS);

  // 4. reachability — if the channel can't deliver right now, halve the
  //    score. We don't zero it because a reactivated push token can flip
  //    `reachable` back to true and we want the prior engagement to count.
  const reachabilityMultiplier = facts.reachable ? 1 : 0.5;

  const blended = rate * 0.55 + volume * 0.2 + recency * 0.25;
  const score = Math.round(blended * 100 * reachabilityMultiplier);
  return Math.max(0, Math.min(100, score));
}

export function scoreAllChannels(bundle: ChannelFactsBundle): ChannelScores {
  return {
    email: scoreChannel(bundle.email),
    sms: scoreChannel(bundle.sms),
    whatsapp: scoreChannel(bundle.whatsapp),
    voice: scoreChannel(bundle.voice),
    push: scoreChannel(bundle.push),
  };
}

/**
 * Pick the highest-scoring channel. Returns null when every channel is
 * unreachable + unscored. Ties broken by the CHANNEL_KINDS order
 * (email > sms > whatsapp > voice > push) which roughly mirrors cost
 * and creep order.
 */
export function pickPreferredChannel(scores: ChannelScores): ChannelKind | null {
  let best: ChannelKind | null = null;
  let bestScore = -1;
  for (const kind of CHANNEL_KINDS) {
    const s = scores[kind];
    if (s === null) continue;
    if (s > bestScore) {
      bestScore = s;
      best = kind;
    }
  }
  return best;
}

/**
 * Confidence band derived from the spread between #1 and #2 channels.
 * Used by the smart_channel node to decide whether to A/B between two
 * close channels or commit fully to the leader.
 */
export type ConfidenceBand = 'high' | 'medium' | 'low' | 'none';

export function confidenceBand(scores: ChannelScores): ConfidenceBand {
  const values = CHANNEL_KINDS.map((k) => scores[k]).filter(
    (v): v is number => v !== null,
  );
  if (values.length === 0) return 'none';
  values.sort((a, b) => b - a);
  const top = values[0]!;
  const second = values[1] ?? 0;
  const gap = top - second;
  if (top < 10) return 'low';
  if (gap >= 20) return 'high';
  if (gap >= 8) return 'medium';
  return 'low';
}

/**
 * Days-since-event helper exported so the orchestrator and tests share
 * exactly one definition.
 */
export function daysSince(date: Date | null, now: Date = new Date()): number | null {
  if (!date) return null;
  const ms = now.getTime() - date.getTime();
  if (ms < 0) return 0;
  return ms / 86_400_000;
}
