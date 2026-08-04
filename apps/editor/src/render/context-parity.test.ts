/**
 * The two render paths must resolve every tag identically.
 *
 * parseMergeTags picks its path from the template itself: the moment it sees
 * `{%` anywhere it renders through Liquid, otherwise through the regex parser.
 * That switch used to change what a tag resolved to — `{{contact.first_name}}`
 * worked only in the regex path, `{{system.unsubscribeUrl}}` only in Liquid.
 * A template author has no way to know which path their template took, so any
 * divergence is a bug regardless of which side is "right".
 *
 * Each case therefore asserts EQUALITY of the two paths and then the expected
 * value — a change that broke both paths the same way would otherwise pass.
 */

import { describe, it, expect } from 'vitest';
import { parseMergeTags, type MergeTagContext } from './merge-tags.js';

/** Appended to force the Liquid path without changing the output. */
const FORCE_LIQUID = '{% if true %}{% endif %}';

/** The shape the probe measured against: custom fields as a nested object. */
const NESTED: MergeTagContext = {
  contact: {
    email: 'p@n.cz',
    firstName: 'Petr',
    lastName: 'Novák',
    custom_fields: { plan: 'pro' },
  },
  system: { unsubscribeUrl: 'https://u/1', companyName: 'Acme' },
  data: { products: [{ name: 'A' }, { name: 'B' }] },
};

/**
 * What buildMergeContext (apps/workers/src/jobs/batch-sender.ts) actually
 * builds: `...contact.customFields` spread flat into the contact, so there is
 * no `custom_fields` key at all. Every case below must hold for this shape too
 * — testing only the tidy shape is how the production gap stayed invisible.
 */
const FLAT: MergeTagContext = {
  contact: { email: 'p@n.cz', firstName: 'Petr', lastName: 'Novák', plan: 'pro' },
  system: { unsubscribeUrl: 'https://u/1', companyName: 'Acme' },
  data: { products: [{ name: 'A' }, { name: 'B' }] },
};

/** The matrix from the probe. Every row was measured; six used to disagree. */
const MATRIX: Array<[template: string, expected: string]> = [
  ['{{contact.first_name}}', 'Petr'], // was: regex "Petr", Liquid ""
  ['{{contact.firstName}}', 'Petr'],
  ['{{first_name}}', 'Petr'],
  ['{{firstName}}', 'Petr'],
  ['{{contact.last_name}}', 'Novák'], // was: regex "Novák", Liquid ""
  ['{{contact.email}}', 'p@n.cz'],
  ['{{contact.custom_fields.plan}}', 'pro'], // was: regex "", Liquid "pro"
  ['{{contact.customFields.plan}}', 'pro'], // was: "" in both
  ['{{plan}}', 'pro'],
  ['{{system.unsubscribe_url}}', 'https://u/1'], // was: regex ok, Liquid ""
  ['{{unsubscribe_url}}', 'https://u/1'],
  ['{{system.unsubscribeUrl}}', 'https://u/1'], // was: regex "", Liquid ok
  ['{{company_name}}', 'Acme'],
];

function bothPaths(template: string, ctx: MergeTagContext): [string, string] {
  return [parseMergeTags(template, ctx), parseMergeTags(template + FORCE_LIQUID, ctx)];
}

describe.each([
  ['nested custom_fields', NESTED],
  ['flat custom fields (production buildMergeContext shape)', FLAT],
])('context parity — %s', (_label, ctx) => {
  it.each(MATRIX)('%s resolves the same in both paths', (template, expected) => {
    const [regex, liquid] = bothPaths(template, ctx);
    expect(regex).toBe(liquid);
    expect(regex).toBe(expected);
  });
});

describe('control flow sees the same keys as interpolation', () => {
  // These only exist in the Liquid path — there is nothing to compare against,
  // so they assert the value directly. They are the sharper form of the bug:
  // a false condition drops a whole paragraph rather than one empty string.
  const cases: Array<[template: string, expected: string]> = [
    ['{% if contact.first_name %}ANO{% else %}ne{% endif %}', 'ANO'],
    ['{% if contact.firstName %}ANO{% else %}ne{% endif %}', 'ANO'],
    ['{% if first_name %}ANO{% else %}ne{% endif %}', 'ANO'],
    ['{% if plan %}ANO{% else %}ne{% endif %}', 'ANO'],
    ['{% if contact.custom_fields.plan %}ANO{% else %}ne{% endif %}', 'ANO'],
    ['{% if system.unsubscribe_url %}ANO{% else %}ne{% endif %}', 'ANO'],
    ['{% if system.unsubscribeUrl %}ANO{% else %}ne{% endif %}', 'ANO'],
    ['{% if contact.neexistuje %}ANO{% else %}ne{% endif %}', 'ne'],
  ];

  it.each(cases)('%s', (template, expected) => {
    expect(parseMergeTags(template, NESTED)).toBe(expected);
    expect(parseMergeTags(template, FLAT)).toBe(expected);
  });

  it('loops over ctx.data collections', () => {
    const t = '{% for p in products %}[{{p.name}}]{% endfor %}';
    expect(parseMergeTags(t, NESTED)).toBe('[A][B]');
    expect(parseMergeTags(t, FLAT)).toBe('[A][B]');
  });
});

describe('lookup priority is preserved', () => {
  it('an explicit key wins over the generated alias', () => {
    const ctx: MergeTagContext = {
      contact: { firstName: 'camel', first_name: 'snake' },
    };
    // Both conventions are present, so neither is generated and each keeps its
    // own value — the behaviour pickContactField had before the refactor.
    for (const t of ['{{contact.first_name}}', '{{first_name}}']) {
      const [regex, liquid] = bothPaths(t, ctx);
      expect(regex).toBe(liquid);
      expect(regex).toBe('snake');
    }
    for (const t of ['{{contact.firstName}}', '{{firstName}}']) {
      const [regex, liquid] = bothPaths(t, ctx);
      expect(regex).toBe(liquid);
      expect(regex).toBe('camel');
    }
  });

  it('a real contact property wins over a custom field of the same name', () => {
    const ctx: MergeTagContext = {
      contact: { firstName: 'vlastni', custom_fields: { firstName: 'custom' } },
    };
    const [regex, liquid] = bothPaths('{{contact.firstName}}', ctx);
    expect(regex).toBe(liquid);
    expect(regex).toBe('vlastni');
  });

  it('a missing key is empty in both paths, not the literal tag', () => {
    const [regex, liquid] = bothPaths('{{contact.neexistuje}}', NESTED);
    expect(regex).toBe(liquid);
    expect(regex).toBe('');
  });
});
