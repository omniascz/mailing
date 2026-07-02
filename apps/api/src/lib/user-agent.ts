/**
 * Dependency-free User-Agent parser for email open/click tracking.
 *
 * Populates `email_events.device_type` and `email_events.email_client` so the
 * analytics device/email-client breakdowns have a real data source (previously
 * the write-path never set these → every row resolved to "unknown").
 *
 * This is deliberately small and best-effort: email opens are proxied through a
 * limited set of clients (Gmail image proxy, Apple Mail, Outlook, Yahoo, …), so
 * a curated substring table beats a heavyweight UA library here. Values are
 * normalized to a stable vocabulary the read-path (getCampaignDeviceStats /
 * getCampaignClientStats) understands.
 */

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

export interface ParsedUserAgent {
  deviceType: DeviceType;
  /** Normalized client id (e.g. "gmail", "apple_mail") or null when unknown. */
  emailClient: string | null;
}

/** Human-readable labels for the normalized email-client ids. */
export const EMAIL_CLIENT_LABELS: Record<string, string> = {
  gmail: 'Gmail',
  apple_mail: 'Apple Mail',
  outlook: 'Outlook',
  outlook_web: 'Outlook (web)',
  yahoo: 'Yahoo Mail',
  aol: 'AOL Mail',
  samsung_mail: 'Samsung Email',
  thunderbird: 'Thunderbird',
  windows_mail: 'Windows Mail',
  superhuman: 'Superhuman',
  proton: 'Proton Mail',
  fastmail: 'Fastmail',
  seznam: 'Seznam Email',
};

/**
 * Detect the email client from the User-Agent.
 * Order matters: proxy/app signatures are checked before generic browser ones.
 */
function detectEmailClient(ua: string): string | null {
  const s = ua.toLowerCase();
  if (!s) return null;

  // Proxy / prefetch signatures (server-side image fetchers)
  if (s.includes('googleimageproxy') || s.includes('via ggpht.com')) return 'gmail';
  if (s.includes('yahoomailproxy') || s.includes('ymailatgateway')) return 'yahoo';
  if (s.includes('mail.seznam.cz') || s.includes('seznamemailproxy')) return 'seznam';

  // Native / desktop / mobile clients
  if (s.includes('superhuman')) return 'superhuman';
  if (s.includes('thunderbird')) return 'thunderbird';
  if (s.includes('samsung') && (s.includes('mail') || s.includes('sm-'))) return 'samsung_mail';
  if (s.includes('protonmail') || s.includes('proton mail')) return 'proton';
  if (s.includes('fastmail')) return 'fastmail';

  // Microsoft Outlook — desktop (Word engine "MSOffice"/"Microsoft Outlook") or Windows Mail
  if (s.includes('microsoft outlook') || s.includes('msoffice') || /\boutlook\b/.test(s)) {
    return 'outlook';
  }
  if (s.includes('windowsmail') || s.includes('windows mail')) return 'windows_mail';
  if (s.includes('aolmail') || s.includes('aol mail')) return 'aol';

  // Apple Mail: WebKit on Apple platforms without a browser engine marker.
  // (Real Safari/Chrome carry "Chrome"/"CriOS"/"Version.*Safari"; Apple Mail does not.)
  const isApplePlatform =
    s.includes('macintosh') || s.includes('iphone') || s.includes('ipad') || s.includes('ipod');
  const looksLikeBrowser =
    s.includes('chrome') ||
    s.includes('crios') ||
    s.includes('firefox') ||
    s.includes('edg/') ||
    s.includes('opr/');
  if (isApplePlatform && s.includes('applewebkit') && !looksLikeBrowser) {
    return 'apple_mail';
  }

  // Web clients rendered in a real browser tab
  if (s.includes('outlook.live.com') || s.includes('outlook.office')) return 'outlook_web';

  return null;
}

/** Detect the device form-factor. */
function detectDevice(ua: string): DeviceType {
  const s = ua.toLowerCase();
  if (!s) return 'unknown';

  // Tablets first (an Android tablet lacks the "mobile" token; iPad is explicit)
  if (
    s.includes('ipad') ||
    s.includes('tablet') ||
    s.includes('playbook') ||
    s.includes('kindle') ||
    s.includes('silk') ||
    (s.includes('android') && !s.includes('mobile'))
  ) {
    return 'tablet';
  }

  if (
    s.includes('mobile') ||
    s.includes('iphone') ||
    s.includes('ipod') ||
    s.includes('android') ||
    s.includes('blackberry') ||
    s.includes('iemobile') ||
    s.includes('opera mini') ||
    s.includes('windows phone')
  ) {
    return 'mobile';
  }

  // Desktop platforms
  if (
    s.includes('macintosh') ||
    s.includes('windows nt') ||
    s.includes('x11') ||
    s.includes('linux') ||
    s.includes('cros')
  ) {
    return 'desktop';
  }

  return 'unknown';
}

/**
 * Parse a User-Agent string into a device form-factor + normalized email client.
 * Empty/missing UA → { deviceType: 'unknown', emailClient: null }.
 */
export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
  const ua = (userAgent ?? '').trim();
  return {
    deviceType: detectDevice(ua),
    emailClient: detectEmailClient(ua),
  };
}
