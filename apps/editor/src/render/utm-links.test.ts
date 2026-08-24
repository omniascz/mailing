/**
 * Which links UTM touches, and which it must not.
 *
 * The three functional links are per-recipient signed tokens, not
 * destinations. Tagging them files an unsubscribe as campaign traffic and
 * makes the archive page's numbers incomparable with the campaign's own.
 *
 * Measured on master before this change, with UTM enabled — the skip list
 * guessed from URL text and two of the three URLs this system builds contain
 * none of the words it guesses at:
 *
 *   /api/v1/unsubscribe/TOKEN   skipped
 *   /p/center/TOKEN             TAGGED   (no 'preference' in the URL)
 *   /api/v1/browser/TOKEN       TAGGED   (matched nothing at all)
 */
import { describe, it, expect } from 'vitest';
import { renderEmail } from './render.js';
import type { EmailSchema } from '../schema/blocks.js';

const GS = {
  backgroundColor: '#fff',
  contentBackgroundColor: '#fff',
  fontFamily: 'Arial',
  linkColor: '#00f',
  textColor: '#000',
  contentWidth: 600,
};

const text = (content: string) => ({
  id: 't1',
  type: 'text' as const,
  content,
  fontSize: '15px',
  fontFamily: 'Arial',
  color: '#000',
  lineHeight: '1.6',
  textAlign: 'left' as const,
});

const schema = (blocks: unknown[]) =>
  ({ subject: 's', preheader: 'p', globalStyles: GS, blocks }) as unknown as EmailSchema;

/** The URLs this system actually builds — not invented for the test. */
const UNSUB = 'https://app.forgemsg.com/api/v1/unsubscribe/TOKEN';
const PREF = 'https://app.forgemsg.com/p/center/TOKEN';
const VIEW = 'https://app.forgemsg.com/api/v1/browser/TOKEN';

const CTX = {
  system: {
    unsubscribeUrl: UNSUB,
    preferenceCenterUrl: PREF,
    viewInBrowserUrl: VIEW,
    companyName: 'Obchod s.r.o.',
    companyAddress: 'Nádražní 1, 110 00 Praha',
  },
} as never;

const UTM = { source: 'email', medium: 'newsletter', campaign: 'vanocni-sleva-2026' };

const hrefsIn = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);

describe('functional links are never tagged', () => {
  it('unsubscribe, preference centre and view-in-browser all come through clean', () => {
    const { html } = renderEmail(
      schema([
        text(
          `<a href="${UNSUB}">Odhlásit</a><a href="${PREF}">Nastavení</a><a href="${VIEW}">Zobrazit</a>`,
        ),
      ]),
      { context: CTX, utm: UTM, stream: 'broadcast' },
    );

    // Collected before asserting: a per-URL loop stops at the first failure
    // and would report only the preference centre, hiding that
    // view-in-browser is tagged too.
    const tagged = [UNSUB, PREF, VIEW].filter((url) =>
      hrefsIn(html).some((h) => h.startsWith(url) && h.includes('utm_')),
    );
    expect(tagged, 'these functional links were tagged with UTM').toEqual([]);
  });

  it('and the opt-out the renderer appends itself is clean too', () => {
    // The compliance footer's link comes from the same context, so it is
    // covered by identity rather than by luck.
    const { html } = renderEmail(schema([text('<p>Akce</p>')]), {
      context: CTX,
      utm: UTM,
      stream: 'broadcast',
    });
    const optOut = hrefsIn(html).filter((h) => h.startsWith(UNSUB));
    expect(optOut.length).toBeGreaterThan(0);
    for (const h of optOut) expect(h).not.toContain('utm_');
  });

  it('a hard-coded opt-out link that never came from the context is still skipped', () => {
    // The identity check cannot see this one; the word-matching fallback can,
    // which is why it stays.
    const { html } = renderEmail(
      schema([text('<a href="https://other.test/unsubscribe/abc">Odhlásit</a>')]),
      { context: CTX, utm: UTM, stream: 'broadcast' },
    );
    const link = hrefsIn(html).find((h) => h.includes('other.test'));
    expect(link).not.toContain('utm_');
  });
});

describe('real destinations are tagged', () => {
  it('a plain link gets all three parameters', () => {
    const { html } = renderEmail(schema([text('<a href="https://shop.test/p">Koupit</a>')]), {
      context: CTX,
      utm: UTM,
      stream: 'broadcast',
    });
    const link = hrefsIn(html).find((h) => h.includes('shop.test'))!;
    expect(link).toContain('utm_source=email');
    expect(link).toContain('utm_medium=newsletter');
    expect(link).toContain('utm_campaign=vanocni-sleva-2026');
  });

  it('a link that already has a query string gets one ? and keeps its params', () => {
    const { html } = renderEmail(
      schema([text('<a href="https://shop.test/p?id=7&amp;ref=xmas">Koupit</a>')]),
      { context: CTX, utm: UTM, stream: 'broadcast' },
    );
    const link = hrefsIn(html).find((h) => h.includes('shop.test'))!;
    expect(link.match(/\?/g), 'more than one ? in the URL').toHaveLength(1);
    expect(link).toContain('id=7');
    expect(link).toContain('ref=xmas');
    expect(link).toContain('utm_campaign=vanocni-sleva-2026');
  });

  it('a Czech campaign name is already URL-safe by the time it gets here', () => {
    // The slug is produced upstream (api services/campaigns/utm.ts); this
    // asserts the renderer does not then mangle it.
    const { html } = renderEmail(schema([text('<a href="https://shop.test/p">x</a>')]), {
      context: CTX,
      utm: { ...UTM, campaign: 'vanocni-sleva-2026' },
      stream: 'broadcast',
    });
    const link = hrefsIn(html).find((h) => h.includes('shop.test'))!;
    expect(link).toContain('utm_campaign=vanocni-sleva-2026');
    expect(link).not.toContain('%');
  });

  it('a link that already carries a utm_ keeps its own value', () => {
    const { html } = renderEmail(
      schema([text('<a href="https://shop.test/p?utm_source=partner">x</a>')]),
      { context: CTX, utm: UTM, stream: 'broadcast' },
    );
    const link = hrefsIn(html).find((h) => h.includes('shop.test'))!;
    expect(link).toContain('utm_source=partner');
    expect(link).not.toContain('utm_source=email');
  });

  it('nothing is tagged when no UTM config is supplied', () => {
    const { html } = renderEmail(schema([text('<a href="https://shop.test/p">x</a>')]), {
      context: CTX,
      stream: 'broadcast',
    });
    expect(html).not.toContain('utm_');
  });
});
