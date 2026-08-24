/**
 * Share buttons for the recipient.
 *
 * The two things that can go wrong are both about the target URL: pointing at
 * the wrong thing, and pointing at nothing. The first is a privacy problem —
 * the per-recipient unsubscribe token is also a URL in this email, and sharing
 * it hands a stranger control of someone's subscription. The second is a
 * public one: an unresolved `{{view_in_browser_url}}` posted to Facebook stays
 * there.
 */
import { describe, it, expect } from 'vitest';
import { renderEmail } from './render.js';
import { renderPlainText } from './plain-text.js';
import { isShareableUrl, shareTargets } from './share.js';
import type { EmailSchema, ShareBlock } from '../schema/blocks.js';

const GS = {
  backgroundColor: '#fff',
  contentBackgroundColor: '#fff',
  fontFamily: 'Arial',
  linkColor: '#00f',
  textColor: '#000',
  contentWidth: 600,
};

const share = (over: Partial<ShareBlock> = {}) =>
  ({
    id: 's1',
    type: 'share' as const,
    networks: ['email', 'facebook', 'x', 'whatsapp'],
    shareText: '',
    label: 'Share this email',
    align: 'center' as const,
    fontSize: '13px',
    color: '#2563eb',
    ...over,
  }) as ShareBlock;

const schema = (blocks: unknown[]) =>
  ({ subject: 's', preheader: 'p', globalStyles: GS, blocks }) as unknown as EmailSchema;

const VIEW = 'https://mail.example/b/tok123';
const ctxWith = (viewInBrowserUrl?: string) =>
  ({
    system: {
      companyName: 'Obchod',
      companyAddress: 'Praha',
      unsubscribeUrl: 'https://t.example/u/PRIVATE-TOKEN',
      ...(viewInBrowserUrl ? { viewInBrowserUrl } : {}),
    },
  }) as never;

describe('where the buttons point', () => {
  it('every network targets the view-in-browser URL', () => {
    const { html } = renderEmail(schema([share()]), {
      context: ctxWith(VIEW),
      stream: 'broadcast',
    });
    const encoded = encodeURIComponent(VIEW);

    expect(html).toContain(`https://www.facebook.com/sharer/sharer.php?u=${encoded}`);
    expect(html).toContain(`https://twitter.com/intent/tweet?url=${encoded}`);
    expect(html).toContain(`https://wa.me/?text=${encoded}`);
    expect(html).toContain(`mailto:?subject=&amp;body=${encoded}`);
  });

  it('never the per-recipient unsubscribe token', () => {
    // The other URL in this email. Sharing it would hand someone else control
    // of the recipient's subscription.
    const { html } = renderEmail(schema([share()]), {
      context: ctxWith(VIEW),
      stream: 'broadcast',
    });
    const shareLinks =
      html.match(
        /href="(mailto:[^"]*|https:\/\/(?:www\.)?(?:facebook|twitter|wa\.me|linkedin)[^"]*)"/g,
      ) ?? [];
    expect(shareLinks.length).toBeGreaterThan(0);
    for (const link of shareLinks) expect(link).not.toContain('PRIVATE-TOKEN');
  });

  it('carries the share text where the network supports one', () => {
    const { html } = renderEmail(schema([share({ shareText: 'Podívej se na tohle' })]), {
      context: ctxWith(VIEW),
      stream: 'broadcast',
    });
    const t = encodeURIComponent('Podívej se na tohle');
    expect(html).toContain(`&amp;text=${t}`); // x
    expect(html).toContain(`mailto:?subject=${t}`); // email
  });

  it('resolves merge tags in the share text and the label', () => {
    const { html } = renderEmail(
      schema([share({ shareText: 'Pro {{first_name}}', label: 'Sdílet, {{first_name}}' })]),
      {
        context: {
          contact: { firstName: 'Jana' },
          system: { unsubscribeUrl: 'https://t.example/u/x', viewInBrowserUrl: VIEW },
        } as never,
        stream: 'broadcast',
      },
    );
    expect(html).toContain(encodeURIComponent('Pro Jana'));
    expect(html).toContain('Sdílet, Jana');
  });

  it('honours the chosen set of networks and nothing else', () => {
    const { html } = renderEmail(schema([share({ networks: ['email', 'linkedin'] })]), {
      context: ctxWith(VIEW),
      stream: 'broadcast',
    });
    expect(html).toContain('linkedin.com/sharing/share-offsite');
    expect(html).toContain('mailto:');
    expect(html).not.toContain('facebook.com/sharer');
    expect(html).not.toContain('wa.me');
  });

  it('lists the same links in the text part', () => {
    const out = renderPlainText(schema([share()]), { context: ctxWith(VIEW), stream: 'broadcast' });
    expect(out).toContain('Share this email');
    expect(out).toContain(`Facebook: https://www.facebook.com/sharer/sharer.php?u=`);
    expect(out).toContain('Forward: mailto:');
  });
});

describe('when there is nothing to share', () => {
  it('the block renders nothing rather than a broken link', () => {
    const { html } = renderEmail(schema([share()]), { context: ctxWith(), stream: 'broadcast' });
    expect(html).not.toContain('facebook.com/sharer');
    expect(html).not.toContain('wa.me');
    expect(html).not.toContain('Share this email');
  });

  it('and nothing in the text part either', () => {
    const out = renderPlainText(schema([share()]), { context: ctxWith(), stream: 'broadcast' });
    expect(out).not.toContain('Facebook:');
    expect(out).not.toContain('Share this email');
  });

  it('an unresolved merge tag counts as nothing to share', () => {
    // parseMergeTags leaves the tag alone when the context has no value; that
    // string in a Facebook share URL is permanent.
    expect(isShareableUrl('{{view_in_browser_url}}')).toBe(false);
    expect(shareTargets(share(), ctxWith('{{view_in_browser_url}}'))).toHaveLength(0);
  });

  it('so does a relative or non-http URL', () => {
    expect(isShareableUrl('/b/tok123')).toBe(false);
    expect(isShareableUrl('javascript:alert(1)')).toBe(false);
    expect(isShareableUrl('')).toBe(false);
    expect(isShareableUrl(undefined)).toBe(false);
    expect(isShareableUrl(VIEW)).toBe(true);
  });

  it('the rest of the email is unaffected — including the opt-out', () => {
    const { html } = renderEmail(schema([share()]), { context: ctxWith(), stream: 'broadcast' });
    expect(html).toContain('https://t.example/u/PRIVATE-TOKEN');
    expect(html).toContain('Praha');
  });
});

describe('share is not social', () => {
  it('the two blocks coexist and point at different things', () => {
    const social = {
      id: 'soc1',
      type: 'social' as const,
      networks: [{ type: 'facebook' as const, url: 'https://facebook.com/obchod' }],
      iconSize: 32,
      align: 'center' as const,
    };
    const { html } = renderEmail(schema([social, share({ networks: ['facebook'] })]), {
      context: ctxWith(VIEW),
      stream: 'broadcast',
    });
    // social → the sender's own page. share → the campaign.
    expect(html).toContain('href="https://facebook.com/obchod"');
    expect(html).toContain(`sharer.php?u=${encodeURIComponent(VIEW)}`);
  });
});
