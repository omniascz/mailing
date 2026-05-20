/**
 * Workflow template registry (Sprint E.3).
 *
 * Templates live in code rather than the DB because:
 *  - they're immutable — no per-org edits, only forks
 *  - shipping them as TS lets us typecheck node configs against NodeType
 *  - new recipes ship with releases; no migration churn
 *
 * Each template is a self-contained recipe with trigger + node graph.
 * Forking copies nodes/edges into a real `workflows` row.
 */

import type { WorkflowNode, WorkflowEdge } from '../../db/schema/workflows.js';

export type TemplateCategory =
  | 'welcome'
  | 'abandoned_cart'
  | 'post_purchase'
  | 'winback'
  | 'birthday'
  | 'browse_abandonment'
  | 'vip_loyalty'
  | 'lead_nurture'
  | 'event'
  | 'feedback_nps'
  | 'cross_sell'
  | 'onboarding'
  | 'churn_prevention'
  | 'date_triggered'
  | 'subscription_renewal';

export interface WorkflowTemplate {
  /** Stable URL-safe identifier */
  slug: string;
  name: string;
  category: TemplateCategory;
  description: string;
  /** Audience this template is recommended for (e.g. e-com, B2B SaaS) */
  recommendedFor: string[];
  /** ISO 639-1 base locale ('en', 'cs', 'sk'). Multi-locale forks generate
   *  one workflow per locale at fork time. */
  locale: 'en' | 'cs' | 'sk';
  /** Estimated steps a contact will receive on the happy path */
  steps: number;
  /** Maps to workflow.triggerType + triggerConfig */
  trigger: { type: string; config: Record<string, unknown> };
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/** Helpers to keep recipe definitions terse. */
const n = (
  id: string,
  type: WorkflowNode['type'],
  config: Record<string, unknown>,
): WorkflowNode => ({ id, type, config });
const e = (id: string, source: string, target: string, label?: string): WorkflowEdge => ({
  id,
  source,
  target,
  label,
});
const wait = (id: string, days: number, hours = 0): WorkflowNode =>
  n(id, 'wait', { duration: { days, hours } });
const email = (id: string, subject: string, templateRef?: string): WorkflowNode =>
  n(id, 'send_email', { subject, templateRef });

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // ─── Welcome series ─────────────────────────────────────────────────────────
  {
    slug: 'welcome-3-step-en',
    name: 'Welcome series — 3 emails',
    category: 'welcome',
    description: 'Classic welcome: greeting now, value delivery on day 2, soft offer on day 5.',
    recommendedFor: ['ecommerce', 'saas', 'newsletter'],
    locale: 'en',
    steps: 3,
    trigger: { type: 'list_subscribe', config: {} },
    nodes: [
      n('t', 'trigger', { triggerType: 'list_subscribe' }),
      email('e1', 'Welcome to the family'),
      wait('w1', 2),
      email('e2', "Here's what to do next"),
      wait('w2', 3),
      email('e3', 'A small thank-you gift'),
    ],
    edges: [
      e('e0', 't', 'e1'),
      e('e_e1', 'e1', 'w1'),
      e('e_w1', 'w1', 'e2'),
      e('e_e2', 'e2', 'w2'),
      e('e_w2', 'w2', 'e3'),
    ],
  },
  {
    slug: 'welcome-3-step-cs',
    name: 'Uvítací série — 3 emaily',
    category: 'welcome',
    description: 'Klasická uvítací sekvence v češtině s respektem ke 7 pádům jména.',
    recommendedFor: ['ecommerce', 'saas', 'newsletter'],
    locale: 'cs',
    steps: 3,
    trigger: { type: 'list_subscribe', config: {} },
    nodes: [
      n('t', 'trigger', { triggerType: 'list_subscribe' }),
      email('e1', 'Vítejte mezi námi'),
      wait('w1', 2),
      email('e2', 'Co s námi můžete dělat'),
      wait('w2', 3),
      email('e3', 'Malý dárek na úvod'),
    ],
    edges: [
      e('e0', 't', 'e1'),
      e('e_e1', 'e1', 'w1'),
      e('e_w1', 'w1', 'e2'),
      e('e_e2', 'e2', 'w2'),
      e('e_w2', 'w2', 'e3'),
    ],
  },

