/**
 * Which beyond-core route groups a deployment turns on, and which it may not.
 *
 * `FEATURE_BEYOND_CORE` was one boolean deciding all 76 groups at once. A probe
 * of what is behind it found 25 groups reachable, 39 partly reachable and 12
 * broken, so "on" was never a state anyone could ask for — which is why it has
 * been off in production since it shipped. This module makes the unit of the
 * decision the group rather than the flag.
 *
 * ─── Why a list rather than 76 named variables ───────────────────────────────
 *
 * lib/webhook-switches.ts argues the opposite case and is right about its own
 * six: "each flag is its own named variable rather than a lookup by string, so
 * `grep ENABLE_` finds every one of them". That reasoning does not survive
 * multiplication by 76 — an operator cannot read a rollout out of 76 booleans,
 * and a `.env` with 76 lines is a place typos live. So the names move into code
 * as data (BEYOND_CORE_GROUPS below, which is what `grep` now finds) and the
 * environment carries only the subset that is on.
 *
 * What IS taken from webhook-switches is the parsing discipline: values are
 * compared to literals, never defaulted with `??`. An empty string is not a
 * missing value that falls through to a default — `BEYOND_CORE_GROUPS=` and an
 * unset `BEYOND_CORE_GROUPS` both mean "no groups", because `''.split(',')`
 * filtered of empties is an empty list. This is the shape that produced the
 * `prodRequired().default()` incident: `??` does not fire on `''`.
 *
 * ─── Failing rather than ignoring ────────────────────────────────────────────
 *
 * An unrecognised name refuses the boot. The alternative — skip it and carry on
 * — means `BEYOND_CORE_GROUPS=loyalty-programs` (plural, wrong) starts a server
 * that looks configured and serves nothing, and the operator finds out from a
 * 404 rather than from the deploy. Same for a blocked group: asking for one is
 * asking for something that must not happen, and answering by quietly doing
 * less is how a rollout ends up half-applied and believed complete.
 */

/**
 * Every group `registerBeyondCore` can register, by the name an operator writes.
 *
 * Derived from the plugin identifiers in apps/api/src/index.ts with the
 * `Routes` suffix dropped and camelCase turned into kebab-case. The two are
 * kept in step by a test that reads index.ts and compares — a new
 * `registerBeyondCore('x', …)` whose name is missing here fails that test
 * rather than silently becoming unreachable.
 */
export const BEYOND_CORE_GROUPS = [
  'survey',
  'revenue',
  'product',
  'stock-alert',
  'coupon',
  'review',
  'advanced-analytics',
  'helpdesk',
  'ai-agent',
  'ai-recommendations',
  'ecommerce',
  'browse-abandonment',
  'crm-account',
  'crm-pipeline',
  'crm-deal',
  'crm-report',
  'ai-sales',
  'product-feed',
  'seo-sitemap',
  'blog',
  'cta',
  'crm-task',
  'crm-note',
  'crm-activity',
  'crm-sequence',
  'live-chat',
  'universal-inbox',
  'loyalty-program',
  'loyalty-reward',
  'loyalty-earning-rule',
  'loyalty-analytics',
  'loyalty-ledger',
  'calendar-sync',
  'identity-graph',
  'cdp-profile',
  'cdp-event',
  'cdp-trait',
  'cdp-activation',
  'helpdesk-routing',
  'helpdesk-analytics',
  'ai-support',
  'meeting',
  'cdp-source',
  'internal-coupons',
  'reviews-v2',
  'seo-clusters',
  'seo-keywords',
  'seo-audit',
  'seo-rank-tracker',
  'internal-seo-rank-poll',
  'social-account',
  'social-post',
  'social-mention',
  'social-analytics',
  'ad-account',
  'ad-audience-sync',
  'internal-social',
  'ad-lookalike',
  'sklik-lookalike',
  'ad-reporting',
  'ads-webhook',
  'sklik-pixel',
  'commerce-product',
  'commerce-quote',
  'commerce-invoice',
  'stripe-webhook',
  'commerce-subscription',
  'internal-commerce',
  'association',
  'gamification',
  'canned-response',
  'surveys-nps',
  'playbook',
  'rotation',
  'quote-template',
  'extension-card',
] as const;

export type BeyondCoreGroup = (typeof BEYOND_CORE_GROUPS)[number];

const KNOWN: ReadonlySet<string> = new Set(BEYOND_CORE_GROUPS);

/**
 * Groups that must not be turned on, with the reason as data rather than as a
 * comment — the shape PALETTE_EXCLUDED uses, and for the same reason: a comment
 * explaining why something is excluded cannot be read back by the code that
 * excludes it, so the two drift and the exclusion outlives its justification.
 *
 * The reason is printed in the refusal, so an operator who asks for one of
 * these learns what is wrong rather than that they mistyped.
 *
 * Deliberately NOT here, having been re-verified on this commit rather than
 * inherited from the probe that first listed them:
 *
 *   ai-agent, ai-recommendations — the probe recorded these as unreachable
 *     because six routes had no guard and read `orgId` off a property nothing
 *     sets, which produced UNDEFINED_VALUE. Both were fixed; ai-agents.ts now
 *     has fourteen routes and fourteen `preHandler: [app.authenticate]`, no
 *     casts remain, and the three known-failures entries are gone. They need
 *     ANTHROPIC_API_KEY to do anything useful, but an unconfigured AI client
 *     fails loudly and destroys nothing. Blocking them would assert a hazard
 *     the code no longer has.
 */
