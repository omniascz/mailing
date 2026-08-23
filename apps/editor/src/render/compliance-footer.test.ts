import { describe, it, expect } from 'vitest';
import { renderEmail } from './render.js';
import type { EmailSchema } from '../schema/blocks.js';

/**
 * Marketing mail cannot leave without an opt-out and a postal address.
 *
 * It used to depend on the template carrying a footer block, and 61 of the 81
 * built-in templates do not. Measured against the previous renderer:
 *
 *   footerless template -> has unsubscribe: false, has address: false
 *
 * The address and the link were attached inside renderFooter, so a template
 * with no footer block simply skipped both. Nothing downstream noticed: the
 * List-Unsubscribe header is set unconditionally by the batch sender, so the
 * headers looked right while the body carried nothing a reader could click.
 */

const GS = {
  backgroundColor: '#fff',
  contentBackgroundColor: '#fff',
  fontFamily: 'Arial',
  linkColor: '#00f',
  textColor: '#000',
  contentWidth: 600,
};

const text = (id: string, content: string) => ({
  id,
  type: 'text' as const,
  content,
  fontSize: '15px',
  fontFamily: 'Arial',
  color: '#000',
  lineHeight: '1.6',
  textAlign: 'left' as const,
});

const footer = (showUnsubscribe: boolean) => ({
  id: 'f1',
  type: 'footer' as const,
  content: '© 2026 Obchod',
  showUnsubscribe,
  textAlign: 'center' as const,
  fontSize: '12px',
  color: '#6b7280',
});

const schema = (blocks: unknown[]) =>
  ({ subject: 's', preheader: 'p', globalStyles: GS, blocks }) as unknown as EmailSchema;

const SYSTEM = {
  system: {
    companyName: 'Obchod s.r.o.',
    companyAddress: 'Nádražní 1, 110 00 Praha',
    unsubscribeUrl: 'https://t.example/u/abc',
  },
} as never;

const FOOTERLESS = schema([text('t1', '<p>Akce jen dnes.</p>')]);

describe('marketing mail always carries an opt-out and an address', () => {
  it('a template with NO footer block still renders both', () => {
    const { html } = renderEmail(FOOTERLESS, { context: SYSTEM, stream: 'broadcast' });
    expect(html, 'no unsubscribe link in a marketing email').toContain('https://t.example/u/abc');
    expect(html, 'no postal address in a marketing email').toContain('Nádražní 1, 110 00 Praha');
  });

  it('the triggered stream is marketing too', () => {
    const { html } = renderEmail(FOOTERLESS, { context: SYSTEM, stream: 'triggered' });
    expect(html).toContain('https://t.example/u/abc');
  });

  it('an unspecified stream is treated as marketing', () => {
    // The default has to fail safe: a caller that forgets gets the compliant
    // outcome, not the silent one.
    const { html } = renderEmail(FOOTERLESS, { context: SYSTEM });
    expect(html).toContain('https://t.example/u/abc');
  });

  it('a template that sets showUnsubscribe: false cannot switch it off', () => {
    const { html } = renderEmail(schema([text('t1', '<p>x</p>'), footer(false)]), {
      context: SYSTEM,
      stream: 'broadcast',
    });
    expect(html, 'a template must not be able to remove the opt-out').toContain(
      'https://t.example/u/abc',
    );
  });

  it('does not add a second one when the template already has a footer', () => {
    const { html } = renderEmail(schema([text('t1', '<p>x</p>'), footer(true)]), {
      context: SYSTEM,
      stream: 'broadcast',
    });
    const occurrences = html.split('https://t.example/u/abc').length - 1;
    expect(occurrences, 'the opt-out is duplicated').toBe(1);
  });

  it('falls back to the merge tag when the caller supplies no URL', () => {
    const { html } = renderEmail(FOOTERLESS, { stream: 'broadcast' });
    expect(html).toContain('{{unsubscribe_url}}');
  });

  it('reports the opt-out URL in links, so the link checker sees it', () => {
    const { links } = renderEmail(FOOTERLESS, { context: SYSTEM, stream: 'broadcast' });
    expect(links).toContain('https://t.example/u/abc');
  });
});

describe('transactional mail carries neither', () => {
  it('a footerless transactional template gets no opt-out', () => {
    const { html } = renderEmail(FOOTERLESS, { context: SYSTEM, stream: 'transactional' });
    expect(html, 'a password reset must not offer to unsubscribe').not.toContain(
      'https://t.example/u/abc',
    );
    expect(html.toLowerCase()).not.toContain('unsubscribe');
  });

  it('honours showUnsubscribe: false on a transactional footer', () => {
    const { html } = renderEmail(schema([text('t1', '<p>x</p>'), footer(false)]), {
      context: SYSTEM,
      stream: 'transactional',
    });
    expect(html).not.toContain('https://t.example/u/abc');
    // The footer block itself still renders — this is about the opt-out only.
    expect(html).toContain('© 2026 Obchod');
  });

  it('honours showUnsubscribe: true on a transactional footer', () => {
    // A transactional template that explicitly asks for one still gets it; the
    // stream removes the obligation, not the option.
    const { html } = renderEmail(schema([text('t1', '<p>x</p>'), footer(true)]), {
      context: SYSTEM,
      stream: 'transactional',
    });
    expect(html).toContain('https://t.example/u/abc');
  });
});

describe('the opt-out label follows the template language', () => {
  it('renders Czech for cs', () => {
    const { html } = renderEmail(FOOTERLESS, {
      context: SYSTEM,
      stream: 'broadcast',
      locale: 'cs',
    });
    expect(html).toContain('Odhlásit z odběru');
    expect(html).not.toContain('>Unsubscribe<');
  });

  it('renders Slovak for sk', () => {
    const { html } = renderEmail(FOOTERLESS, {
      context: SYSTEM,
      stream: 'broadcast',
      locale: 'sk',
    });
    expect(html).toContain('Odhlásiť z odberu');
  });

  it('falls back to English when no locale is given', () => {
    const { html } = renderEmail(FOOTERLESS, { context: SYSTEM, stream: 'broadcast' });
    expect(html).toContain('Unsubscribe');
  });

  it('localises a footer block the template supplied, not just the appended one', () => {
    const { html } = renderEmail(schema([text('t1', '<p>x</p>'), footer(true)]), {
      context: SYSTEM,
      stream: 'broadcast',
      locale: 'cs',
    });
    expect(html).toContain('Odhlásit z odběru');
  });
});

describe('the postal address', () => {
  it('is omitted, without breaking the render, when the org has none', () => {
    const { html } = renderEmail(FOOTERLESS, {
      context: { system: { unsubscribeUrl: 'https://t.example/u/abc' } } as never,
      stream: 'broadcast',
    });
    expect(html).toContain('https://t.example/u/abc');
    expect(html).toContain('</html>');
  });
});
