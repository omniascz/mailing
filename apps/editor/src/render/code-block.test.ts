/**
 * The code block, and the sanitiser that makes it safe to have.
 *
 * Every case asserts on the OUTPUT. "It did not throw" would pass on a
 * sanitiser that returns its input, which is exactly the bug worth catching.
 *
 * The compliance group is the one that matters most. Two of its cases were
 * verified to FAIL on master before this branch existed — the hole is older
 * than the code block and wider than it, because text blocks have always
 * embedded their content unescaped.
 */
import { describe, it, expect } from 'vitest';
import { renderEmail } from './render.js';
import { renderPlainText } from './plain-text.js';
import { sanitizeUserHtml, stripControlMarkers, OPT_OUT_MARKER_ATTR } from './sanitize.js';
import { emailSchema, type EmailSchema } from '../schema/blocks.js';

const GS = {
  backgroundColor: '#fff',
  contentBackgroundColor: '#fff',
  fontFamily: 'Arial',
  linkColor: '#00f',
  textColor: '#000',
  contentWidth: 600,
};

const code = (html: string) => ({ id: 'c1', type: 'code' as const, html });
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

const SYSTEM = {
  system: {
    companyName: 'Obchod s.r.o.',
    companyAddress: 'Nádražní 1, 110 00 Praha',
    unsubscribeUrl: 'https://t.example/u/abc',
  },
} as never;

const htmlOf = (blocks: unknown[]) =>
  renderEmail(schema(blocks), { context: SYSTEM, stream: 'broadcast' }).html;

describe('the code block renders', () => {
  it('puts the customer HTML in the body', () => {
    const out = htmlOf([code('<p class="promo">Akce jen dnes</p>')]);
    expect(out).toContain('<p class="promo">Akce jen dnes</p>');
  });

  it('resolves merge tags inside it', () => {
    const out = renderEmail(schema([code('<p>Dobrý den {{first_name}}</p>')]), {
      context: { contact: { firstName: 'Jana' }, ...(SYSTEM as object) } as never,
      stream: 'broadcast',
    }).html;
    expect(out).toContain('Dobrý den Jana');
  });

  it('keeps table layout, which is the reason the block exists', () => {
    const out = htmlOf([
      code(
        '<table role="presentation"><tr><td bgcolor="#eee" style="padding:8px;">A</td></tr></table>',
      ),
    ]);
    expect(out).toContain('<table role="presentation">');
    expect(out).toContain('bgcolor="#eee"');
    expect(out).toContain('style="padding:8px"');
  });

  it('contributes its visible words to the text part', () => {
    const out = renderPlainText(schema([code('<div><h2>Nadpis</h2><p>Tělo zprávy.</p></div>')]), {
      context: SYSTEM,
      stream: 'broadcast',
    });
    expect(out).toContain('Nadpis');
    expect(out).toContain('Tělo zprávy.');
    expect(out).not.toContain('<h2>');
  });

  it('and nothing at all when it has no words', () => {
    // No invented "[HTML block]" placeholder: that would put words in the
    // message the sender never wrote.
    const out = renderPlainText(schema([code('<img src="https://x.test/pixel.gif" alt="" />')]), {
      context: SYSTEM,
      stream: 'transactional',
    });
    expect(out).toBe('s\n\np');
  });

  it('is a valid block as far as the schema is concerned', () => {
    const parsed = emailSchema.safeParse({
      subject: 's',
      preheader: '',
      globalStyles: GS,
      blocks: [code('<p>x</p>')],
    });
    expect(parsed.success).toBe(true);
  });
});

describe('what the sanitiser refuses', () => {
  it('a script tag, contents and all', () => {
    const out = sanitizeUserHtml(
      '<p>before</p><script>alert(document.cookie)</script><p>after</p>',
    );
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(document.cookie)');
    expect(out).toContain('<p>before</p>');
    expect(out).toContain('<p>after</p>');
  });

  it('an event-handler attribute, keeping the element', () => {
    const out = sanitizeUserHtml('<img src="https://x.test/a.png" onerror="alert(1)" alt="a" />');
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('src="https://x.test/a.png"');
  });

  it('a javascript: href, keeping the link text', () => {
    const out = sanitizeUserHtml('<a href="javascript:alert(1)">Klikni</a>');
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain('Klikni');
  });

  it('a data: URL in an href — but allows one in an image', () => {
    // data:text/html is a navigation into an attacker-authored document;
    // data:image is how inline logos are embedded.
    expect(sanitizeUserHtml('<a href="data:text/html,<h1>x">y</a>')).not.toContain(
      'data:text/html',
    );
    expect(sanitizeUserHtml('<img src="data:image/png;base64,iVBORw0KGgo=" alt="" />')).toContain(
      'data:image/png',
    );
  });

  it('an iframe and an embedded object', () => {
    const out = sanitizeUserHtml(
      '<iframe src="https://evil.test/"></iframe><object data="x.swf"></object>',
    );
    expect(out).not.toContain('<iframe');
    expect(out).not.toContain('<object');
  });

  it('a style element — a stylesheet reaches the rest of the archive page', () => {
    const out = sanitizeUserHtml('<style>body{display:none}</style><p>hi</p>');
    expect(out).not.toContain('<style');
    expect(out).not.toContain('display:none');
    expect(out).toContain('<p>hi</p>');
  });

  it('CSS that is a scripting vector, keeping the rest of the declaration', () => {
    const out = sanitizeUserHtml(
      '<div style="color:red;background:url(javascript:alert(1));width:100%">x</div>',
    );
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain('color:red');
    expect(out).toContain('width:100%');
  });

  it('a form and its inputs', () => {
    const out = sanitizeUserHtml('<form action="https://evil.test"><input name="pw" /></form>');
    expect(out).not.toContain('<form');
    expect(out).not.toContain('<input');
  });

  it('markup that arrived through a merge tag, not just markup that was typed', () => {
    // An importer can produce a contact whose first name is an <img onerror>.
    // Sanitising after substitution is what covers this.
    const out = renderEmail(schema([code('<p>Ahoj {{first_name}}</p>')]), {
      context: {
        contact: { firstName: '<img src=x onerror=alert(1)>' },
        system: { unsubscribeUrl: 'https://t.example/u/abc' },
      } as never,
      stream: 'broadcast',
    }).html;
    expect(out).not.toMatch(/onerror/i);
  });
});

