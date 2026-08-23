import { describe, it, expect } from 'vitest';
import { renderPlainText } from './plain-text.js';
import { renderEmail } from './render.js';
import type { EmailSchema } from '../schema/blocks.js';

/**
 * The text half of a multipart message is the message too.
 *
 * PR #46 closed the HTML side: marketing mail always gets an opt-out and a
 * postal address, whether or not the template has a footer block. The text
 * alternative kept its old behaviour, so the same message went out with a
 * lawful HTML part and a text part that had neither — the half a filter reads
 * when it scores the mail, and the half a text-only client shows.
 *
 * Both renderers now take the decision from render/compliance.ts. These assert
 * they agree, because two renderers with two copies of the rule is exactly how
 * this happened.
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

describe('plain text — marketing', () => {
  it('a template with NO footer block still gets an opt-out and an address', () => {
    const out = renderPlainText(FOOTERLESS, { context: SYSTEM, stream: 'broadcast' });
    expect(out, 'no opt-out in the text part').toContain('https://t.example/u/abc');
    expect(out, 'no postal address in the text part').toContain('Nádražní 1, 110 00 Praha');
  });

  it('an unspecified stream is treated as marketing, same as the HTML side', () => {
    const out = renderPlainText(FOOTERLESS, { context: SYSTEM });
    expect(out).toContain('https://t.example/u/abc');
  });

  it('a template that sets showUnsubscribe: false cannot switch it off', () => {
    const out = renderPlainText(schema([text('t1', '<p>x</p>'), footer(false)]), {
      context: SYSTEM,
      stream: 'broadcast',
    });
    expect(out).toContain('https://t.example/u/abc');
  });

  it('does not repeat the opt-out when the template already carries one', () => {
    const out = renderPlainText(schema([text('t1', '<p>x</p>'), footer(true)]), {
      context: SYSTEM,
      stream: 'broadcast',
    });
    expect(out.split('https://t.example/u/abc').length - 1).toBe(1);
  });

  it('a footer block gets the address too, not just the appended row', () => {
    const out = renderPlainText(schema([text('t1', '<p>x</p>'), footer(true)]), {
      context: SYSTEM,
      stream: 'broadcast',
    });
    expect(out).toContain('Nádražní 1, 110 00 Praha');
  });

  it('leaves no marker in the output', () => {
    const out = renderPlainText(schema([text('t1', '<p>x</p>'), footer(true)]), {
      context: SYSTEM,
      stream: 'broadcast',
    });
    expect(out).not.toContain('fm-optout');
  });
});

describe('plain text — transactional', () => {
  it('gets neither', () => {
    const out = renderPlainText(FOOTERLESS, { context: SYSTEM, stream: 'transactional' });
    expect(out).not.toContain('https://t.example/u/abc');
    expect(out.toLowerCase()).not.toContain('unsubscribe');
  });

  it('honours showUnsubscribe: false', () => {
    const out = renderPlainText(schema([text('t1', '<p>x</p>'), footer(false)]), {
      context: SYSTEM,
      stream: 'transactional',
    });
    expect(out).not.toContain('https://t.example/u/abc');
    expect(out).toContain('© 2026 Obchod');
  });
});

describe('plain text — language', () => {
  it('renders the Czech label for cs', () => {
    const out = renderPlainText(FOOTERLESS, {
      context: SYSTEM,
      stream: 'broadcast',
      locale: 'cs',
    });
    expect(out).toContain('Odhlásit z odběru:');
    expect(out).not.toContain('Unsubscribe:');
  });

  it('falls back to English', () => {
    const out = renderPlainText(FOOTERLESS, { context: SYSTEM, stream: 'broadcast' });
    expect(out).toContain('Unsubscribe:');
  });
});

describe('the two renderers agree', () => {
  const cases = [
    ['broadcast', true],
    ['triggered', true],
    ['transactional', false],
  ] as const;

  it.each(cases)('%s: both parts carry the opt-out = %s', (stream, expected) => {
    const html = renderEmail(FOOTERLESS, { context: SYSTEM, stream }).html;
    const txt = renderPlainText(FOOTERLESS, { context: SYSTEM, stream });
    expect(html.includes('https://t.example/u/abc'), `html for ${stream}`).toBe(expected);
    expect(txt.includes('https://t.example/u/abc'), `text for ${stream}`).toBe(expected);
  });

  it('and on the language of the label', () => {
    const html = renderEmail(FOOTERLESS, {
      context: SYSTEM,
      stream: 'broadcast',
      locale: 'cs',
    }).html;
    const txt = renderPlainText(FOOTERLESS, {
      context: SYSTEM,
      stream: 'broadcast',
      locale: 'cs',
    });
    expect(html).toContain('Odhlásit z odběru');
    expect(txt).toContain('Odhlásit z odběru');
  });
});
