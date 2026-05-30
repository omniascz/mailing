/**
 * Engagement Score — pure math (§9 P1 proprietary engagement metric).
 *
 * Cross-channel composite 0-100 score answering "how alive is this contact
 * across every channel we touch them on?" Distinct from:
 *   • RFM — commerce-only (recency, frequency, monetary)
 *   • Channel Score — per-channel best-fit picker
 *   • Predictive — forward-looking (CLV, churn, purchase likelihood)
 *
 * Engagement Score is backward-looking + reactive: a contact who replied
 * to SMS yesterday + clicked an email last week + visited the site twice
 * = highly engaged regardless of purchase history.
 *
 * Used by:
 *   • Segment builder — `engagement_score >= 70` / `engagement_band = ...`
 *   • Auto-suppression — pause sends to `dormant` + `cold` after N tries
 *   • Smart Sending — frequency cap differs per band
 *   • Smart channel selector — tie-breaker when channel scores are close
 */

export type EngagementBand =
  | 'highly_engaged'
  | 'engaged'
  | 'at_risk'
  | 'dormant'
  | 'cold';

export interface EngagementFacts {
  // Email
  emailSends: number;
  emailOpens: number;
  emailClicks: number;
  daysSinceLastEmailEngagement: number | null;
  // SMS
  smsSends: number;
  smsReplies: number;
  daysSinceLastSmsReply: number | null;
  // Voice (calls)
  voiceCalls: number;
  voiceAnswered: number;
  daysSinceLastVoiceAnswer: number | null;
  // Push
  pushSends: number;
  pushClicks: number;
  daysSinceLastPushClick: number | null;
  // Web (site tracking)
  pageViews: number;
  identifiedPageViews: number;
  daysSinceLastPageView: number | null;
  // Commerce
  totalOrders: number;
  totalCartEvents: number;
  daysSinceLastOrder: number | null;
}

export interface EngagementResult {
  /** 0-100 composite. */
  score: number;
  band: EngagementBand;
  /** Per-component subscore breakdown for the UI tooltip. */
  components: {
    email: number;
    sms: number;
    voice: number;
    push: number;
    web: number;
    commerce: number;
  };
}

// ─── Band thresholds ──────────────────────────────────────────────────────

const BAND_THRESHOLDS: Array<{ band: EngagementBand; min: number }> = [
  { band: 'highly_engaged', min: 70 },
  { band: 'engaged', min: 40 },
  { band: 'at_risk', min: 20 },
  { band: 'dormant', min: 5 },
  { band: 'cold', min: 0 },
];

export function classifyBand(score: number): EngagementBand {
  for (const t of BAND_THRESHOLDS) {
    if (score >= t.min) return t.band;
  }
  return 'cold';
}

// ─── Subscore helpers ─────────────────────────────────────────────────────

const RECENCY_HALF_LIFE_DAYS = 30;

function recencyMultiplier(days: number | null): number {
  if (days === null) return 0;
  return Math.pow(0.5, Math.max(0, days) / RECENCY_HALF_LIFE_DAYS);
}

function volumeConfidence(events: number): number {
  if (events === 0) return 0;
  // log curve, asymptotic to 1 at ~50 events. Matches Channel Score's curve
  // so the two metrics scale comparably.
  return Math.min(1, Math.log10(events + 1) / Math.log10(51));
}

/**
 * Score one channel 0-100 from (sends, engagements, daysSinceLast).
 * Identical shape to Channel Score's scoreChannel but tuned for the
 * composite: we don't multiply by reachability here because composite
 * just wants signal strength regardless of whether future sends would
 * succeed.
 */
function scoreSubchannel(
  sends: number,
  engagements: number,
  daysSinceLast: number | null,
): number {
  if (sends === 0 && engagements === 0 && daysSinceLast === null) return 0;
  const rate = sends > 0 ? Math.min(1, engagements / sends) : 0;
  const volume = volumeConfidence(sends + engagements);
  const recency = recencyMultiplier(daysSinceLast);
  const blended = rate * 0.5 + volume * 0.2 + recency * 0.3;
  return Math.round(Math.min(1, Math.max(0, blended)) * 100);
}

/** Web subscore — heavier weight on identified visits (known contact). */
function scoreWeb(facts: EngagementFacts): number {
  const totalViews = facts.pageViews + facts.identifiedPageViews * 2;
  if (totalViews === 0) return 0;
  const volume = volumeConfidence(totalViews);
  const recency = recencyMultiplier(facts.daysSinceLastPageView);
  const blended = volume * 0.5 + recency * 0.5;
  return Math.round(blended * 100);
}

/** Commerce subscore — orders weigh heaviest, cart events as soft signal. */
function scoreCommerce(facts: EngagementFacts): number {
  if (facts.totalOrders === 0 && facts.totalCartEvents === 0) return 0;
  const volume = volumeConfidence(facts.totalOrders * 5 + facts.totalCartEvents);
  const recency = recencyMultiplier(facts.daysSinceLastOrder);
  const blended = volume * 0.55 + recency * 0.45;
  return Math.round(blended * 100);
}

// ─── Channel weights ──────────────────────────────────────────────────────
// These sum to 1.0. Email + commerce together dominate (most signal)
// while SMS/voice/push/web fill in cross-channel coverage.

const WEIGHTS = {
  email: 0.3,
  sms: 0.1,
  voice: 0.05,
  push: 0.05,
  web: 0.2,
  commerce: 0.3,
} as const;

// ─── Public API ───────────────────────────────────────────────────────────

export function scoreEngagement(facts: EngagementFacts): EngagementResult {
  // Email engagement = opens + clicks (clicks weighted heavier).
  const email = scoreSubchannel(
    facts.emailSends,
    facts.emailOpens + facts.emailClicks * 2,
    facts.daysSinceLastEmailEngagement,
  );
  const sms = scoreSubchannel(facts.smsSends, facts.smsReplies, facts.daysSinceLastSmsReply);
  const voice = scoreSubchannel(
    facts.voiceCalls,
    facts.voiceAnswered,
    facts.daysSinceLastVoiceAnswer,
  );
  const push = scoreSubchannel(facts.pushSends, facts.pushClicks, facts.daysSinceLastPushClick);
  const web = scoreWeb(facts);
  const commerce = scoreCommerce(facts);

  const composite = Math.round(
    email * WEIGHTS.email +
      sms * WEIGHTS.sms +
      voice * WEIGHTS.voice +
      push * WEIGHTS.push +
      web * WEIGHTS.web +
      commerce * WEIGHTS.commerce,
  );

  const score = Math.max(0, Math.min(100, composite));
  return {
    score,
    band: classifyBand(score),
    components: { email, sms, voice, push, web, commerce },
  };
}

/**
 * Empty-input helper — useful for tests + new orgs without any events.
 * Returns a `cold`-band zero score rather than null so segment queries
 * filtering by band always include freshly-bootstrapped contacts.
 */
export function emptyFacts(): EngagementFacts {
  return {
    emailSends: 0,
    emailOpens: 0,
    emailClicks: 0,
    daysSinceLastEmailEngagement: null,
    smsSends: 0,
    smsReplies: 0,
    daysSinceLastSmsReply: null,
    voiceCalls: 0,
    voiceAnswered: 0,
    daysSinceLastVoiceAnswer: null,
    pushSends: 0,
    pushClicks: 0,
    daysSinceLastPushClick: null,
    pageViews: 0,
    identifiedPageViews: 0,
    daysSinceLastPageView: null,
    totalOrders: 0,
    totalCartEvents: 0,
    daysSinceLastOrder: null,
  };
}
