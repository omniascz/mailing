/**
 * Which shipped email each email step of a flow template sends.
 *
 * A flow template's `send_email` step used to carry only a subject. The queue
 * contract needs a campaign, a template row or inline html (lib/queue-contracts
 * .ts), so every one of those steps failed the moment a contact reached it:
 * "campaignId, templateId or html required — the send has no content
 * otherwise". Measured before this change: 181 of 205 shipped email steps, in
 * 86 of 103 graphs.
 *
 * The product already ships 91 email templates (services/editor/templates), and
 * a customer can clone one into their own list with POST /templates/:id/use.
 * So a step names one of those by its built-in id, and the fork clones it into
 * the organisation and writes the new row's UUID into the step. Nothing else
 * would work in an empty database: a template id that is not a row of that
 * organisation's own is a 404 at send time, and inline html would mean 181
 * emails written here that the customer cannot edit in the editor.
 *
 * The pairing is by category, not by hand for each of the 181 steps: a
 * three-email welcome series gets the three onboarding emails in order, a
 * cart series gets the cart emails. A Czech flow template takes the Czech
 * variants where the catalogue has them — `localeOf` on the built-in decides
 * what goes in the inbox (routes/v1/templates.ts), so pairing a cs flow with
 * en emails would send English.
 *
 * workflow-email-content.test.ts asserts that every shipped step ends up with
 * an id that exists in the catalogue, and that no step is left without one.
 */

import type { WorkflowNode } from '../../db/schema/workflows.js';

/** Built-in email ids, in the order a series uses them. */
export interface EmailSeries {
  en: readonly string[];
  cs?: readonly string[];
}

/**
 * Flow-template category → the emails its steps send.
 *
 * Every category in registry.ts's TemplateCategory is here; a missing one is a
 * build error in the test, not a step without content.
 */
export const EMAIL_SERIES_BY_CATEGORY: Record<string, EmailSeries> = {
  welcome: {
    en: ['onboarding-001', 'onboard-002', 'onboard-003'],
    cs: ['cs-welcome-1', 'cs-welcome-2'],
  },
  abandoned_cart: {
    en: ['ecom-001', 'ecom-002', 'b2-promo-008'],
    cs: ['cs-cart-products', 'cs-cart-objections', 'cs-cart-lastchance'],
  },
  post_purchase: {
    en: ['b2-trans-010', 'ecom-003', 'b2-ecom-006'],
    cs: ['cs-delivered', 'cs-review-request', 'cs-crosssell'],
  },
  winback: { en: ['b2-ecom-008', 'saas-003', 'promo-005'], cs: ['cs-winback'] },
  birthday: { en: ['seasonal-004', 'promo-006'], cs: ['cs-nameday'] },
  browse_abandonment: { en: ['ecom-005', 'ecom-004'], cs: ['cs-back-in-stock'] },
  vip_loyalty: { en: ['promo-005', 'promo-006'], cs: ['cs-loyalty-points'] },
  lead_nurture: { en: ['b2b-002', 'b2b-003', 'b2-b2b-004', 'b2b-001'] },
  event: { en: ['event-001', 'event-003', 'b2-event-005'] },
  feedback_nps: { en: ['saas-004', 'ecom-003'] },
  cross_sell: { en: ['b2-ecom-006', 'promo-003'], cs: ['cs-crosssell'] },
  onboarding: {
    en: ['onboarding-001', 'onboard-002', 'onboard-003', 'b2-onboarding-004'],
    cs: ['cs-welcome-1', 'cs-welcome-2'],
  },
  churn_prevention: { en: ['saas-005', 'saas-003'] },
  date_triggered: { en: ['seasonal-001', 'seasonal-005', 'promo-001'], cs: ['cs-nameday'] },
  subscription_renewal: { en: ['trans-008', 'b2-saas-005', 'b2-trans-012'] },
  transactional: {
    en: ['tx-001', 'trans-006', 'trans-005'],
    cs: ['cs-order-confirm', 'cs-shipping-tracking', 'cs-invoice'],
  },
  review_request: { en: ['ecom-003', 'b2-ecom-007'], cs: ['cs-review-request'] },
  replenishment: { en: ['ecom-004', 'promo-003'] },
  saas_lifecycle: { en: ['saas-001', 'saas-002', 'b2-saas-003', 'onboard-005'] },
  sales_engagement: { en: ['b2b-001', 'b2b-002', 'b2-b2b-003', 'b2b-004'] },
  re_engagement: { en: ['saas-005', 'b2-ecom-008', 'promo-005'], cs: ['cs-winback'] },
  compliance: { en: ['nl-005', 'trans-007'], cs: ['cs-terms-change'] },
  blog_content: { en: ['nl-002', 'nl-006', 'b2-nl-007'], cs: ['cs-digest'] },
};

/**
 * The pre-built flows in services/workflows/flow-templates.ts (and the dunning
 * template it pulls in) have no category, so they name their series directly.
 */
export const EMAIL_SERIES_BY_FLOW_ID: Record<string, readonly string[]> = {
  'welcome-series': ['onboarding-001', 'onboard-002', 'onboard-003'],
  'abandoned-cart': ['ecom-001', 'ecom-002'],
  'onboarding-tour': ['onboarding-001', 'onboard-002', 'b2-onboarding-004'],
  're-engagement': ['saas-005', 'b2-ecom-008', 'promo-005'],
  'dunning-payment-failed': ['b2-saas-005', 'trans-008', 'trans-007'],
};

/**
 * The key a step carries until the fork turns it into a real template row.
 * The executor does not read it (it reads `templateId`), and after a fork both
 * are present: the id of the built-in it came from, and the row it became.
 */
export const BUILT_IN_EMAIL_KEY = 'builtInTemplateId';

/**
 * Give every `send_email` step in these nodes the built-in email it sends.
 *
 * Steps that already carry content — a campaign, a template row, inline html,
 * or a built-in id written by hand — are left exactly as they are. A
 * `templateId: null`, which flow-templates.ts wrote on 14 steps and which the
 * queue contract rejects as "expected string, received null", is dropped.
 */
export function withBuiltInEmails(
  nodes: WorkflowNode[],
  series: readonly string[],
): WorkflowNode[] {
  if (series.length === 0) return nodes;
  let index = 0;

  return nodes.map((node) => {
    if (node.type !== 'send_email') return node;
    const config = { ...node.config } as Record<string, unknown>;

    if (config.templateId === null) delete config.templateId;

    const hasContent =
      config.campaignId !== undefined ||
      config.templateId !== undefined ||
      config.html !== undefined ||
      config[BUILT_IN_EMAIL_KEY] !== undefined;

    if (!hasContent) {
      config[BUILT_IN_EMAIL_KEY] = series[index % series.length];
      index++;
    }
    return { ...node, config };
  });
}

/** The series a flow template of this category and language sends. */
export function seriesForCategory(category: string, locale: string): readonly string[] {
  const entry = EMAIL_SERIES_BY_CATEGORY[category];
  if (!entry) return [];
  return locale === 'cs' && entry.cs?.length ? entry.cs : entry.en;
}
