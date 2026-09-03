/**
 * What this deployment can do, as reported by the API.
 *
 * Several features answer requests whether or not the integration behind them
 * exists, and produce something that looks like a result — an inbox preview
 * "completed" against preview.mock.local, a geo panel that is permanently
 * empty. The dashboard must not offer those. Which ones they are depends on
 * configuration, so the answer comes from GET /api/v1/capabilities rather than
 * from the web app reading its own copy of the environment: a second copy is a
 * second thing to be wrong, and it would be the wrong process's copy anyway.
 *
 * This module is client-safe: it holds only types and the visibility rule, so a
 * client component can import it without dragging next/headers into the browser
 * bundle. The fetch lives in capabilities.server.ts.
 *
 * The fallback when the API cannot be reached is everything off. A dashboard
 * that hides a working feature is a nuisance; one that offers a broken feature
 * is the bug being fixed.
 */
export interface Capabilities {
  meetingLocationTypes: string[];
  videoProviders: string[];
  inboxPreview: boolean;
  geoAnalytics: boolean;
  /**
   * Multivariate tests. Reported false unconditionally by the API — the
   * feature's send-side is not built, so a test can be created and started but
   * never assigns a variant, never records a figure, and always finishes
   * without a winner. See multivariateTestsAvailable() in
   * apps/api/src/lib/integration-capabilities.ts for what is missing.
   */
  multivariateTests: boolean;
  /**
   * Beyond-core route groups the API registered, by name (BEYOND_CORE_GROUPS).
   *
   * This replaced a build-time boolean. Next.js inlines NEXT_PUBLIC_* into the
   * client bundle, so `NEXT_PUBLIC_FEATURE_BEYOND_CORE` was decided when the
   * image was built: revealing a page meant rebuilding and redeploying the web
   * app, and docker-compose.prod.yml never passed the build arg, so the value
   * was correct by absence rather than by decision. It was also one boolean
   * against the API's list — it could not show /surveys and hide /loyalty.
   *
   * Same argument this module already makes for Litmus and geo: a second copy
   * of the deployment's shape is a second thing to be wrong, and it would be
   * the wrong process's copy.
   */
  beyondCoreGroups: string[];
}

/** Feature keys a navigation entry can depend on. */
export type CapabilityFlag = 'inboxPreview' | 'geoAnalytics' | 'multivariateTests';

/**
 * Beyond-core group names a navigation entry can depend on.
 *
 * A hand-written union rather than an import of BEYOND_CORE_GROUPS from
 * @forgemsg/shared: only the nine groups the dashboard has a page for belong
 * here, and typing it to all 76 would let a nav entry name a group that has no
 * page — which reads as configured and shows nothing. The names are checked
 * against the API's list by nav-groups.test.ts, so a typo is a red test rather
 * than a permanently hidden link.
 */
export type BeyondCoreGroupName =
  | 'ai-agent'
  | 'coupon'
  | 'ecommerce'
  | 'helpdesk'
  | 'loyalty-program'
  | 'meeting'
  | 'product-feed'
  | 'reviews-v2'
  | 'survey';

export const NOTHING_AVAILABLE: Capabilities = {
  meetingLocationTypes: [],
  videoProviders: [],
  inboxPreview: false,
  geoAnalytics: false,
  multivariateTests: false,
  beyondCoreGroups: [],
};

/** True when the API said it registered this group. */
export function hasGroup(
  capabilities: Capabilities,
  group: BeyondCoreGroupName | undefined,
): boolean {
  if (!group) return true;
  return capabilities.beyondCoreGroups.includes(group);
}

/**
 * True when an entry with these requirements may be shown.
 *
 * Two independent questions, deliberately kept separate. `requires` asks "is
 * this deployment wired for it" (a Litmus key, a geo provider);
 * `requiresGroup` asks "is this part of the product registered at all". An
 * entry can carry both, and both must pass.
 */
export function isAvailable(
  capabilities: Capabilities,
  requires: CapabilityFlag | undefined,
  requiresGroup?: BeyondCoreGroupName,
): boolean {
  if (!hasGroup(capabilities, requiresGroup)) return false;
  if (!requires) return true;
  return capabilities[requires] === true;
}

/**
 * Drop the entries this deployment cannot serve.
 *
 * Generic over the entry shape so the sidebar's grouped nav and the command
 * palette's flat list share one rule — two copies of "should this be visible"
 * is how one of them ends up still offering it.
 */
export function visibleEntries<
  T extends { requires?: CapabilityFlag; requiresGroup?: BeyondCoreGroupName },
>(entries: readonly T[], capabilities: Capabilities): T[] {
  return entries.filter((e) => isAvailable(capabilities, e.requires, e.requiresGroup));
}

/** Same, for sections that hold entries; a section left empty is dropped too. */
export function visibleSections<
  I extends { requires?: CapabilityFlag; requiresGroup?: BeyondCoreGroupName },
  S extends { items: readonly I[] },
>(sections: readonly S[], capabilities: Capabilities): S[] {
  return sections
    .map((s) => ({ ...s, items: visibleEntries(s.items, capabilities) }))
    .filter((s) => s.items.length > 0);
}
