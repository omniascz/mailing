/**
 * The campaign form: the A/B and segment controls are on the screen, and what
 * the form sends actually carries them.
 *
 * Those are two separate claims and this file makes both, because only making
 * the first is how a field ends up rendered, bound to state, and never sent.
 *
 * WHAT THIS TEST CANNOT SEE
 * -------------------------
 * - `environment: 'node'` has no DOM. The form is rendered for its initial
 *   markup only; nothing here clicks a checkbox, so the wiring from an input's
 *   onChange into the state that buildSavePayload receives is NOT covered.
 *   What is covered is the initial state (read off the campaign) and the
 *   payload built from any state.
 * - It does not talk to the API. That the payload is accepted and stored is
 *   apps/api/src/integration/campaign-ab-from-form.integration.test.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: () => {} }) }));

const { EditCampaignForm } = await import('./edit-campaign-form');
const { buildSavePayload } = await import('./save-payload');
const { AB_OFF } = await import('./ab-config');

const CAMPAIGN = {
  id: 'c1',
  status: 'draft',
  subject: 'Ahoj',
  preheader: null,
  fromName: null,
  fromEmail: null,
  replyTo: null,
  content: { html: '<p>x</p>', plainText: 'x' },
  listId: null,
  segmentId: null as string | null,
  excludeSegmentId: null as string | null,
  abConfig: null as Record<string, unknown> | null,
  timewarp: null,
  utmTracking: null,
};

const SEGMENTS = [
  { id: 's-vip', name: 'VIP zákazníci' },
  { id: 's-churn', name: 'Odcházející' },
];

function markup(over: Partial<typeof CAMPAIGN> = {}, segments = SEGMENTS) {
  return renderToStaticMarkup(
    <EditCampaignForm
      campaign={{ ...CAMPAIGN, ...over }}
      lists={[{ id: 'l1', name: 'Newsletter', count: 10 }]}
      segments={segments}
      editable
    />,
  );
}

const FIELDS = {
  subject: 'Ahoj',
  preheader: '',
  fromName: '',
  fromEmail: '',
  replyTo: '',
  listId: 'l1',
  segmentId: '',
  excludeSegmentId: '',
  abConfig: AB_OFF,
  timewarpOn: false,
  timewarpHour: 9,
  timewarpFallback: 'Europe/Prague',
  utmOn: false,
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
  html: '<p>x</p>',
  plainText: 'x',
  hasEditorSchema: false,
};

describe('matcher self-test', () => {
  it('the form really renders under environment: node', () => {
    const html = markup();
    expect(html).toContain('<form');
    expect(html).toContain('Audience (list)');
  });

  it('the segment block is absent when the org has no segments, so its presence means something', () => {
    const html = markup({}, []);
    expect(html).toContain('No segments yet');
    expect(html).not.toContain('VIP zákazníci');
  });
});

describe('the controls are on the screen', () => {
  it('offers an include and an exclude segment, listing every segment in both', () => {
    const html = markup();
    expect(html).toContain('Include: no segment');
    expect(html).toContain('Exclude: nobody');
    // Both selects carry both segments.
    expect(html.split('VIP zákazníci').length - 1).toBe(2);
    expect(html.split('Odcházející').length - 1).toBe(2);
  });

  it('preselects the segments the campaign already has', () => {
    const html = markup({ segmentId: 's-vip', excludeSegmentId: 's-churn' });
    // React 19 marks the chosen option server-side; the attribute order is
    // value then selected, which is why this is matched as a literal.
    expect(html).toContain('<option value="s-vip" selected="">');
    expect(html).toContain('<option value="s-churn" selected="">');
    // ...and the same option in the other select is NOT marked.
    expect(html).toContain('<option value="s-vip">');
  });

  it('offers the A/B test, collapsed for a campaign that is not one', () => {
    const html = markup();
    expect(html).toContain('Test subject lines against each other (A/B)');
    // Collapsed: the variant fields are not rendered until it is switched on.
    expect(html).not.toContain('Share %');
  });

  it('opens with the stored variants for a campaign that already is an A/B test', () => {
    const html = markup({
      abConfig: {
        variants: [
          { id: 'a', subject: 'Sleva 20 %', percentage: 10 },
          { id: 'b', subject: 'Jenom dnes', percentage: 10 },
        ],
        testDurationHours: 4,
      },
    });
    expect(html).toContain('Variant a — subject');
    expect(html).toContain('Variant b — subject');
    expect(html).toContain('Sleva 20 %');
    expect(html).toContain('Jenom dnes');
    // 100 − (10 + 10)
    expect(html).toContain('Holdback: 80%');
  });
});

describe('what the form sends', () => {
  it('carries the segments and the A/B config', () => {
    const body = buildSavePayload({
      ...FIELDS,
      segmentId: 's-vip',
      excludeSegmentId: 's-churn',
      abConfig: { variants: [{ id: 'a' }, { id: 'b' }] },
    });
    expect(body.segmentId).toBe('s-vip');
    expect(body.excludeSegmentId).toBe('s-churn');
    expect(body.abConfig).toEqual({ variants: [{ id: 'a' }, { id: 'b' }] });
  });

  it('sends abConfig as {} rather than omitting it, so switching the test off switches it off', () => {
    const body = buildSavePayload(FIELDS);
    expect('abConfig' in body).toBe(true);
    expect(body.abConfig).toEqual({});
    expect(body.abConfig).not.toBeNull();
  });

  it('omits an unset segment instead of sending an empty string the route would reject', () => {
    const body = buildSavePayload(FIELDS);
    expect(body.segmentId).toBeUndefined();
    expect(body.excludeSegmentId).toBeUndefined();
  });

  it('still leaves the visual editor its content, and still sends timewarp and utm when off', () => {
    // Guarding what #116 and #117 put here — this function was extracted out of
    // the submit handler and these are the parts that had to survive the move.
    expect('content' in buildSavePayload({ ...FIELDS, hasEditorSchema: true })).toBe(false);
    expect(buildSavePayload(FIELDS).content).toEqual({ html: '<p>x</p>', plainText: 'x' });
    expect(buildSavePayload(FIELDS).timewarp).toEqual({
      enabled: false,
      localHour: 9,
      fallbackTimezone: 'Europe/Prague',
    });
    expect(buildSavePayload(FIELDS).utmTracking).toEqual({
      enabled: false,
      source: undefined,
      medium: undefined,
      campaign: undefined,
    });
  });
});