  // ─── Abandoned cart ─────────────────────────────────────────────────────────
  {
    slug: 'abandoned-cart-3-touch',
    name: 'Abandoned cart — 3 touches',
    category: 'abandoned_cart',
    description: 'Reminder at 1 hour, urgency at 24 hours, last-chance discount at 72 hours.',
    recommendedFor: ['ecommerce'],
    locale: 'en',
    steps: 3,
    trigger: { type: 'api_event', config: { eventName: 'cart_abandoned' } },
    nodes: [
      n('t', 'trigger', { triggerType: 'api_event', eventName: 'cart_abandoned' }),
      wait('w0', 0, 1),
      email('e1', 'You left something behind'),
      wait('w1', 1),
      email('e2', "Still thinking? Here's a quick reminder"),
      wait('w2', 2),
      email('e3', 'Last chance — 10% off ends tonight'),
    ],
    edges: [
      e('e0', 't', 'w0'),
      e('e1', 'w0', 'e1'),
      e('e2', 'e1', 'w1'),
      e('e3', 'w1', 'e2'),
      e('e4', 'e2', 'w2'),
      e('e5', 'w2', 'e3'),
    ],
  },
  {
    slug: 'abandoned-cart-sms-cascade',
    name: 'Abandoned cart — Email → SMS cascade',
    category: 'abandoned_cart',
    description: 'Email at 1 hour, SMS escalation at 24 hours if cart still abandoned.',
    recommendedFor: ['ecommerce'],
    locale: 'en',
    steps: 2,
    trigger: { type: 'api_event', config: { eventName: 'cart_abandoned' } },
    nodes: [
      n('t', 'trigger', { triggerType: 'api_event', eventName: 'cart_abandoned' }),
      wait('w0', 0, 1),
      email('e1', 'You left something in your cart'),
      wait('w1', 1),
      n('c1', 'condition', { rule: { type: 'cart_still_abandoned' } }),
      n('s1', 'send_sms', { body: 'Your cart is waiting — finish checkout: {{cart.url}}' }),
    ],
    edges: [
      e('e0', 't', 'w0'),
      e('e1', 'w0', 'e1'),
      e('e2', 'e1', 'w1'),
      e('e3', 'w1', 'c1'),
      e('e4', 'c1', 's1', 'true'),
    ],
  },

  // ─── Post-purchase ──────────────────────────────────────────────────────────
  {
    slug: 'post-purchase-thanks-review',
    name: 'Post-purchase: Thanks + Review request',
    category: 'post_purchase',
    description: 'Thank-you within an hour, shipping prep day 2, review ask 10 days after.',
    recommendedFor: ['ecommerce'],
    locale: 'en',
    steps: 3,
    trigger: { type: 'purchase_event', config: {} },
    nodes: [
      n('t', 'trigger', { triggerType: 'purchase_event' }),
      email('e1', 'Thanks for your order!'),
      wait('w1', 1),
      email('e2', 'Your order is on its way'),
      wait('w2', 10),
      email('e3', 'How was your order?'),
    ],
    edges: [
      e('e0', 't', 'e1'),
      e('e1', 'e1', 'w1'),
      e('e2', 'w1', 'e2'),
      e('e3', 'e2', 'w2'),
      e('e4', 'w2', 'e3'),
    ],
  },

  // ─── Win-back ───────────────────────────────────────────────────────────────
  {
    slug: 'winback-90-day',
    name: 'Win-back — 90 days inactive',
    category: 'winback',
    description: 'Gentle re-engagement after 90 days of no opens. Two emails plus a sunset offer.',
    recommendedFor: ['newsletter', 'ecommerce'],
    locale: 'en',
    steps: 3,
    trigger: { type: 'date_field', config: { field: 'last_open_at', daysSince: 90 } },
    nodes: [
      n('t', 'trigger', { triggerType: 'date_field', field: 'last_open_at', daysSince: 90 }),
      email('e1', 'We miss you'),
      wait('w1', 7),
      n('c1', 'condition', { rule: { type: 'opened_email_within', days: 7 } }),
      email('e2', '20% off if you come back this week'),
      wait('w2', 14),
      n('s1', 'move_to_list', { listSlug: 'sunset' }),
    ],
    edges: [
      e('e0', 't', 'e1'),
      e('e1', 'e1', 'w1'),
      e('e2', 'w1', 'c1'),
      e('e3', 'c1', 'e2', 'false'),
      e('e4', 'e2', 'w2'),
      e('e5', 'w2', 's1'),
    ],
  },

