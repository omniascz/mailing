/**
 * Where a "share this email" button points, and to which networks.
 *
 * ─── The target ──────────────────────────────────────────────────────────────
 *
 * The campaign's view-in-browser URL. It is the only URL in a rendered email
 * that a stranger can usefully open: the unsubscribe and preference links are
 * per-recipient tokens (sharing one hands someone else control of your
 * subscription), and the sender's own site is not the email.
 *
 * ─── When it is missing ──────────────────────────────────────────────────────
 *
 * The block renders nothing at all.
 *
 * Two other options were possible and both are worse. Falling back to the
 * sender's homepage silently changes what the button does — the recipient
 * shares something other than what they meant to. Rendering the buttons with
 * an empty or unresolved target puts `?u={{view_in_browser_url}}` on a public
 * social network, where it stays. An absent row is the only outcome that
 * cannot mislead anybody, and it is the honest one: with no public copy of the
 * email there is nothing to share.
 *
 * This is not hypothetical. `browser-view.ts` builds its merge context without
 * `viewInBrowserUrl` — the archive page has no "view in browser" of its own —
 * so the same email that shows share buttons in an inbox correctly shows none
 * on its own archive page.
 */

import { parseMergeTags, type MergeTagContext } from './merge-tags.js';
import type { ShareBlock, ShareNetwork } from '../schema/blocks.js';

export interface ShareTarget {
  network: ShareNetwork;
  label: string;
  url: string;
}

/**
 * The networks offered, and why these.
 *
 * Chosen for the Czech market this product launches into, not the US default:
 *
 *  - email    forwarding is how a newsletter actually spreads here, and it is
 *             the one "network" that needs no account. Always worth offering.
 *  - facebook still the largest social network in CZ/SK by reach, and the one
 *             where a shared link renders a preview card.
 *  - x        small but the place links to articles and offers circulate.
 *  - whatsapp the messenger with the widest CZ install base after Messenger,
 *             and unlike Messenger it has a documented public share URL that
 *             works from an email client without an app id.
 *  - linkedin B2B senders, which is a real slice of this market.
 *
 * Deliberately absent: Pinterest and Reddit (negligible here), Messenger
 * (its share dialog needs a registered Facebook app id, which a sender does
 * not have), Instagram (no share-a-link URL exists — links cannot be posted).
 */
const NETWORK_LABEL: Record<ShareNetwork, string> = {
  email: 'Forward',
  facebook: 'Facebook',
  x: 'X',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
};

function buildUrl(network: ShareNetwork, target: string, text: string): string {
  const u = encodeURIComponent(target);
  const t = encodeURIComponent(text);
  switch (network) {
    case 'email':
      // mailto: rather than a web composer — it opens whatever the recipient
      // already uses, which for a forward is the point.
      return `mailto:?subject=${t}&body=${u}`;
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case 'x':
      return `https://twitter.com/intent/tweet?url=${u}${text ? `&text=${t}` : ''}`;
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case 'whatsapp':
      return `https://wa.me/?text=${text ? `${t}%20` : ''}${u}`;
  }
}

/**
 * True when a share target is a real, absolute, shareable URL.
 *
 * An unresolved merge tag is the case this exists for: `parseMergeTags` leaves
 * `{{view_in_browser_url}}` untouched when the context has no value for it,
 * and that string in a Facebook share link is a permanent embarrassment.
 */
export function isShareableUrl(value: string | undefined | null): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('{{') || trimmed.includes('}}')) return false;
  return /^https?:\/\/\S+$/i.test(trimmed);
}

/** The buttons this block should render, or an empty array to render nothing. */
export function shareTargets(block: ShareBlock, ctx: MergeTagContext): ShareTarget[] {
  const raw = ctx.system?.viewInBrowserUrl;
  if (!isShareableUrl(raw)) return [];

  const text = parseMergeTags(block.shareText ?? '', ctx).trim();
  return block.networks.map((network) => ({
    network,
    label: NETWORK_LABEL[network],
    url: buildUrl(network, raw, text),
  }));
}
