/**
 * Flow templates we do not offer, and why.
 *
 * Every email step of a shipped flow template names an email from the
 * catalogue (email-content.ts), paired by category. Read step by step, the
 * pairing often does not hold: a step that says "Refund confirmed" is paired
 * with "Your order has shipped", a GDPR deletion notice with "Big news from
 * us", a Czech Mother's Day tip with a name-day greeting. The subject the
 * recipient sees comes from the step and the body from the email
 * (routes/v1/internal/workflow-dispatch.ts), so a mismatch is not a cosmetic
 * problem — it is a promise the email does not keep.
 *
 * All 181 email steps were read against the email they are paired with. The
 * templates below have at least one step whose email is about something else;
 * they stay in the code, keep their tests, and are simply not offered: they
 * vanish from the gallery listing and the category counts, and their detail,
 * fork and "use" endpoints answer 404. A workflow someone forked before this
 * is a copy of its own and is unaffected.
 *
 * The rule used, so the next pass can argue with it: a step is a mismatch when
 * the email asserts something the step does not (shipped, back in stock, price
 * dropped, name day), or when the step promises a concrete thing — a discount
 * code, a gift, a recording, a whitepaper — that the email cannot contain. A
 * step is fine when both are the same intent and nothing concrete is promised
 * (a win-back subject with a win-back email, an NPS email under a CSAT
 * subject).
 *
 * The fix is to pair per step rather than per category, and to write the
 * missing emails — above all Czech ones: of the templates that survive, two
 * are Czech. Until then, a smaller gallery that keeps its promises beats a
 * large one that does not.
 */

