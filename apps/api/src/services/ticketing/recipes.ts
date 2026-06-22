/**
 * Ticketing recipe catalog — the 7 feature groups mapped to the concrete
 * ForgeMsg machinery that powers each, plus the ticketing trigger that starts
 * them. This is both documentation-in-code and a registry a UI/onboarding flow
 * can render ("turn on Abandoned-cart recovery"). The marketing logic lives in
 * ForgeMsg; the ticketing app only emits the `trigger` events.
 */

export type RecipeStatus = 'engine' | 'reuse';

export interface TicketingRecipe {
  key: string;
  group: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  title: string;
  /** Ticketing event(s) that start it (see services/ticketing/ingest types). */
  triggers: string[];
  /** ForgeMsg modules that do the work. */
  modules: string[];
  /** 'engine' = ticketing-specific logic built here; 'reuse' = existing module. */
  status: RecipeStatus;
}

export const TICKETING_RECIPES: TicketingRecipe[] = [
  // 1) Yield — fill the house
  {
    key: 'fill_the_house',
    group: 1,
    title: 'Fill-the-house cascade for unsold seats',
    triggers: ['event_upsert'], // carries unsoldSeats
    modules: ['ticketing/fill-the-house', 'workflows', 'segments', 'countdown', 'channels'],
    status: 'engine',
  },
  {
    key: 'price_drop_alert',
    group: 1,
    title: 'Price-drop / back-in-stock alert',
    triggers: ['event_upsert'],
    modules: ['price-drop', 'back-in-stock', 'workflows'],
    status: 'reuse',
  },
  // 2) Lifecycle
  {
    key: 'post_event_review',
    group: 2,
    title: 'Post-event thank-you + NPS/review + next-show cross-sell',
    triggers: ['event_attended'],
    modules: ['surveys', 'ticketing/recommendations', 'workflows'],
    status: 'engine',
  },
  {
    key: 'win_back',
    group: 2,
    title: 'Win-back dormant attendees',
    triggers: ['(cron) churn model'],
    modules: ['predictive-segmentation (churn)', 'segments', 'workflows'],
    status: 'reuse',
  },
  {
    key: 'renewal_dunning',
    group: 2,
    title: 'Season-pass renewal / past-due dunning',
    triggers: ['subscription_past_due'],
    modules: ['workflows', 'channels'],
    status: 'reuse',
  },
  // 3) AI personalization
  {
    key: 'discover_digest',
    group: 3,
    title: 'Personalized "Discover" digest (co-attendance recs)',
    triggers: ['(cron) weekly'],
    modules: ['ticketing/recommendations', 'per-recipient-generation', 'send-optimization (STO)'],
    status: 'engine',
  },
  {
    key: 'nba_send_time',
    group: 3,
    title: 'Next-best-action + per-contact send-time',
    triggers: ['(any campaign)'],
    modules: ['ai/nba-engine', 'send-optimization/per-contact-sto', 'ai/subject-line-scorer'],
    status: 'reuse',
  },
  // 4) Day-of orchestration
  {
    key: 'day_of_journey',
    group: 4,
    title: 'Day-of journey: -24h email → -2h SMS QR → post-event push',
    triggers: ['(cron) over event start times'],
    modules: ['ticketing/day-of', 'channels', 'channel-fallback'],
    status: 'engine',
  },
  {
    key: 'event_change_blast',
    group: 4,
    title: 'Event cancelled/rescheduled/venue-change blast',
    triggers: ['event_changed'],
    modules: ['ticketing/fill-the-house (audience)', 'channels', 'workflows'],
    status: 'reuse',
  },
  // 5) B2B for theaters
  {
    key: 'co_marketing',
    group: 5,
    title: 'Cross-promote between theaters (revenue share)',
    triggers: ['(promoter opt-in)'],
    modules: ['co-marketing', 'segments'],
    status: 'reuse',
  },
  {
    key: 'newsletter_monetization',
    group: 5,
    title: 'Sponsored placements in promoter newsletters',
    triggers: ['(promoter)'],
    modules: ['newsletter-ads', 'newsletter-paywall'],
    status: 'reuse',
  },
  {
    key: 'audience_insights',
    group: 5,
    title: 'RFM / CLV / churn audience insights for promoters',
    triggers: ['(dashboard)'],
    modules: ['rfm', 'predictive-segmentation', 'analytics'],
    status: 'reuse',
  },
  // 6) Acquisition / growth
  {
    key: 'abandoned_cart',
    group: 6,
    title: 'Abandoned-cart recovery',
    triggers: ['cart_abandoned'],
    modules: ['workflows', 'channels'],
    status: 'reuse',
  },
  {
    key: 'referral',
    group: 6,
    title: 'Referral — bring a friend',
    triggers: ['order_paid'],
    modules: ['newsletter-referrals', 'workflows'],
    status: 'reuse',
  },
  {
    key: 'waitlist_lottery',
    group: 6,
    title: 'Waitlist freed / lottery winner notify',
    triggers: ['waitlist_freed', 'lottery_won'],
    modules: ['workflows', 'channels', 'countdown'],
    status: 'reuse',
  },
  // 7) Signature
  {
    key: 'memories',
    group: 7,
    title: 'Post-event "Memories" + commemorative',
    triggers: ['event_attended'],
    modules: ['editor', 'digital-assets', 'channels'],
    status: 'reuse',
  },
  {
    key: 'amp_interactive',
    group: 7,
    title: 'AMP interactive (seat pick / RSVP / survey in email)',
    triggers: ['(any campaign)'],
    modules: ['editor/amp', 'surveys'],
    status: 'reuse',
  },
];

/** Recipes started by a given ticketing ingest event type. */
export function recipesForTrigger(triggerType: string): TicketingRecipe[] {
  return TICKETING_RECIPES.filter((r) => r.triggers.includes(triggerType));
}

/** Group → recipes, for rendering the catalog by feature group. */
export function recipesByGroup(): Record<number, TicketingRecipe[]> {
  const out: Record<number, TicketingRecipe[]> = {};
  for (const r of TICKETING_RECIPES) (out[r.group] ??= []).push(r);
  return out;
}