  // ─── Birthday ───────────────────────────────────────────────────────────────
  {
    slug: 'birthday-discount',
    name: 'Birthday discount',
    category: 'birthday',
    description: "Send a 15% discount code on the contact's birthday (3 days before for reminder).",
    recommendedFor: ['ecommerce', 'fitness', 'beauty'],
    locale: 'en',
    steps: 2,
    trigger: { type: 'date_field', config: { field: 'birthday', daysBefore: 3 } },
    nodes: [
      n('t', 'trigger', { triggerType: 'date_field', field: 'birthday', daysBefore: 3 }),
      email('e1', "Happy birthday week — here's 15% off"),
      wait('w1', 3),
      email('e2', 'Today is your day!'),
    ],
    edges: [e('e0', 't', 'e1'), e('e1', 'e1', 'w1'), e('e2', 'w1', 'e2')],
  },

  // ─── Browse abandonment ─────────────────────────────────────────────────────
  {
    slug: 'browse-abandonment-2-touch',
    name: 'Browse abandonment — 2 touches',
    category: 'browse_abandonment',
    description: 'Triggered when contact viewed product 3+ times without purchase.',
    recommendedFor: ['ecommerce'],
    locale: 'en',
    steps: 2,
    trigger: { type: 'api_event', config: { eventName: 'product_viewed_3x' } },
    nodes: [
      n('t', 'trigger', { triggerType: 'api_event', eventName: 'product_viewed_3x' }),
      wait('w0', 0, 4),
      email('e1', 'Still interested in {{product.name}}?'),
      wait('w1', 2),
      email('e2', 'Reviews from people who bought {{product.name}}'),
    ],
    edges: [e('e0', 't', 'w0'), e('e1', 'w0', 'e1'), e('e2', 'e1', 'w1'), e('e3', 'w1', 'e2')],
  },

  // ─── VIP / loyalty ──────────────────────────────────────────────────────────
  {
    slug: 'vip-tier-upgrade',
    name: 'VIP — Loyalty tier upgrade',
    category: 'vip_loyalty',
    description: 'Welcome the contact to their new VIP tier with perks summary.',
    recommendedFor: ['ecommerce', 'saas'],
    locale: 'en',
    steps: 2,
    trigger: { type: 'loyalty_tier_up', config: {} },
    nodes: [
      n('t', 'trigger', { triggerType: 'loyalty_tier_up' }),
      email('e1', 'Welcome to {{loyalty.tier}}'),
      wait('w1', 7),
      email('e2', 'Try your new {{loyalty.tier}} perks'),
    ],
    edges: [e('e0', 't', 'e1'), e('e1', 'e1', 'w1'), e('e2', 'w1', 'e2')],
  },

  // ─── Lead nurture (B2B) ─────────────────────────────────────────────────────
  {
    slug: 'lead-nurture-saas-trial',
    name: 'SaaS trial nurture — 14 days',
    category: 'lead_nurture',
    description:
      '5-touch nurture for a 14-day SaaS trial: onboarding, value, social proof, ROI, conversion ask.',
    recommendedFor: ['saas', 'b2b'],
    locale: 'en',
    steps: 5,
    trigger: { type: 'api_event', config: { eventName: 'trial_started' } },
    nodes: [
      n('t', 'trigger', { triggerType: 'api_event', eventName: 'trial_started' }),
      email('e1', "Welcome — let's get you set up"),
      wait('w1', 2),
      email('e2', 'How customers use {{product.name}}'),
      wait('w2', 3),
      email('e3', 'Case study: 40% productivity gain'),
      wait('w3', 4),
      email('e4', 'Your ROI calculator'),
      wait('w4', 4),
      email('e5', "Ready to upgrade? Here's 20% off your first month"),
    ],
    edges: [
      e('e0', 't', 'e1'),
      e('e1', 'e1', 'w1'),
      e('e2', 'w1', 'e2'),
      e('e3', 'e2', 'w2'),
      e('e4', 'w2', 'e3'),
      e('e5', 'e3', 'w3'),
      e('e6', 'w3', 'e4'),
      e('e7', 'e4', 'w4'),
      e('e8', 'w4', 'e5'),
    ],
  },

