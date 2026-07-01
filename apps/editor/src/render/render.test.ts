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
});
