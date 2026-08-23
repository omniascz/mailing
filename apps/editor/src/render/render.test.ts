import { describe, expect, it } from 'vitest';
import type { EmailSchema } from '../schema/blocks.js';
import { createBlock, createEmptyEmail } from '../schema/factory.js';
import { renderEmail } from './render.js';

function emailWith(blocks: EmailSchema['blocks']): EmailSchema {
  return { ...createEmptyEmail(), subject: 'Test', blocks };
}

describe('renderEmail', () => {
  it('produces a complete XHTML document', () => {
    const { html } = renderEmail(emailWith([]));
    expect(html).toMatch(/^<!DOCTYPE html/);
    expect(html).toContain('</html>');
    expect(html).toContain('role="presentation"');
    expect(html).toContain('color-scheme');
  });

  it('escapes the subject and preheader', () => {
    const email = emailWith([]);
    email.subject = '<script>alert(1)</script>';
    email.preheader = 'Hi & bye';
    const { html } = renderEmail(email);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Hi &amp; bye');
  });

  it('renders merge tags in a text block', () => {
    const text = createBlock('text');
    if (text.type !== 'text') throw new Error('bad factory');
    text.content = 'Hello {{first_name}}!';
    const { html } = renderEmail(emailWith([text]), {
      context: { contact: { firstName: 'Ada' } },
    });
    expect(html).toContain('Hello Ada!');
  });

  it('collects all links from button blocks', () => {
    const btn = createBlock('button');
    if (btn.type !== 'button') throw new Error('bad factory');
    btn.url = 'https://forgemsg.com/landing';
    const { links } = renderEmail(emailWith([btn]));
    expect(links).toContain('https://forgemsg.com/landing');
  });

  it('dedups link list', () => {
    const btn1 = createBlock('button');
    const btn2 = createBlock('button');
    if (btn1.type !== 'button' || btn2.type !== 'button') throw new Error('bad factory');
    btn1.url = 'https://same.com';
    btn2.url = 'https://same.com';
    const { links } = renderEmail(emailWith([btn1, btn2]));
    // The opt-out is a link in the email, so the link checker sees it too. It
    // appears because the default stream is marketing and this template has no
    // footer block — which is the behaviour the compliance footer exists for,
    // so the expectation is widened rather than the render made quieter.
    expect(links).toEqual(['https://same.com', '{{unsubscribe_url}}']);
  });

  it('leaves the link list alone for transactional mail', () => {
    const btn = createBlock('button');
    if (btn.type !== 'button') throw new Error('bad factory');
    btn.url = 'https://same.com';
    const { links } = renderEmail(emailWith([btn]), { stream: 'transactional' });
    expect(links).toEqual(['https://same.com']);
  });

  it('renders the if-branch of a dynamic block when condition matches', () => {
    const dyn = createBlock('dynamic');
    if (dyn.type !== 'dynamic') throw new Error('bad factory');
    const ifText = createBlock('text');
    const elseText = createBlock('text');
    if (ifText.type !== 'text' || elseText.type !== 'text') throw new Error('bad factory');
    ifText.content = 'VIP VERSION';
    elseText.content = 'STANDARD VERSION';
    dyn.ifContent = [ifText];
    dyn.elseContent = [elseText];
    dyn.condition = {
      operator: 'AND',
      rules: [{ field: 'tags', op: 'has_tag', value: 'VIP' }],
    };
    const { html } = renderEmail(emailWith([dyn]), {
      context: { contact: { tags: ['VIP'] } },
    });
    expect(html).toContain('VIP VERSION');
    expect(html).not.toContain('STANDARD VERSION');
  });

  it('renders the else-branch when the condition fails', () => {
    const dyn = createBlock('dynamic');
    if (dyn.type !== 'dynamic') throw new Error('bad factory');
    const ifText = createBlock('text');
    const elseText = createBlock('text');
    if (ifText.type !== 'text' || elseText.type !== 'text') throw new Error('bad factory');
    ifText.content = 'VIP VERSION';
    elseText.content = 'STANDARD VERSION';
    dyn.ifContent = [ifText];
    dyn.elseContent = [elseText];
    dyn.condition = {
      operator: 'AND',
      rules: [{ field: 'tags', op: 'has_tag', value: 'VIP' }],
    };
    const { html } = renderEmail(emailWith([dyn]), {
      context: { contact: { tags: ['newsletter'] } },
    });
    expect(html).toContain('STANDARD VERSION');
    expect(html).not.toContain('VIP VERSION');
  });

  it('previewAllDynamicBranches renders both branches', () => {
    const dyn = createBlock('dynamic');
    if (dyn.type !== 'dynamic') throw new Error('bad factory');
    const ifText = createBlock('text');
    const elseText = createBlock('text');
    if (ifText.type !== 'text' || elseText.type !== 'text') throw new Error('bad factory');
    ifText.content = 'VIP VERSION';
    elseText.content = 'STANDARD VERSION';
    dyn.ifContent = [ifText];
    dyn.elseContent = [elseText];
    const { html } = renderEmail(emailWith([dyn]), {
      previewAllDynamicBranches: true,
    });
    expect(html).toContain('VIP VERSION');
    expect(html).toContain('STANDARD VERSION');
  });

  it('renders columns with stackable fm-col classes', () => {
    const cols = createBlock('columns');
    if (cols.type !== 'columns') throw new Error('bad factory');
    const text = createBlock('text');
    cols.columns[0]!.push(text);
    const { html } = renderEmail(emailWith([cols]));
    expect(html).toContain('fm-col');
    expect(html).toContain('@media only screen');
  });

  it('footer with showUnsubscribe injects an unsubscribe link', () => {
    const footer = createBlock('footer');
    const { html, links } = renderEmail(emailWith([footer]), {
      context: { system: { unsubscribeUrl: 'https://unsub.com/x' } },
    });
    expect(html).toContain('Unsubscribe');
    expect(links).toContain('https://unsub.com/x');
  });

  it('auto-appends the CAN-SPAM postal address to the footer when set', () => {
    const footer = createBlock('footer');
    const { html } = renderEmail(emailWith([footer]), {
      context: {
        system: { companyName: 'Acme s.r.o.', companyAddress: 'Ulice 1, 110 00 Praha, CZ' },
      },
    });
    expect(html).toContain('Acme s.r.o.');
    expect(html).toContain('Ulice 1, 110 00 Praha, CZ');
  });

  it('omits the address block when no company address is configured', () => {
    const footer = createBlock('footer');
    const { html } = renderEmail(emailWith([footer]), { context: { system: {} } });
    expect(html).not.toContain('110 00 Praha');
  });

  it('renders a product block with image, price, CTA and collects its link', () => {
    const prod = createBlock('product');
    if (prod.type !== 'product') throw new Error('bad factory');
    prod.title = 'Blue Hoodie';
    prod.price = '$49';
    prod.productUrl = 'https://shop.com/hoodie';
    const { html, links } = renderEmail(emailWith([prod]));
    expect(html).toContain('Blue Hoodie');
    expect(html).toContain('$49');
    expect(html).toContain('Shop now');
    expect(html).toContain('https://shop.com/hoodie');
    expect(links).toContain('https://shop.com/hoodie');
  });

  it('shows a strike-through compare-at price when set', () => {
    const prod = createBlock('product');
    if (prod.type !== 'product') throw new Error('bad factory');
    prod.price = '$49';
    prod.compareAtPrice = '$79';
    const { html } = renderEmail(emailWith([prod]));
    expect(html).toContain('line-through');
    expect(html).toContain('$79');
  });

  it('resolves merge tags in product fields (per-recipient recommendation)', () => {
    const prod = createBlock('product');
    if (prod.type !== 'product') throw new Error('bad factory');
    prod.title = '{{rec_title}}';
    prod.productUrl = '{{rec_url}}';
    const { html } = renderEmail(emailWith([prod]), {
      context: {
        contact: { customFields: { rec_title: 'Recommended Sneakers', rec_url: 'https://s.co/x' } },
      },
    });
    expect(html).toContain('Recommended Sneakers');
    expect(html).toContain('https://s.co/x');
  });

  it('renders a video block as a clickable thumbnail linking to the video', () => {
    const vid = createBlock('video');
    if (vid.type !== 'video') throw new Error('bad factory');
    vid.videoUrl = 'https://youtu.be/abc123';
    vid.thumbnailSrc = 'https://cdn.com/thumb.jpg';
    const { html, links } = renderEmail(emailWith([vid]));
    expect(html).toContain('https://cdn.com/thumb.jpg');
    expect(html).toContain('href="https://youtu.be/abc123"');
    expect(links).toContain('https://youtu.be/abc123');
  });

  it('renders a coupon block showing the code and optional CTA', () => {
    const coupon = createBlock('coupon');
    if (coupon.type !== 'coupon') throw new Error('bad factory');
    coupon.code = 'SUMMER20';
    coupon.headline = 'Summer sale';
    coupon.ctaText = 'Shop';
    coupon.ctaUrl = 'https://shop.com';
    const { html, links } = renderEmail(emailWith([coupon]));
    expect(html).toContain('SUMMER20');
    expect(html).toContain('Summer sale');
    expect(html).toContain('href="https://shop.com"');
    expect(links).toContain('https://shop.com');
  });

  it('leaves a coupon merge tag untouched for per-recipient resolution at send time', () => {
    const coupon = createBlock('coupon');
    if (coupon.type !== 'coupon') throw new Error('bad factory');
    coupon.code = '{{coupon_code:batch-1}}';
    const { html } = renderEmail(emailWith([coupon]));
    expect(html).toContain('{{coupon_code:batch-1}}');
  });
});
