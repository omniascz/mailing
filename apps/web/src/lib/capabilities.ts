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
 * The fallback when the API cannot be reached is everything off. A dashboard
 * that hides a working feature is a nuisance; one that offers a broken feature
 * is the bug being fixed.
 */
import { apiFetch } from './api';

export interface Capabilities {
  meetingLocationTypes: string[];
  videoProviders: string[];
  inboxPreview: boolean;
  geoAnalytics: boolean;
}

/** Feature keys a navigation entry can depend on. */
export type CapabilityFlag = 'inboxPreview' | 'geoAnalytics';

export const NOTHING_AVAILABLE: Capabilities = {
  meetingLocationTypes: [],
  videoProviders: [],
  inboxPreview: false,
  geoAnalytics: false,
};

export async function getCapabilities(): Promise<Capabilities> {
  return apiFetch<Capabilities>('/api/v1/capabilities', { fallback: NOTHING_AVAILABLE });
}

/** True when an entry with this requirement may be shown. */
export function isAvailable(
  capabilities: Capabilities,
  requires: CapabilityFlag | undefined,
): boolean {
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
export function visibleEntries<T extends { requires?: CapabilityFlag }>(
  entries: readonly T[],
  capabilities: Capabilities,
): T[] {
  return entries.filter((e) => isAvailable(capabilities, e.requires));
}

/** Same, for sections that hold entries; a section left empty is dropped too. */
export function visibleSections<
  I extends { requires?: CapabilityFlag },
  S extends { items: readonly I[] },
>(sections: readonly S[], capabilities: Capabilities): S[] {
  return sections
    .map((s) => ({ ...s, items: visibleEntries(s.items, capabilities) }))
    .filter((s) => s.items.length > 0);
}