  // ─── Event ──────────────────────────────────────────────────────────────────
  {
    slug: 'event-webinar-reminder',
    name: 'Webinar registration reminder',
    category: 'event',
    description: 'Confirmation, day-before reminder, hour-before reminder, post-event recap.',
    recommendedFor: ['saas', 'b2b', 'events'],
    locale: 'en',
    steps: 4,
    trigger: { type: 'form_submit', config: { formSlug: 'webinar-registration' } },
    nodes: [
      n('t', 'trigger', { triggerType: 'form_submit', formSlug: 'webinar-registration' }),
      email('e1', "You're registered: {{event.name}}"),
      n('w1', 'wait', { until: { field: 'event.starts_at', offsetHours: -24 } }),
      email('e2', 'Tomorrow: {{event.name}}'),
      n('w2', 'wait', { until: { field: 'event.starts_at', offsetHours: -1 } }),
      email('e3', 'Starting in 1 hour'),
      n('w3', 'wait', { until: { field: 'event.starts_at', offsetHours: 24 } }),
      email('e4', 'Recording + slides from {{event.name}}'),
    ],
    edges: [
      e('e0', 't', 'e1'),
      e('e1', 'e1', 'w1'),
      e('e2', 'w1', 'e2'),
      e('e3', 'e2', 'w2'),
      e('e4', 'w2', 'e3'),
      e('e5', 'e3', 'w3'),
      e('e6', 'w3', 'e4'),
    ],
  },

  // ─── Feedback / NPS ─────────────────────────────────────────────────────────
  {
    slug: 'nps-survey-30-day',
    name: 'NPS survey — 30 days post-purchase',
    category: 'feedback_nps',
    description:
      'Single-question NPS at 30 days post-purchase, branched follow-up for promoters vs detractors.',
    recommendedFor: ['ecommerce', 'saas'],
    locale: 'en',
    steps: 2,
    trigger: { type: 'date_field', config: { field: 'first_order_at', daysAfter: 30 } },
    nodes: [
      n('t', 'trigger', { triggerType: 'date_field', field: 'first_order_at', daysAfter: 30 }),
      email('e1', 'How likely are you to recommend us?'),
      wait('w1', 5),
      n('c1', 'condition', { rule: { type: 'nps_score_gte', value: 9 } }),
      email('e2', 'Thanks! Could you leave a public review?'),
      email('e3', "We'd love to make it right — quick reply?"),
    ],
    edges: [
      e('e0', 't', 'e1'),
      e('e1', 'e1', 'w1'),
      e('e2', 'w1', 'c1'),
      e('e3', 'c1', 'e2', 'true'),
      e('e4', 'c1', 'e3', 'false'),
    ],
  },

  // ─── Cross-sell ────────────────────────────────────────────────────────────
  {
    slug: 'cross-sell-related-products',
    name: 'Cross-sell — Related products 14 days post-purchase',
    category: 'cross_sell',
    description: 'Recommends related products 14 days after first purchase based on category.',
    recommendedFor: ['ecommerce'],
    locale: 'en',
    steps: 1,
    trigger: { type: 'purchase_event', config: {} },
    nodes: [
      n('t', 'trigger', { triggerType: 'purchase_event' }),
      wait('w1', 14),
      email('e1', 'You might also love these'),
    ],
    edges: [e('e0', 't', 'w1'), e('e1', 'w1', 'e1')],
  },

  // ─── Onboarding ────────────────────────────────────────────────────────────
  {
    slug: 'onboarding-saas-7-day',
    name: 'SaaS product onboarding — 7 days',
    category: 'onboarding',
    description: 'Activation-focused onboarding nudges based on feature usage.',
    recommendedFor: ['saas'],
    locale: 'en',
    steps: 4,
    trigger: { type: 'api_event', config: { eventName: 'signup_completed' } },
    nodes: [
      n('t', 'trigger', { triggerType: 'api_event', eventName: 'signup_completed' }),
      email('e1', 'Step 1: Invite your team'),
      wait('w1', 1),
      n('c1', 'condition', { rule: { type: 'feature_used', feature: 'team_invite' } }),
      email('e2', 'Step 2: Connect your data source'),
      wait('w2', 2),
      email('e3', 'Step 3: Set up your first automation'),
      wait('w3', 3),
      email('e4', "You're a power user now — here's what advanced users do"),
    ],
    edges: [
      e('e0', 't', 'e1'),
      e('e1', 'e1', 'w1'),
      e('e2', 'w1', 'c1'),
      e('e3', 'c1', 'e2', 'false'),
      e('e4', 'e2', 'w2'),
      e('e5', 'w2', 'e3'),
      e('e6', 'e3', 'w3'),
      e('e7', 'w3', 'e4'),
    ],
  },

