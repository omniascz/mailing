import { networkTypeSchema, type SocialBlock } from '../schema/blocks.js';

/**
 * Editing the network list of a social block.
 *
 * Pure, for the reason poll-options.ts is pure: apps/editor runs vitest with
 * `environment: 'node'`, so anything that can be got wrong has to live
 * outside the component to be asserted on.
 *
 * `socialBlockSchema.networks` is `z.array({ type, url })` with NO min and NO
 * max — an empty list parses. So there is no floor to defend here, unlike
 * share (min 1) or poll (2..6). What there IS is `url: z.string().url()`,
 * which is stricter than every other URL field in the schema: `button.url`,
 * `product.productUrl` and `coupon.ctaUrl` are all bare `z.string()`. A
 * half-typed address therefore makes a social block momentarily unparseable
 * in a way a half-typed button URL does not.
 *
 * The panel does not police that — validating beyond the schema is not this
 * change's job, and a field that fights you mid-keystroke is worse than one
 * that does not. What the panel does guarantee is that the row it CREATES is
 * valid: NEW_NETWORK_URL parses, so adding a network never breaks a block
 * that was fine a moment ago.
 */

export type SocialNetworkEntry = SocialBlock['networks'][number];
export type SocialNetworkType = SocialNetworkEntry['type'];

/**
 * The networks socialBlockSchema accepts, read off the enum rather than
 * retyped. A second copy of this list is how the block palette drifted.
 */
export const SOCIAL_NETWORK_TYPES: readonly SocialNetworkType[] = networkTypeSchema.options;

/**
 * The address a newly added row starts with.
 *
 * It has to satisfy `z.string().url()` — an empty string does not, so
 * starting blank would mean every "+ Add network" click produced an invalid
 * block. Asserted in panel-output.test.ts against the real schema.
 */
export const NEW_NETWORK_URL = 'https://example.com';

export function addSocialNetwork(networks: readonly SocialNetworkEntry[]): SocialNetworkEntry[] {
  return [...networks, { type: 'facebook', url: NEW_NETWORK_URL }];
}

/** Drop the row at `index`. An index outside the list is a no-op. */
export function removeSocialNetwork(
  networks: readonly SocialNetworkEntry[],
  index: number,
): SocialNetworkEntry[] {
  if (!Number.isInteger(index) || index < 0 || index >= networks.length) return [...networks];
  return networks.filter((_, i) => i !== index);
}

/** Patch one row. An index outside the list is a no-op. */
export function updateSocialNetwork(
  networks: readonly SocialNetworkEntry[],
  index: number,
  patch: Partial<SocialNetworkEntry>,
): SocialNetworkEntry[] {
  if (!Number.isInteger(index) || index < 0 || index >= networks.length) return [...networks];
  return networks.map((n, i) => (i === index ? { ...n, ...patch } : n));
}
