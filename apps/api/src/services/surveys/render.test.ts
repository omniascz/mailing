import { describe, it, expect } from 'vitest';
import { renderHostedSurveyPage } from './render.js';
import type { Survey } from '../../db/schema/index.js';

const survey = {
  id: '22222222-2222-2222-2222-222222222222',
  orgId: '33333333-3333-3333-3333-333333333333',
  name: 'Feedback <b>survey</b>',
  description: 'Tell us how we did',
  questions: [
    {
      id: 'q1',
      type: 'single',
      label: 'Favourite colour?',
      required: true,
      options: ['Red', 'Blue'],
    },
    {
      id: 'q2',
      type: 'multi',
      label: 'Which did you use?',
      required: false,
      options: ['App', 'Web'],
    },
    { id: 'q3', type: 'text', label: 'Comments', required: false },
    { id: 'nps_main', type: 'nps', label: 'Would you recommend us?', required: true },
    { id: 'q5', type: 'rating', label: 'Rate us', required: false, max: 5 },
  ],
  active: true,
  submitCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Survey;

describe('renderHostedSurveyPage', () => {
  const html = renderHostedSurveyPage(survey, 'https://api.test');

  it('is a full HTML document with viewport', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('name="viewport"');
  });

  it('escapes the survey name', () => {
    expect(html).toContain('Feedback &lt;b&gt;survey&lt;/b&gt;');
    expect(html).not.toContain('<h1>Feedback <b>survey</b>');
  });

  it('renders radios for single, checkboxes for multi, textarea for text', () => {
    expect(html).toContain('type="radio" name="q_q1"');
    expect(html).toContain('type="checkbox" name="q_q2"');
    expect(html).toContain('<textarea name="q_q3"');
  });

  it('renders an NPS 0..10 scale', () => {
    expect(html).toContain('value="0"');
    expect(html).toContain('value="10"');
    expect(html).toContain('name="q_nps_main"');
  });

  it('embeds orgId + survey id and posts to the submit endpoint', () => {
    expect(html).toContain('"33333333-3333-3333-3333-333333333333"'); // ORG_ID
    expect(html).toContain('https://api.test/public/surveys/');
    expect(html).toContain("'/submit'");
  });

  it('coerces numeric question types to numbers in the collector', () => {
    // NPS answer must be numeric so submitResponse extracts npsScore.
    expect(html).toContain('numeric(t)?Number(n.value)');
    expect(html).toContain('"nps_main":"nps"'); // type map
  });
});
