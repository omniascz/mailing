/**
 * UTM tagging for a campaign: the defaults, and what the tagged URL looks like.
 *
 * ─── Why there is no Google API in this file ─────────────────────────────────
 *
 * Mailchimp's "Google Analytics" integration does not push anything to Google.
 * It appends UTM parameters to the links in the email and lets GA pick them up
 * on arrival — its own help page says the quiet part out loud: "If you set up
 * tracking this way, you won't be able to see the Google Analytics statistics
 * in Mailchimp." The OAuth step exists so Mailchimp can name the campaign
 * consistently, not to carry data. So the gap was smaller than it looked:
 * MailForge already had the whole mechanism. What it did not have was any way
 * to switch it on, and two of the three links it must never tag were being
 * tagged anyway.
 *
 * ─── The value rules ─────────────────────────────────────────────────────────
 *
 * A campaign is called "Vánoční sleva 2026" here more often than not, and a
 * UTM value ends up in a report, a filter and a URL. `slugify` is what keeps
 * those three readable: percent-encoding is correct but produces
 * `V%C3%A1no%C4%8Dn%C3%AD+sleva+2026` in every GA table, which nobody can scan.
 */

import type { Campaign } from '../../db/schema/index.js';

export interface UtmSettings {
  enabled: boolean;
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

/** GA's own convention for an email campaign, and the sensible default here. */
export const DEFAULT_SOURCE = 'email';
export const DEFAULT_MEDIUM = 'newsletter';

/**
 * A UTM-safe, human-legible value.
 *
 * Diacritics are folded rather than dropped: "Vánoční" becomes "vanocni", not
 * "vnon". Everything else collapses to single hyphens. The result needs no
 * percent-encoding at all, which is the point — the value is going to be read
 * by a person in a GA report, not just parsed by one.
 */
export function slugify(value: string, maxLength = 80): string {
  const folded = value
    .normalize('NFD')
    // Combining marks — the accents NFD just separated out.
    .replace(new RegExp(`[\u0300-\u036f]`, 'g'), '')
    .toLowerCase();

  return folded
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/, '');
}

/**
 * What a campaign's UTM values should be when nobody has said otherwise.
 *
 * `utm_campaign` is the campaign's own name, slugged. Not its id: an id in a GA
 * report is unreadable, and the name is what the person reading the report
 * called the thing. A campaign whose name slugs to nothing (emoji only, say)
 * falls back to the id, because an empty utm_campaign is worse than an ugly one.
 */
export function defaultUtmFor(
  campaign: Pick<Campaign, 'id' | 'name'>,
): Required<Pick<UtmSettings, 'source' | 'medium' | 'campaign'>> {
  const slug = slugify(campaign.name ?? '');
  return {
    source: DEFAULT_SOURCE,
    medium: DEFAULT_MEDIUM,
    campaign: slug || campaign.id,
  };
}

/**
 * The settings as the renderer will actually see them: whatever the customer
 * set, with the defaults filling the gaps.
 *
 * Kept separate from `defaultUtmFor` so the API can answer "what would happen
 * if I turned this on" without writing anything.
 */
export function resolveUtm(
  campaign: Pick<Campaign, 'id' | 'name'>,
  settings: UtmSettings | null | undefined,
): UtmSettings {
  const defaults = defaultUtmFor(campaign);
  return {
    enabled: settings?.enabled ?? false,
    source: settings?.source?.trim() || defaults.source,
    medium: settings?.medium?.trim() || defaults.medium,
    campaign: settings?.campaign?.trim() || defaults.campaign,
    ...(settings?.content?.trim() ? { content: settings.content.trim() } : {}),
    ...(settings?.term?.trim() ? { term: settings.term.trim() } : {}),
  };
}

/**
 * The URL a given link would become — the preview the settings screen shows.
 *
 * Deliberately the same shape of operation the renderer performs (parse, set
 * what is absent, serialise) rather than string concatenation, so a link that
 * already has a query string previews the way it will actually send.
 */
export function previewTaggedUrl(rawUrl: string, utm: UtmSettings): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (!utm.enabled) return parsed.toString();

  const set = (key: string, value: string | undefined) => {
    if (value && !parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
  };
  set('utm_source', utm.source ?? DEFAULT_SOURCE);
  set('utm_medium', utm.medium ?? DEFAULT_MEDIUM);
  set('utm_campaign', utm.campaign);
  set('utm_content', utm.content);
  set('utm_term', utm.term);
  return parsed.toString();
}
