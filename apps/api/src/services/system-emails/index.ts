/**
 * System-email content renderers (#385).
 *
 * Produces localized `{ subject, html, text }` for transactional system
 * emails (opt-in confirmation, unsubscribe notifications, password reset,
 * email verification, team invite). Sending is wired up elsewhere (Phase 3
 * MTA/engine); this module only renders content so the wiring step can
 * pick a locale-aware body.
 */

import { t, type SupportedLocale } from '@forgemsg/shared';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BASE_STYLE =
  'body{font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:40px auto;padding:0 20px;color:#1e293b;line-height:1.55}h1{color:#0f172a;font-size:22px;margin:0 0 16px}p{color:#334155;margin:0 0 14px}.btn{display:inline-block;padding:12px 22px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;margin:20px 0;font-weight:600}.footer{color:#64748b;font-size:13px;margin-top:40px;border-top:1px solid #e2e8f0;padding-top:16px}a{color:#4f46e5}';

function wrap(
  locale: SupportedLocale,
  subject: string,
  innerHtml: string,
  footerHtml: string,
): string {
  return `<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"><title>${subject}</title><style>${BASE_STYLE}</style></head><body>${innerHtml}<div class="footer">${footerHtml}</div></body></html>`;
}

function footer(locale: SupportedLocale, orgName: string): string {
  return t('common.footer_sent_by', locale, { org: orgName });
}

/** Double opt-in confirmation email. */
export function renderDoiConfirmEmail(opts: {
  locale: SupportedLocale;
  confirmUrl: string;
  orgName: string;
}): RenderedEmail {
  const { locale, confirmUrl, orgName } = opts;
  const subject = t('doi_confirm.subject', locale);
  const heading = t('doi_confirm.heading', locale);
  const intro = t('doi_confirm.body_intro', locale);
  const cta = t('doi_confirm.cta', locale);
  const ignore = t('doi_confirm.ignore_if_not_yours', locale);
  const expires = t('doi_confirm.expires_in', locale);
  const inner = `<h1>${heading}</h1><p>${intro}</p><p><a class="btn" href="${confirmUrl}">${cta}</a></p><p>${expires}</p><p>${ignore}</p>`;
  const text = [heading, '', intro, '', `${cta}: ${confirmUrl}`, '', expires, ignore].join('\n');
  return { subject, html: wrap(locale, subject, inner, footer(locale, orgName)), text };
}

/** Password-reset email (account users, not contacts). */
export function renderPasswordResetEmail(opts: {
  locale: SupportedLocale;
  resetUrl: string;
  userEmail: string;
  orgName: string;
}): RenderedEmail {
  const { locale, resetUrl, userEmail, orgName } = opts;
  const subject = t('password_reset.subject', locale);
  const heading = t('password_reset.heading', locale);
  const intro = t('password_reset.body_intro', locale, { email: userEmail });
  const cta = t('password_reset.cta', locale);
  const ignore = t('password_reset.ignore_if_not_yours', locale);
  const expires = t('password_reset.expires_in', locale);
  const inner = `<h1>${heading}</h1><p>${intro}</p><p><a class="btn" href="${resetUrl}">${cta}</a></p><p>${expires}</p><p>${ignore}</p>`;
  const text = [heading, '', intro, '', `${cta}: ${resetUrl}`, '', expires, ignore].join('\n');
  return { subject, html: wrap(locale, subject, inner, footer(locale, orgName)), text };
}

/** E-mail verification after signup. */
export function renderEmailVerificationEmail(opts: {
  locale: SupportedLocale;
  verifyUrl: string;
  userEmail: string;
  orgName: string;
}): RenderedEmail {
  const { locale, verifyUrl, userEmail, orgName } = opts;
  const brand = t('common.brand', locale);
  const subject = t('email_verification.subject', locale);
  const heading = t('email_verification.heading', locale);
  const intro = t('email_verification.body_intro', locale, { brand, email: userEmail });
  const cta = t('email_verification.cta', locale);
  const inner = `<h1>${heading}</h1><p>${intro}</p><p><a class="btn" href="${verifyUrl}">${cta}</a></p>`;
  const text = [heading, '', intro, '', `${cta}: ${verifyUrl}`].join('\n');
  return { subject, html: wrap(locale, subject, inner, footer(locale, orgName)), text };
}

/** Team invitation email. */
export function renderTeamInviteEmail(opts: {
  locale: SupportedLocale;
  acceptUrl: string;
  inviterName: string;
  orgName: string;
}): RenderedEmail {
  const { locale, acceptUrl, inviterName, orgName } = opts;
  const brand = t('common.brand', locale);
  const subject = t('team_invite.subject', locale, { inviter: inviterName, org: orgName });
  const heading = t('team_invite.heading', locale);
  const intro = t('team_invite.body_intro', locale, { inviter: inviterName, org: orgName, brand });
  const cta = t('team_invite.cta', locale);
  const inner = `<h1>${heading}</h1><p>${intro}</p><p><a class="btn" href="${acceptUrl}">${cta}</a></p>`;
  const text = [heading, '', intro, '', `${cta}: ${acceptUrl}`].join('\n');
  return { subject, html: wrap(locale, subject, inner, footer(locale, orgName)), text };
}