export const BEYOND_CORE_BLOCKED: ReadonlyArray<{ group: BeyondCoreGroup; reason: string }> = [
  {
    group: 'stock-alert',
    reason:
      'notifyRestock and notifyPriceChange mark every pending subscriber notifiedAt and ' +
      'return — no queue, no workflow event, nothing sent (verified: neither function ' +
      'mentions a queue, dispatch or onApiEvent). Because notifiedAt is set, the ' +
      'subscription is spent and can never fire again, so turning this on destroys the ' +
      'back-in-stock and price-drop lists quietly. Fix the send path first.',
  },
  {
    group: 'ads-webhook',
    reason:
      'Registered only when ENABLE_META_LEAD_ADS_WEBHOOK is also on, so listing it here ' +
      'would read as enabled while changing nothing. Its signature verification also ' +
      'opens when the app secret is unset — see lib/webhook-switches.ts, which is ' +
      'deliberately the only way this endpoint can come back.',
  },
];

const BLOCKED: ReadonlyMap<string, string> = new Map(
  BEYOND_CORE_BLOCKED.map((b) => [b.group, b.reason]),
);

/** Raised at startup. Named so a caller can tell configuration from a crash. */
export class BeyondCoreConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BeyondCoreConfigError';
  }
}

/** Names closest to a typo, so the refusal can suggest instead of just listing 76. */
function nearest(name: string): string[] {
  return BEYOND_CORE_GROUPS.filter(
    (g) => g.startsWith(name.slice(0, 4)) || g.includes(name) || name.includes(g),
  ).slice(0, 5);
}

/**
 * Split `BEYOND_CORE_GROUPS` into names.
 *
 * Empty and unset are the same answer. No `??`: the default is reached by the
 * list being empty, not by the value being nullish, so `BEYOND_CORE_GROUPS=`
 * cannot fall through to something else later.
 */
export function parseGroupList(raw: string | undefined): string[] {
  if (raw === undefined || raw === null) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface BeyondCoreResolution {
  /** The groups this process will register. */
  enabled: ReadonlySet<BeyondCoreGroup>;
  /** One line for the startup log — the operator reads this, not a boolean. */
  summary: string;
}

/**
 * Decide the enabled set, or refuse to start.
 *
 * `all` is FEATURE_BEYOND_CORE and means every group, blocked ones included.
 * That is not an oversight: on a workstation it means "this is a development
 * machine", it is what dev and the test suites have always had, and narrowing
 * it would change the surface route-smoke sweeps. It is refused outright in
 * production, where the only way in is the explicit list — and the explicit
 * list is where the blocklist bites, in every environment, because listing
 * groups is what a rollout looks like and a rollout is what must not include
 * them.
 */
export function resolveBeyondCoreGroups(input: {
  raw: string | undefined;
  all: boolean;
  isProduction: boolean;
}): BeyondCoreResolution {
  const names = parseGroupList(input.raw);

  for (const name of names) {
    if (!KNOWN.has(name)) {
      const hint = nearest(name);
      throw new BeyondCoreConfigError(
        `BEYOND_CORE_GROUPS names an unknown group: "${name}". ` +
          (hint.length > 0
            ? `Did you mean: ${hint.join(', ')}? `
            : `No group has a name like that. `) +
          `There are ${BEYOND_CORE_GROUPS.length} valid names; see BEYOND_CORE_GROUPS in ` +
          `@forgemsg/shared/beyond-core.`,
      );
    }
    const reason = BLOCKED.get(name);
    if (reason !== undefined) {
      throw new BeyondCoreConfigError(
        `BEYOND_CORE_GROUPS names a blocked group: "${name}". ${reason}`,
      );
    }
  }

  if (input.all) {
    if (input.isProduction) {
      throw new BeyondCoreConfigError(
        'FEATURE_BEYOND_CORE cannot be used in production: it enables all ' +
          `${BEYOND_CORE_GROUPS.length} groups including the ${BEYOND_CORE_BLOCKED.length} ` +
          'that are blocked. Name the groups to roll out in BEYOND_CORE_GROUPS instead.',
      );
    }
    return {
      enabled: new Set(BEYOND_CORE_GROUPS),
      summary: `beyond-core: ALL ${BEYOND_CORE_GROUPS.length} groups (FEATURE_BEYOND_CORE, non-production)`,
    };
  }

  const enabled = new Set(names as BeyondCoreGroup[]);
  return {
    enabled,
    summary:
      enabled.size === 0
        ? 'beyond-core: no groups enabled'
        : `beyond-core: ${enabled.size} group(s) enabled — ${[...enabled].sort().join(', ')}`,
  };
}