describe('the code block cannot switch off the opt-out', () => {
  /**
   * `renderEmail` appends the compliance footer unless the body already
   * carries `data-fm-optout="1"`. That marker is a private signal between two
   * halves of the renderer; customer HTML that can write it can suppress the
   * only link the law requires.
   *
   * Measured on master, with a plain TEXT block and no code block at all:
   *   HTML contains real opt-out URL: false
   *   HTML contains forged marker:    true
   */
  /**
   * The genuine footer carries the marker, so "absent from the body" is the
   * wrong assertion — the right one is that exactly ONE row has it, the one
   * the renderer wrote. Two would mean the forgery survived.
   */
  const markerCount = (html: string) => html.split('data-fm-optout').length - 1;

  it('a forged marker attribute does not suppress the footer', () => {
    const out = htmlOf([code('<p data-fm-optout="1">Unsubscribe (not really)</p>')]);
    expect(out, 'the real opt-out link is missing').toContain('https://t.example/u/abc');
    expect(markerCount(out), 'the forged marker survived into the body').toBe(1);
    // The customer's own paragraph kept its text and lost only the attribute.
    expect(out).toContain('Unsubscribe (not really)');
    expect(out).not.toContain('<p data-fm-optout');
  });

  it('nor does the same trick in a text block', () => {
    const out = htmlOf([text('<p data-fm-optout="1">Unsubscribe (not really)</p>')]);
    expect(out).toContain('https://t.example/u/abc');
    expect(markerCount(out)).toBe(1);
  });

  it('nor a marker smuggled through a merge tag', () => {
    const out = renderEmail(schema([code('<p {{evil}}>x</p>')]), {
      context: {
        contact: { evil: 'data-fm-optout="1"' },
        system: { unsubscribeUrl: 'https://t.example/u/abc' },
      } as never,
      stream: 'broadcast',
    }).html;
    expect(out).toContain('https://t.example/u/abc');
    expect(markerCount(out)).toBe(1);
  });

  it('the word "unsubscribe" with no link does not count as one', () => {
    const out = htmlOf([code('<p>To unsubscribe, reply to this email.</p>')]);
    // The sentence stays; the real link is appended alongside it.
    expect(out).toContain('To unsubscribe, reply to this email.');
    expect(out).toContain('https://t.example/u/abc');
  });

  /**
   * Which of the two defences is actually doing the work.
   *
   * Deleting stripControlMarkers leaves every case above green — the attribute
   * allowlist is what drops the marker. That makes the allowlist the thing to
   * pin: allowing `data-*` (a plausible future edit) would reopen the hole
   * without any other test noticing.
   */
  it('the marker attribute is not something the allowlist could ever pass', () => {
    const out = sanitizeUserHtml(`<p ${OPT_OUT_MARKER_ATTR}="1" data-other="2">x</p>`);
    expect(out).not.toContain(OPT_OUT_MARKER_ATTR);
    // …and the second defence removes it on its own, for the day the list
    // grows a `data-*` entry.
    expect(stripControlMarkers(`<p ${OPT_OUT_MARKER_ATTR}="1">x</p>`)).not.toContain(
      OPT_OUT_MARKER_ATTR,
    );
    expect(stripControlMarkers('a <<fm-optout>> b')).toBe('a  b');
  });

  it('and the plain-text sentinel cannot be forged either', () => {
    const out = renderPlainText(schema([code('<<fm-optout>>Unsubscribe (not really)')]), {
      context: SYSTEM,
      stream: 'broadcast',
    });
    expect(out).toContain('https://t.example/u/abc');
    expect(out).not.toContain('fm-optout');
  });
});
