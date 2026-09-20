import { describe, it, expect } from 'vitest';
import {
  EMAIL_SERIES_BY_CATEGORY,
  EMAIL_SERIES_BY_FLOW_ID,
  BUILT_IN_EMAIL_KEY,
  seriesForCategory,
  withBuiltInEmails,
} from './email-content.js';
import { WORKFLOW_TEMPLATES } from './registry.js';
import { FLOW_TEMPLATES } from '../workflows/flow-templates.js';
import { TEMPLATES, getTemplateById, localeOf } from '../editor/templates/index.js';

/**
 * Every email step of every shipped template has an email to send, and it is
 * one this product ships. That the fork turns it into a row the organisation
 * owns, and that the run then reaches the send, is proved against a real
 * database in integration/workflow-template-emails.integration.test.ts.
 */

type Node = { id: string; type: string; config: Record<string, unknown> };

const emailSteps = (nodes: Node[]) => nodes.filter((n) => n.type === 'send_email');

const allSteps = [
  ...WORKFLOW_TEMPLATES.flatMap((t) =>
    emailSteps(t.nodes as Node[]).map((n) => ({ tpl: t.slug, locale: t.locale, node: n })),
  ),
  ...FLOW_TEMPLATES.flatMap((t) =>
    emailSteps(t.nodes as unknown as Node[]).map((n) => ({ tpl: t.id, locale: 'en', node: n })),
  ),
];

describe('every shipped email step has content', () => {
  it('there are steps to check, and none is left without an email', () => {
    // Measured when this was written: 181 in the registry + 14 in the
    // pre-built flows. A drop to zero would make the rest of this file vacuous.
    expect(allSteps.length).toBeGreaterThan(190);

    const contentless = allSteps.filter(({ node }) => {
      const c = node.config;
      return (
        c.campaignId === undefined &&
        c.templateId === undefined &&
        c.html === undefined &&
        c[BUILT_IN_EMAIL_KEY] === undefined
      );
    });
    expect(contentless.map((s) => `${s.tpl}/${s.node.id}`)).toEqual([]);
  });

  it('no step carries the templateId: null the queue contract rejects', () => {
    const nulls = allSteps.filter(({ node }) => node.config.templateId === null);
    expect(nulls.map((s) => `${s.tpl}/${s.node.id}`)).toEqual([]);
  });

  it('every named email exists in the catalogue', () => {
    const missing = allSteps
      .map(({ tpl, node }) => ({ tpl, id: node.config[BUILT_IN_EMAIL_KEY] }))
      .filter((s) => typeof s.id === 'string' && !getTemplateById(s.id as string));
    expect(missing).toEqual([]);
  });

  it('a Czech flow sends Czech emails where the catalogue has them', () => {
    const czech = WORKFLOW_TEMPLATES.filter((t) => t.locale === 'cs');
    expect(czech.length).toBeGreaterThan(0);

    const wrongLanguage = czech.flatMap((t) =>
      emailSteps(t.nodes as Node[])
        .map((n) => n.config[BUILT_IN_EMAIL_KEY])
        .filter((id): id is string => typeof id === 'string')
        .filter((id) => {
          const builtIn = getTemplateById(id)!;
          const hasCzech = Boolean(EMAIL_SERIES_BY_CATEGORY[t.category]?.cs?.length);
          return hasCzech && localeOf(builtIn) !== 'cs';
        })
        .map((id) => `${t.slug}: ${id}`),
    );
    expect(wrongLanguage).toEqual([]);
  });

  it('every category and pre-built flow that has email steps has a series', () => {
    const categories = new Set(
      WORKFLOW_TEMPLATES.filter((t) => emailSteps(t.nodes as Node[]).length > 0).map(
        (t) => t.category,
      ),
    );
    const missing = [...categories].filter((c) => !EMAIL_SERIES_BY_CATEGORY[c]);
    expect(missing).toEqual([]);

    const flows = FLOW_TEMPLATES.filter((t) => emailSteps(t.nodes as unknown as Node[]).length > 0);
    expect(flows.map((t) => t.id).filter((id) => !EMAIL_SERIES_BY_FLOW_ID[id])).toEqual([]);
  });

  it('every id in the series tables is a real catalogue id', () => {
    const ids = [
      ...Object.values(EMAIL_SERIES_BY_CATEGORY).flatMap((s) => [...s.en, ...(s.cs ?? [])]),
      ...Object.values(EMAIL_SERIES_BY_FLOW_ID).flat(),
    ];
    expect(ids.length).toBeGreaterThan(50);
    expect(ids.filter((id) => !TEMPLATES.some((t) => t.id === id))).toEqual([]);
  });
});

describe('withBuiltInEmails', () => {
  const step = (id: string, config: Record<string, unknown> = {}) =>
    ({ id, type: 'send_email', config }) as never;

  it('walks the series in order and repeats it when the flow is longer', () => {
    const out = withBuiltInEmails(
      [step('a'), step('b'), step('c')],
      ['one', 'two'],
    ) as unknown as Node[];
    expect(out.map((n) => n.config[BUILT_IN_EMAIL_KEY])).toEqual(['one', 'two', 'one']);
  });

  it('leaves a step that already has content alone', () => {
    const out = withBuiltInEmails(
      [step('a', { html: '<p>hi</p>' }), step('b', { campaignId: 'c1' }), step('c')],
      ['one'],
    ) as unknown as Node[];
    expect(out[0]!.config[BUILT_IN_EMAIL_KEY]).toBeUndefined();
    expect(out[1]!.config[BUILT_IN_EMAIL_KEY]).toBeUndefined();
    expect(out[2]!.config[BUILT_IN_EMAIL_KEY]).toBe('one');
  });

  it('drops templateId: null', () => {
    const out = withBuiltInEmails([step('a', { templateId: null })], ['one']) as unknown as Node[];
    expect('templateId' in out[0]!.config).toBe(false);
    expect(out[0]!.config[BUILT_IN_EMAIL_KEY]).toBe('one');
  });

  it('touches nothing when there is no series for the category', () => {
    const nodes = [step('a')];
    expect(withBuiltInEmails(nodes, [])).toBe(nodes);
  });

  it('prefers the Czech series only for a Czech flow', () => {
    expect(seriesForCategory('welcome', 'cs')).toEqual(['cs-welcome-1', 'cs-welcome-2']);
    expect(seriesForCategory('welcome', 'en')).toEqual([
      'onboarding-001',
      'onboard-002',
      'onboard-003',
    ]);
    // A category with no Czech variants falls back rather than sending nothing.
    expect(seriesForCategory('lead_nurture', 'cs')).toEqual(
      EMAIL_SERIES_BY_CATEGORY.lead_nurture!.en,
    );
  });
});
