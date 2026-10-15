/**
 * The opt-out of an inline flow e-mail (Z157; Michal, 14. 10. 22:10, point 2).
 *
 * composeInlineOptOut is called directly. applyInlineOptOut runs against a
 * database stub that answers the org's sender lookup with the row a test sets,
 * and a stub of the tracking host, so what it reads — and when it reads
 * nothing — can be counted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyTrackingToken } from '@forgemsg/shared';

const state = vi.hoisted(() => ({
  org: null as null | { companyName: string | null; postalAddress: string | null },
  orgQueries: 0,
  hostQueries: 0,
  mailbox: undefined as string | undefined,
}));

vi.mock('../../db/client.js', () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => {
      state.orgQueries++;
      return Promise.resolve(state.org ? [state.org] : []);
    },
  };
  return { db: { select: () => chain } };
});

vi.mock('../sending/tracking-base-url.js', () => ({
  resolveTrackingBaseUrl: async () => {
    state.hostQueries++;
    return { baseUrl: 'https://track.example.test', branded: false };
  },
}));

vi.mock('../../config/env.js', () => ({
  env: new Proxy({}, { get: (_t, k) => (k === 'UNSUBSCRIBE_MAILBOX' ? state.mailbox : undefined) }),
}));

import { applyInlineOptOut, composeInlineOptOut } from './inline-optout.js';

const ORG = '00000000-0000-4000-8000-000000000001';
const CONTACT = '00000000-0000-4000-8000-000000000002';
const URL_ = 'https://track.example.test/api/v1/unsubscribe/tok.sig';
const parts = (over: Record<string, unknown> = {}) => ({
  unsubscribeUrl: URL_,
  unsubToken: 'tok.sig',
  companyName: 'Obchod s.r.o.',
  companyAddress: 'Nádražní 1, 110 00 Praha',
  ...over,
});
const count = (hay: string | undefined, needle: string) => (hay ?? '').split(needle).length - 1;

beforeEach(() => {
  state.org = { companyName: 'Obchod s.r.o.', postalAddress: 'Nádražní 1, 110 00 Praha' };
  state.orgQueries = 0;
  state.hostQueries = 0;
  state.mailbox = undefined;
});

describe('marketing: footer and List-Unsubscribe', () => {
  it('puts the footer before </body> and at the end of the text, in the renderer’s Czech', () => {
    const out = composeInlineOptOut(
      { html: '<html><body><p>Ahoj</p></body></html>', text: 'Ahoj', marketing: true },
      parts(),
    );
    expect(out.html).toBe(
      '<html><body><p>Ahoj</p>' +
        '<div data-fm-optout="1" style="padding:16px 24px;font-size:12px;color:#6b7280;text-align:center;">' +
        '<div style="margin-top:8px;">Obchod s.r.o.<br/>Nádražní 1, 110 00 Praha</div>' +
        `<div style="margin-top:8px;"><a href="${URL_}" style="color:#6b7280;text-decoration:underline;">Odhlásit z odběru</a></div>` +
        '</div></body></html>',
    );
    expect(out.text).toBe(
      `Ahoj\n\nObchod s.r.o.\nNádražní 1, 110 00 Praha\nOdhlásit z odběru: ${URL_}`,
    );
  });

  it('appends at the end when the html has no </body>, and finds </BODY> in any case', () => {
    const bare = composeInlineOptOut({ html: '<p>x</p>', marketing: true }, parts());
    expect(bare.html.startsWith('<p>x</p><div data-fm-optout="1"')).toBe(true);
    expect(bare.html.endsWith('</div>')).toBe(true);
    const upper = composeInlineOptOut({ html: '<BODY><p>x</p></BODY>', marketing: true }, parts());
    expect(upper.html.endsWith('</div></BODY>')).toBe(true);
  });

  it('a message with no text part gets one holding the footer', () => {
    const out = composeInlineOptOut({ html: '<p>x</p>', marketing: true }, parts());
    expect(out.text).toBe(`Obchod s.r.o.\nNádražní 1, 110 00 Praha\nOdhlásit z odběru: ${URL_}`);
    const empty = composeInlineOptOut({ html: '<p>x</p>', text: '', marketing: true }, parts());
    expect(empty.text).toBe(out.text);
  });

  it('returns List-Unsubscribe with the https URI alone and List-Unsubscribe-Post', () => {
    const out = composeInlineOptOut({ html: '<p>x</p>', marketing: true }, parts());
    expect(out.customHeaders).toEqual({
      'List-Unsubscribe': `<${URL_}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('offers the mailto only with a mailbox, in batch-sender’s form', () => {
    const out = composeInlineOptOut(
      { html: '<p>x</p>', marketing: true },
      parts({ mailbox: 'unsub@example.test' }),
    );
    expect(out.customHeaders['List-Unsubscribe']).toBe(
      `<mailto:unsub@example.test?subject=tok.sig>, <${URL_}>`,
    );
  });

  it('adds the footer even when the html already links to the unsubscribe page', () => {
    const out = composeInlineOptOut(
      {
        html: '<p><a href="{{unsubscribe_url}}">ven</a></p>',
        text: 'ven: {{unsubscribe_url}}',
        marketing: true,
      },
      parts(),
    );
    expect(count(out.html, URL_)).toBe(2);
    expect(count(out.text, URL_)).toBe(2);
  });
});

describe('the sender lines follow the renderer (postalAddressLines)', () => {
  it('escapes the name and address in html and keeps them verbatim in the text', () => {
    const out = composeInlineOptOut(
      { html: '<p>x</p>', text: 'x', marketing: true },
      parts({ companyName: 'Kočka & <b>Pes</b>', companyAddress: 'Ulice <1> & spol.' }),
    );
    expect(out.html).toContain(
      'Kočka &amp; &lt;b&gt;Pes&lt;/b&gt;<br/>Ulice &lt;1&gt; &amp; spol.',
    );
    expect(out.html).not.toContain('<b>Pes</b>');
    expect(out.text).toContain('Kočka & <b>Pes</b>\nUlice <1> & spol.');
  });

  it('without an address prints no sender — not even the name — and keeps the link', () => {
    for (const over of [
      { companyName: undefined, companyAddress: undefined },
      { companyName: 'Jen Jméno s.r.o.', companyAddress: undefined },
      { companyName: 'Jen Jméno s.r.o.', companyAddress: '   ' },
    ]) {
      const out = composeInlineOptOut(
        { html: '<p>x</p>', text: 'x', marketing: true },
        parts(over),
      );
      expect(out.html).not.toContain('Jen Jméno');
      expect(out.html).not.toContain('<br/>');
      expect(count(out.html, URL_)).toBe(1);
      expect(out.text).toBe(`x\n\nOdhlásit z odběru: ${URL_}`);
      expect(out.customHeaders['List-Unsubscribe']).toBe(`<${URL_}>`);
    }
  });

  it('with an address and no name prints the address alone', () => {
    const out = composeInlineOptOut(
      { html: '<p>x</p>', text: 'x', marketing: true },
      parts({ companyName: undefined }),
    );
    expect(out.html).toContain('<div style="margin-top:8px;">Nádražní 1, 110 00 Praha</div>');
    expect(out.text).toBe(`x\n\nNádražní 1, 110 00 Praha\nOdhlásit z odběru: ${URL_}`);
  });
});

describe('the tags are replaced in every inline e-mail', () => {
  const tags = [
    '{{unsubscribe}}',
    '{{unsubscribe_url}}',
    '{{ unsubscribe_url }}',
    '{{  unsubscribe }}',
  ];

  it.each([true, false])('marketing = %s: every form, in html and text', (marketing) => {
    for (const tag of tags) {
      const out = composeInlineOptOut(
        { html: `<p>${tag}</p><a href="${tag}">x</a>`, text: `ven: ${tag}`, marketing },
        parts(),
      );
      expect(out.html).not.toMatch(/\{\{\s*unsubscribe/);
      expect(out.text).not.toMatch(/\{\{\s*unsubscribe/);
      expect(out.html.startsWith(`<p>${URL_}</p><a href="${URL_}">x</a>`)).toBe(true);
      expect(out.text?.startsWith(`ven: ${URL_}`)).toBe(true);
    }
  });

  it('leaves other tags and look-alikes alone', () => {
    const html = '<p>{{unsubscribed}} {{preference_center_url}} {{unsubscribe_link}}</p>';
    const out = composeInlineOptOut({ html, text: html, marketing: false }, parts());
    expect(out.html).toBe(html);
    expect(out.text).toBe(html);
  });

  it('reads no `$` in the URL as a replacement pattern', () => {
    const out = composeInlineOptOut(
      { html: '{{unsubscribe}}', marketing: false },
      parts({ unsubscribeUrl: 'https://t/$&$1' }),
    );
    expect(out.html).toBe('https://t/$&$1');
  });
});

describe('the transactional exception (marketing = false)', () => {
  it('gets no footer and no headers — only the tags replaced', () => {
    const html = '<div><p>Vstupenka</p><p style="font-size:12px">{{unsubscribe}}</p></div></body>';
    const out = composeInlineOptOut({ html, text: '', marketing: false }, parts());
    expect(out.html).toBe(
      `<div><p>Vstupenka</p><p style="font-size:12px">${URL_}</p></div></body>`,
    );
    expect(out.html).not.toContain('data-fm-optout');
    expect(out.html).not.toContain('Odhlásit z odběru');
    expect(out.text).toBe('');
    expect(out.customHeaders).toEqual({});
  });

  it('keeps an absent text part absent', () => {
    expect(
      composeInlineOptOut({ html: '<p>x</p>', marketing: false }, parts()).text,
    ).toBeUndefined();
  });
});

describe('applyInlineOptOut', () => {
  it('marketing: batch-sender’s unsub token without campaignId on /api/v1/unsubscribe/:token', async () => {
    const out = await applyInlineOptOut({
      orgId: ORG,
      contactId: CONTACT,
      html: '<p>x</p>',
      text: 'x',
      marketing: true,
    });
    const m = out.customHeaders['List-Unsubscribe']!.match(
      /^<https:\/\/track\.example\.test\/api\/v1\/unsubscribe\/([^>]+)>$/,
    );
    expect(m).not.toBeNull();
    const payload = verifyTrackingToken(m![1]!) as unknown as Record<string, unknown>;
    expect(payload).toMatchObject({ type: 'unsub', orgId: ORG, contactId: CONTACT });
    expect(Object.keys(payload).sort()).toEqual(['contactId', 'orgId', 'ts', 'type']);
    expect(out.html).toContain(`href="https://track.example.test/api/v1/unsubscribe/${m![1]}"`);
    expect(out.html).toContain('Obchod s.r.o.<br/>Nádražní 1, 110 00 Praha');
    expect(out.text).toContain(
      `Odhlásit z odběru: https://track.example.test/api/v1/unsubscribe/${m![1]}`,
    );
    expect(state.hostQueries).toBe(1);
    expect(state.orgQueries).toBe(1);
  });

  it('reads UNSUBSCRIBE_MAILBOX for the mailto', async () => {
    state.mailbox = 'unsub@example.test';
    const out = await applyInlineOptOut({
      orgId: ORG,
      contactId: CONTACT,
      html: 'x',
      marketing: true,
    });
    expect(out.customHeaders['List-Unsubscribe']).toMatch(
      /^<mailto:unsub@example\.test\?subject=[^>]+>, <https:\/\/track\.example\.test\/api\/v1\/unsubscribe\/[^>]+>$/,
    );
  });

  it('an org without the row or the columns: footer with the link only', async () => {
    state.org = { companyName: null, postalAddress: null };
    const out = await applyInlineOptOut({
      orgId: ORG,
      contactId: CONTACT,
      html: 'x',
      text: 'x',
      marketing: true,
    });
    expect(out.text).toMatch(
      /^x\n\nOdhlásit z odběru: https:\/\/track\.example\.test\/api\/v1\/unsubscribe\/\S+$/,
    );
    state.org = null;
    const none = await applyInlineOptOut({
      orgId: ORG,
      contactId: CONTACT,
      html: 'x',
      text: 'x',
      marketing: true,
    });
    expect(none.text).toMatch(/^x\n\nOdhlásit z odběru: https:\/\/\S+$/);
  });

  it('the exception with a tag resolves the link and not the sender', async () => {
    const out = await applyInlineOptOut({
      orgId: ORG,
      contactId: CONTACT,
      html: '<p>{{unsubscribe}}</p>',
      marketing: false,
    });
    expect(out.html).toMatch(
      /^<p>https:\/\/track\.example\.test\/api\/v1\/unsubscribe\/[^<]+<\/p>$/,
    );
    expect(out.customHeaders).toEqual({});
    expect(state.hostQueries).toBe(1);
    expect(state.orgQueries).toBe(0);
  });

  it('the exception without a tag is returned untouched and costs no query', async () => {
    const input = { orgId: ORG, contactId: CONTACT, html: '<p>x</p>', text: 't', marketing: false };
    const out = await applyInlineOptOut(input);
    expect(out).toEqual({ html: '<p>x</p>', text: 't', customHeaders: {} });
    expect(state.hostQueries + state.orgQueries).toBe(0);
  });
});
