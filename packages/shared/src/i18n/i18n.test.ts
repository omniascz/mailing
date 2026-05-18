import { describe, it, expect } from 'vitest';
import { t, resolveLocale, DEFAULT_LOCALE, SUPPORTED_LOCALES } from './index.js';

describe('resolveLocale', () => {
  it('defaults to cs (CZ-first launch)', () => {
    expect(DEFAULT_LOCALE).toBe('cs');
    expect(resolveLocale({})).toBe('cs');
  });

  it('honours orgLocale when supported', () => {
    expect(resolveLocale({ orgLocale: 'sk' })).toBe('sk');
    expect(resolveLocale({ orgLocale: 'en-US' })).toBe('en');
    expect(resolveLocale({ orgLocale: 'CS_CZ' })).toBe('cs');
  });

  it('falls through unsupported orgLocale to contactLocale', () => {
    expect(resolveLocale({ orgLocale: 'de', contactLocale: 'sk' })).toBe('sk');
  });

  it('parses Accept-Language with quality factors', () => {
    expect(
      resolveLocale({ acceptLanguage: 'cs-CZ,cs;q=0.9,en;q=0.8' }),
    ).toBe('cs');
    expect(
      resolveLocale({ acceptLanguage: 'de-DE,en;q=0.7,sk;q=0.9' }),
    ).toBe('sk');
    expect(resolveLocale({ acceptLanguage: 'fr,de' })).toBe('cs'); // none supported → default
  });

  it('orgLocale wins over Accept-Language', () => {
    expect(
      resolveLocale({ orgLocale: 'sk', acceptLanguage: 'en-US' }),
    ).toBe('sk');
  });
});

describe('t', () => {
  it('returns translated text per locale', () => {
    expect(t('unsubscribe_page.heading', 'cs')).toBe('Byli jste odhlášeni');
    expect(t('unsubscribe_page.heading', 'sk')).toBe('Boli ste odhlásení');
    expect(t('unsubscribe_page.heading', 'en')).toBe("You've been unsubscribed");
  });

  it('interpolates placeholders', () => {
    expect(
      t('common.footer_sent_by', 'cs', { org: 'Acme' }),
    ).toBe('Tento e-mail vám byl odeslán službou Acme.');
  });

  it('leaves unknown placeholders intact for visibility', () => {
    expect(t('common.footer_sent_by', 'cs')).toContain('{{org}}');
  });

  it('falls back to English for missing keys, then returns key', () => {
    expect(t('nonexistent.key', 'cs')).toBe('nonexistent.key');
  });

  it('covers every supported locale with every top-level section', () => {
    const sections = [
      'common',
      'doi_confirm',
      'doi_confirmed_page',
      'doi_expired_page',
      'unsubscribe_page',
      'unsubscribe_invalid_page',
      'preferences_page',
      'password_reset',
      'email_verification',
      'team_invite',
    ];
    for (const locale of SUPPORTED_LOCALES) {
      for (const section of sections) {
        // Pick a representative leaf — `heading`/`subject`/`title` or `brand` depending on section
        const probe =
          section === 'common'
            ? 'common.brand'
            : section === 'preferences_page'
              ? `${section}.heading`
              : section.endsWith('_page')
                ? `${section}.title`
                : `${section}.subject`;
        expect(t(probe, locale), `missing ${probe} for ${locale}`).not.toBe(probe);
      }
    }
  });
});
