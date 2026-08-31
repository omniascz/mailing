import { shareNetworkSchema, type ShareBlock } from '../schema/blocks.js';

/**
 * Editing the network list of a share block.
 *
 * A share network is NOT a social network, and the difference decides the
 * shape of the panel. A social entry is `{ type, url }` and the URL is the
 * sender's own profile, so it has to be typed in. A share entry is a bare
 * enum value, because the URL is built at render time by
 * `shareTargets()` in render/share.ts from `ctx.system.viewInBrowserUrl` —
 * there is nothing per-network to store and nothing for a person to fill in.
 *
 * So this is a fixed set of five checkboxes, not an add/remove list, and the
 * panel offers no URL field at all. Offering one would invite somebody to
 * type an address that is then silently ignored.
 *
 * `shareBlockSchema.networks` is `.min(1)`: a share block with nothing to
 * share does not parse. That is the floor `toggleShareNetwork` defends.
 */

export type ShareNetwork = ShareBlock['networks'][number];

/** The networks shareBlockSchema accepts, read off the enum rather than retyped. */
export const SHARE_NETWORKS: readonly ShareNetwork[] = shareNetworkSchema.options;

/**
 * Human labels for the checkbox list.
 *
 * render/share.ts has its own NETWORK_LABEL map with the same keys. It is not
 * exported, and render/ is out of scope for this change, so this is a second
 * copy — deliberately, and recorded here rather than left to be discovered.
 * A Record keyed by ShareNetwork means adding a network to the enum is a tsc
 * error here, so the copy cannot silently lose an entry.
 */
export const SHARE_NETWORK_LABEL: Record<ShareNetwork, string> = {
  email: 'Forward by email',
  facebook: 'Facebook',
  x: 'X',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
};

export function canRemoveShareNetwork(networks: readonly ShareNetwork[]): boolean {
  return networks.length > 1;
}

/**
 * Turn one network on or off.
 *
 * Unticking the last one is refused — the list would fail `.min(1)` and the
 * block would stop parsing. The checkbox is rendered disabled in that state,
 * so this is the second line rather than the first. Order is preserved, and
 * a network turned back on returns to the end of the list.
 */
export function toggleShareNetwork(
  networks: readonly ShareNetwork[],
  network: ShareNetwork,
): ShareNetwork[] {
  const on = networks.includes(network);
  if (!on) return [...networks, network];
  if (!canRemoveShareNetwork(networks)) return [...networks];
  return networks.filter((n) => n !== network);
}