/** slug → the step that has no matching email. */
export const HIDDEN_WORKFLOW_TEMPLATES: Record<string, string> = {
  'welcome-3-step-en':
    '"A small thank-you gift" is paired with the Day 7 milestone email, which has no gift.',
  'welcome-3-step-cs': '"Malý dárek na úvod" repeats the first welcome email, which has no gift.',
  'welcome-5-step-en':
    '"Our story in 2 minutes" and "Reviews from real customers" both get onboarding emails about product setup.',
  'welcome-3-step-sk':
    'Slovak steps are paired with English onboarding emails; the catalogue has no sk variants.',
  'welcome-discount-magnet':
    '"Your 10% welcome code: WELCOME10" is paired with a welcome email that carries no code.',
  'post-purchase-thanks-review':
    '"Thanks for your order!" is paired with "Your order has shipped", which claims a shipment that has not happened.',
  'post-purchase-shipping-update':
    '"Order #… confirmed" is paired with the shipping notification; every step is one email out of step.',
  'post-purchase-bundle-upsell':
    '"Complete the set — save 15%" is paired with a shipping notification.',
  'ecom-post-refund-recovery':
    '"Refund confirmed — we\'re sorry it didn\'t work out" is paired with "Your order has shipped".',
  'winback-90-day':
    '"20% off if you come back this week" is paired with a win-back email that names no discount.',
  'birthday-discount': '"Happy birthday week" is paired with the Valentine\'s Day promo.',
  'birthday-cs':
    '"Narozeninový týden" is paired with the name-day greeting — a different occasion, twice.',
  'browse-abandonment-2-touch':
    '"Still interested?" is paired with "Price drop", which claims a price cut that has not happened.',
  'vip-tier-upgrade': '"Try your new perks" is paired with "You earned a referral reward".',
  'loyalty-points-earned-thanks':
    '"You earned N points" is paired with a VIP early-access invitation.',
  'loyalty-reward-redeemed-confirm':
    '"Your reward is on the way" is paired with a VIP early-access invitation.',
  'loyalty-points-expiring':
    '"Points expire in 30 days" is paired with a VIP early-access invitation.',
  'lead-nurture-saas-trial':
    '"Welcome — let\'s get you set up" is paired with a customer case study.',
  'lead-nurture-content-download':
    '"Here\'s your whitepaper" is paired with a case study; the whitepaper email comes two steps later.',
  'lead-nurture-demo-followup':
    '"Thanks for your time — recap + recording" is paired with a case study.',
  'lead-nurture-mql-handoff': '"We\'d love to chat — choose a time" is paired with a case study.',
  'ecom-product-launch-waitlist':
    '"It\'s here! … is now available" is paired with a B2B case study.',
  'event-webinar-reminder':
    '"You\'re registered" is paired with the invitation to register, and "Starting in 1 hour" with the post-event thank-you.',
  'event-in-person-prep': '"What to bring + how to get there" is paired with a webinar invitation.',
  'event-no-show-recovery':
    '"Sorry we missed you — watch the recording" is paired with a webinar invitation.',
  'nps-survey-30-day':
    '"We\'d love to make it right — quick reply?" is paired with the NPS survey again.',
  'onboarding-saas-7-day':
    '"Step 1: Invite your team" is paired with the generic welcome email; the steps name features the emails never mention.',
  'onboarding-progressive-profiling':
    '"Which topic interests you most?" is paired with a Day 3 feature spotlight.',
  'onboarding-feature-activation': '"Try … in 60 seconds" is paired with the welcome email.',
  'churn-prevention-downgrade-saver':
    '"Before you downgrade — 50% off" is paired with "we noticed you have not been around".',
  'subscription-renewal-30-7-1':
    '"Your subscription renews in 7 days" is paired with a payment-failed dunning email.',
  'subscription-card-expiring':
    '"Your card expires soon — update it" is paired with a renewal reminder that does not mention the card.',
  'ecom-subscription-pause':
    '"Before you pause" is paired with a renewal reminder, and the pause confirmation with a payment-failed email.',
  'replenishment-30-day':
    '"Running low? Reorder" is paired with "back in stock", which claims a restock.',
  'replenishment-90-day': '"Time to restock" is paired with "back in stock".',
  'transactional-password-reset': '"Reset your password" is paired with an order confirmation.',
  'transactional-shipping-cascade': '"Your order shipped" is paired with an order confirmation.',
  'cz-holiday-easter-week': 'The Easter offer is paired with the name-day greeting.',
  'cz-christmas-week': 'The Christmas offer is paired with the name-day greeting.',
  'cz-st-nicholas': 'The St Nicholas offer is paired with the name-day greeting.',
  'cz-mothers-day': "The Mother's Day tip is paired with the name-day greeting.",
  'sk-name-day-greeting': 'The Slovak name-day greeting is paired with an English Christmas card.',
  'anniversary-signup': '"A year together — 15% off" is paired with a Christmas greeting.',
  'ecom-bfcm-presale':
    '"Something big is coming" is paired with a Christmas card and the sale launch with a spring greeting.',
  'saas-trial-expiry-3day': '"Your trial ends in 3 days" is paired with a feature announcement.',
  'saas-feature-adoption':
    '"Quick tip: how top teams use …" is paired with a monthly usage report.',
  'saas-csm-check-in-30d': '"Quick check-in from your CSM" is paired with a feature announcement.',
  'saas-pql-upsell': '"You\'ve hit your limit" is paired with a feature announcement.',
  'saas-mql-to-sql-handoff':
    '"Your account is ready for a quick demo" is paired with a feature announcement.',
  'saas-churned-reactivation':
    '"Come back — first month free" is paired with a monthly usage report.',
  'saas-annual-renewal':
    '"Your plan renews in 60 days" is paired with a feature announcement; five steps, four unrelated emails.',
  'saas-downgrade-saver':
    '"Before you downgrade — can I help?" is paired with a feature announcement.',
  'sales-cold-outreach-3touch':
    '"Last note from me" is paired with "Great speaking with you" — they never spoke.',
  'sales-demo-reminder':
    '"Your demo is confirmed — here\'s the agenda" is paired with cold outreach.',
  'sales-proposal-followup': '"Your proposal — any questions?" is paired with cold outreach.',
  'sales-deal-won-onboarding':
    '"Welcome to … — here\'s how we get started" is paired with cold outreach.',
  'ecom-vip-early-access':
    '"Early access closes in 4 hours" is paired with "You earned a referral reward".',
  'reengagement-preference-update':
    '"Update your preferences" is paired with "we noticed you have not been around", a different ask.',
  'gdpr-consent-renewal':
    '"Please confirm you still want to hear from us" is paired with a marketing announcement.',
  'gdpr-data-export-ready': '"Your data export is ready" is paired with a marketing announcement.',
  'gdpr-account-deletion-confirm':
    '"We\'ve received your deletion request" is paired with "Big news from us".',
  'gdpr-cs-consent-renewal':
    'The consent renewal is paired with a terms-change notice, twice — a different legal message.',
  'blog-new-post-notify':
    '"New post: …" is paired with the weekly digest, which is a roundup rather than the post.',
  'blog-new-post-cs':
    '"Nový článek: …" is paired with the Czech digest, which is a roundup rather than the post.',
  'blog-content-upgrade-lead-magnet': '"Here\'s your … — enjoy!" is paired with the weekly digest.',
};

/** Pre-built flow id → the step that has no matching email. */
export const HIDDEN_FLOW_TEMPLATES: Record<string, string> = {
  'onboarding-tour':
    '"Your trial ends soon — here is what you have achieved" is paired with the welcome email.',
  'dunning-payment-failed':
    'The Czech dunning steps are paired with English payment and account emails.',
};

export const isHiddenWorkflowTemplate = (slug: string): boolean =>
  Object.hasOwn(HIDDEN_WORKFLOW_TEMPLATES, slug);

export const isHiddenFlowTemplate = (id: string): boolean =>
  Object.hasOwn(HIDDEN_FLOW_TEMPLATES, id);
