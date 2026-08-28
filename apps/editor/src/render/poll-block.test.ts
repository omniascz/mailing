import { describe, it, expect } from 'vitest';
import { renderEmail } from './render.js';
import { renderPlainText } from './plain-text.js';
import type { EmailSchema } from '../schema/blocks.js';
import type { MergeTagContext } from './merge-tags.js';

/**
 * What the poll block draws, and what it refuses to draw.
 *
 * block-coverage.test.ts already proves every type in BLOCK_TYPES survives both
 * renderers; this file is about the two things specific to a poll: the answers
 * are links only when the sender supplied per-recipient URLs, and every piece
 * of customer text is escaped on the way in.
 */

const GS = {
  backgroundColor: '#f1f5f9',
  contentBackgroundColor: '#ffffff',
  fontFamily: 'Arial, Helvetica, sans-serif',
  linkColor: '#2563eb',
  textColor: '#1f2937',
  contentWidth: 600,
};

const poll = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  type: 'poll' as const,
  question: 'Jak se vám líbil tenhle e-mail?',
  options: ['Skvělý', 'Ujde', 'Nic moc'],
  helpText: '',
  align: 'left' as const,
  fontSize: '15px',
  color: '#111827',
  buttonBackgroundColor: '#f3f4f6',
  buttonTextColor: '#111827',
  ...over,
});

const schemaWith = (block: Record<string, unknown>): EmailSchema =>
  ({
    subject: 'Anketa',
    preheader: '',
    globalStyles: GS,
    blocks: [block],
  }) as unknown as EmailSchema;

const ctxWithUrls = (urls: string[]): MergeTagContext => ({
  contact: { email: 'jana@example.test', firstName: 'Jana' },
  system: { pollUrls: { p1: urls } },
});

describe('the answers are links when the sender supplied URLs', () => {
  const URLS = [
    'https://track.example/api/v1/poll/tok0',
    'https://track.example/api/v1/poll/tok1',
    'https://track.example/api/v1/poll/tok2',
  ];

  it('renders one anchor per answer, pointing at that answer’s own URL', () => {
    const { html } = renderEmail(schemaWith(poll()), { context: ctxWithUrls(URLS) });
    expect(html).toContain('Jak se vám líbil tenhle e-mail?');
    for (const [i, label] of ['Skvělý', 'Ujde', 'Nic moc'].entries()) {
      expect(html).toContain(label);
      expect(html).toContain(`href="${URLS[i]}"`);
    }
  });

  it('puts the question and every answer in the plain-text half too', () => {
    // The half a spam filter reads and a text-only client shows. A poll missing
    // from it is a question the recipient never sees.
    const text = renderPlainText(schemaWith(poll()), { context: ctxWithUrls(URLS) });
    expect(text).toContain('Jak se vám líbil tenhle e-mail?');
    expect(text).toContain('- Skvělý: https://track.example/api/v1/poll/tok0');
    expect(text).toContain('- Nic moc: https://track.example/api/v1/poll/tok2');
  });
});

describe('with no URLs the answers are text, not dead links', () => {
  it('draws no anchor at all', () => {
    // The share block's rule: a link that cannot be honest is not rendered as a
    // link. Previews and the archive page have no recipient, so a vote link
    // there would either do nothing or vote as somebody else.
    const { html } = renderEmail(schemaWith(poll()), {
      context: { contact: { email: 'x@example.test' } },
    });
    expect(html).toContain('Jak se vám líbil tenhle e-mail?');
    expect(html).toContain('Skvělý');
    expect(html).not.toMatch(/<a [^>]*href="[^"]*\/poll\//);
  });

  it('keeps the question — losing it would hide what the email asked', () => {
    const text = renderPlainText(schemaWith(poll()), { context: {} });
    expect(text).toContain('Jak se vám líbil tenhle e-mail?');
    expect(text).toContain('- Skvělý');
    expect(text).not.toContain('http');
  });
});

describe('the question and the answers are customer text, and are escaped', () => {
  it('escapes markup in the question', () => {
    const { html } = renderEmail(
      schemaWith(poll({ question: '<script>alert(1)</script>Co myslíte?' })),
      { context: ctxWithUrls(['u0', 'u1', 'u2']) },
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('&lt;script&gt;');
  });

  it('an answer cannot become markup', () => {
    const { html } = renderEmail(
      schemaWith(poll({ options: ['<img src=x onerror=alert(1)>', 'Ujde'] })),
      { context: ctxWithUrls(['u0', 'u1']) },
    );
    // Asserted on MARKUP, not on the substring: the label is expected to appear
    // as escaped TEXT, so `not.toContain('onerror')` would fail on a body that
    // is in fact safe and would only pass once the text had been lost.
    expect(html).not.toMatch(/<img[^>]*onerror/i);
    expect(html).not.toMatch(/<[a-z][^>]*\son[a-z]+\s*=/i);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('the answer label is text content, so the href it sits in is ours alone', () => {
    // Worth pinning: the label never reaches an attribute. The only attribute
    // here is the href, and its value is the URL the SENDER minted — which is
    // why escapeHtml (no quote escaping) is the right treatment for the label
    // and escapeAttr is the right one for the URL.
    const { html } = renderEmail(schemaWith(poll({ options: ['" a "', 'Ujde'] })), {
      context: ctxWithUrls(['https://track.example/api/v1/poll/tok0', 'u1']),
    });
    expect(html).toContain('href="https://track.example/api/v1/poll/tok0"');
    expect(html).toMatch(/>" a "</);
  });

  it('escapes the help text', () => {
    const { html } = renderEmail(schemaWith(poll({ helpText: '<b>tučně</b>' })), {
      context: ctxWithUrls(['u0', 'u1', 'u2']),
    });
    expect(html).not.toContain('<b>tučně</b>');
    expect(html).toContain('&lt;b&gt;');
  });
});

describe('a poll does not get the email out of its obligations', () => {
  it('a marketing email whose only block is a poll still gets the compliance footer', () => {
    // The footer is appended by the renderer for marketing streams whatever the
    // blocks are. A poll must not be a way to send marketing mail without an
    // opt-out.
    const { html } = renderEmail(schemaWith(poll()), {
      context: {
        contact: { email: 'jana@example.test' },
        system: {
          pollUrls: { p1: ['u0', 'u1', 'u2'] },
          unsubscribeUrl: 'https://track.example/api/v1/unsubscribe/tok',
          companyName: 'Obchod s.r.o.',
          companyAddress: 'Nádražní 1, Praha',
        },
      },
      stream: 'broadcast',
    });
    expect(html).toContain('https://track.example/api/v1/unsubscribe/tok');
    expect(html).toContain('Nádražní 1, Praha');
  });
});