  // ─── Churn prevention ──────────────────────────────────────────────────────
  {
    slug: 'churn-prevention-high-risk',
    name: 'Churn prevention — high-risk contacts',
    category: 'churn_prevention',
    description: 'Triggers when churn_risk crosses 0.7. Outreach email + manual rep follow-up.',
    recommendedFor: ['saas', 'subscription'],
    locale: 'en',
    steps: 2,
    trigger: { type: 'api_event', config: { eventName: 'churn_risk_high' } },
    nodes: [
      n('t', 'trigger', { triggerType: 'api_event', eventName: 'churn_risk_high' }),
      email('e1', 'Anything we can help with?'),
      wait('w1', 3),
      n('a1', 'assign_task', { taskType: 'churn-rescue-call' }),
    ],
    edges: [e('e0', 't', 'e1'), e('e1', 'e1', 'w1'), e('e2', 'w1', 'a1')],
  },

  // ─── Date-triggered (CZ jmeniny) ───────────────────────────────────────────
  {
    slug: 'cz-name-day-greeting',
    name: 'CZ jmeniny — name day greeting',
    category: 'date_triggered',
    description:
      "Sends a greeting on the contact's CZ name day (svátek). Auto-personalized 1st-name vocative.",
    recommendedFor: ['ecommerce', 'fitness', 'cz-sk-saas'],
    locale: 'cs',
    steps: 1,
    trigger: { type: 'name_day_today', config: {} },
    nodes: [
      n('t', 'trigger', { triggerType: 'name_day_today' }),
      email('e1', 'Vše nejlepší k svátku, {{contact.first_name|vocative}}!'),
    ],
    edges: [e('e0', 't', 'e1')],
  },
  {
    slug: 'cz-holiday-easter-week',
    name: 'CZ Velikonoce — týden před',
    category: 'date_triggered',
    description: 'Promotional email 7 days before Easter Monday (CZ public holiday).',
    recommendedFor: ['ecommerce', 'cz-sk'],
    locale: 'cs',
    steps: 1,
    trigger: { type: 'n_days_before_holiday', config: { holiday: 'easter_monday', daysBefore: 7 } },
    nodes: [
      n('t', 'trigger', {
        triggerType: 'n_days_before_holiday',
        holiday: 'easter_monday',
        daysBefore: 7,
      }),
      email('e1', 'Velikonoční nabídka — slevy do 30 %'),
    ],
    edges: [e('e0', 't', 'e1')],
  },

  // ─── Subscription renewal ──────────────────────────────────────────────────
  {
    slug: 'subscription-renewal-30-7-1',
    name: 'Subscription renewal — 30/7/1 day cadence',
    category: 'subscription_renewal',
    description: 'Renewal reminders at T-30, T-7, T-1 days before billing.',
    recommendedFor: ['saas', 'subscription'],
    locale: 'en',
    steps: 3,
    trigger: { type: 'date_field', config: { field: 'subscription_renews_at', daysBefore: 30 } },
    nodes: [
      n('t', 'trigger', {
        triggerType: 'date_field',
        field: 'subscription_renews_at',
        daysBefore: 30,
      }),
      email('e1', 'Your subscription renews in 30 days'),
      wait('w1', 23),
      email('e2', 'Your subscription renews in 7 days'),
      wait('w2', 6),
      email('e3', 'Tomorrow: your subscription renews'),
    ],
    edges: [
      e('e0', 't', 'e1'),
      e('e1', 'e1', 'w1'),
      e('e2', 'w1', 'e2'),
      e('e3', 'e2', 'w2'),
      e('e4', 'w2', 'e3'),
    ],
  },
];

export function findTemplate(slug: string): WorkflowTemplate | null {
  return WORKFLOW_TEMPLATES.find((t) => t.slug === slug) ?? null;
}

export function listTemplates(filter?: {
  category?: TemplateCategory;
  locale?: WorkflowTemplate['locale'];
  recommendedFor?: string;
}): WorkflowTemplate[] {
  let list = WORKFLOW_TEMPLATES;
  if (filter?.category) list = list.filter((t) => t.category === filter.category);
  if (filter?.locale) list = list.filter((t) => t.locale === filter.locale);
  if (filter?.recommendedFor)
    list = list.filter((t) => t.recommendedFor.includes(filter.recommendedFor!));
  return list;
}
