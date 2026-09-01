/**
 * The A/B payload the campaign form sends.
 *
 * WHAT THIS TEST CANNOT SEE
 * -------------------------
 * - It does not click the form. `environment: 'node'` has no DOM, so the state
 *   this builder receives is written by hand here; that the checkboxes and
 *   inputs actually produce that state is not proven by this file.
 * - It does not prove the API accepts the payload. `abConfig` is
 *   `z.record(z.unknown())` on the route — it validates NOTHING inside — so
 *   acceptance is worthless as evidence anyway. What matters is that the
 *   splitter and the winner job can read it, and that is pinned against a real
 *   database in
 *   apps/api/src/integration/campaign-ab-from-form.integration.test.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  AB_OFF,
  abFormStateFrom,
  buildAbConfig,
  defaultAbFormState,
  holdbackPercentage,
  totalVariantPercentage,
  type AbFormState,
} from './ab-config';

const BODY = { html: '<p>Ahoj</p>', plainText: 'Ahoj' };

function state(over: Partial<AbFormState> = {}): AbFormState {
  return {
    ...defaultAbFormState(),
    variants: [
      { id: 'a', subject: 'Sleva 20 %', percentage: '10' },
      { id: 'b', subject: 'Jenom dnes', percentage: '10' },
    ],
    ...over,
  };
}

const ok = (r: ReturnType<typeof buildAbConfig>) => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.config;
};

const err = (r: ReturnType<typeof buildAbConfig>) => {
  if (r.ok) throw new Error('expected a refusal, got a config');
  return r.error;
};

describe('matcher self-test', () => {
  it('the helpers really distinguish the two outcomes', () => {
    expect(buildAbConfig(state(), BODY).ok).toBe(true);
    expect(buildAbConfig(state({ variants: [] }), BODY).ok).toBe(false);
    expect(() => ok(buildAbConfig(state({ variants: [] }), BODY))).toThrow();
    expect(() => err(buildAbConfig(state(), BODY))).toThrow();
  });

  it('AB_OFF is an empty object, not null — the route rejects null', () => {
    expect(AB_OFF).toEqual({});
    expect(AB_OFF).not.toBeNull();
  });
});

describe('percentages', () => {
  it('adds up the variant shares and leaves the rest as holdback', () => {
    expect(totalVariantPercentage([{ percentage: '10' }, { percentage: '15' }])).toBe(25);
    expect(holdbackPercentage([{ percentage: '10' }, { percentage: '15' }])).toBe(75);
  });

  it('reports no holdback when the variants cover everything', () => {
    expect(holdbackPercentage([{ percentage: '50' }, { percentage: '50' }])).toBe(0);
  });

  it('treats an unparseable share as zero rather than NaN', () => {
    expect(totalVariantPercentage([{ percentage: '' }, { percentage: 'x' }])).toBe(0);
    expect(holdbackPercentage([{ percentage: '' }])).toBe(100);
  });
});

describe('buildAbConfig', () => {
  it('copies the campaign body into every variant', () => {
    const cfg = ok(buildAbConfig(state(), BODY));
    expect(cfg.variants).toHaveLength(2);
    // The splitter passes `content: variant.content` with no fallback, so a
    // variant without a body sends an empty email.
    for (const v of cfg.variants) expect(v.content).toEqual(BODY);
    expect(cfg.variants.map((v) => v.subject)).toEqual(['Sleva 20 %', 'Jenom dnes']);
    expect(cfg.variants.map((v) => v.percentage)).toEqual([10, 10]);
  });

  it('sends percentages as numbers, not the strings the inputs hold', () => {
    const cfg = ok(buildAbConfig(state(), BODY));
    for (const v of cfg.variants) expect(typeof v.percentage).toBe('number');
    expect(typeof cfg.testDurationHours).toBe('number');
    expect(typeof cfg.confidenceThreshold).toBe('number');
  });

  it('defaults to click rate, because Apple pre-fetches the open pixel', () => {
    expect(ok(buildAbConfig(state(), BODY)).winnerCriteria).toBe('click_rate');
  });

  it('refuses fewer than two variants — that is not a test', () => {
    expect(err(buildAbConfig(state({ variants: [] }), BODY))).toContain('at least two');
    expect(
      err(buildAbConfig(state({ variants: [{ id: 'a', subject: 'x', percentage: '10' }] }), BODY)),
    ).toContain('at least two');
  });

  it('refuses a blank subject line — that is the thing being tested', () => {
    const s = state();
    s.variants[1]!.subject = '   ';
    expect(err(buildAbConfig(s, BODY))).toContain('no subject line');
  });

  it('refuses two variants sharing an id', () => {
    const s = state();
    s.variants[1]!.id = 'a';
    expect(err(buildAbConfig(s, BODY))).toContain('share the id');
  });

  it('refuses a share of zero or less', () => {
    const s = state();
    s.variants[0]!.percentage = '0';
    expect(err(buildAbConfig(s, BODY))).toContain('above zero');
  });

  it('refuses variants adding up to more than the whole audience', () => {
    const s = state();
    s.variants[0]!.percentage = '60';
    s.variants[1]!.percentage = '60';
    expect(err(buildAbConfig(s, BODY))).toContain('120%');
  });

  it('refuses a holdback with no test duration, the one thing the server also refuses', () => {
    // assertAbConfigCanFinish in apps/api services/campaigns/index.ts throws on
    // exactly this at the click on Send. Catching it here means the operator
    // hears about it while they can still fix it.
    const message = err(buildAbConfig(state({ testDurationHours: '' }), BODY));
    expect(message).toContain('80%');
    expect(message).toContain('how long to wait');
  });

  it('allows no test duration when the variants cover the whole audience', () => {
    const cfg = ok(
      buildAbConfig(
        state({
          variants: [
            { id: 'a', subject: 'A', percentage: '50' },
            { id: 'b', subject: 'B', percentage: '50' },
          ],
          testDurationHours: '',
        }),
        BODY,
      ),
    );
    // Omitted rather than 0: there is no holdback to wait for.
    expect('testDurationHours' in cfg).toBe(false);
  });
});

describe('abFormStateFrom', () => {
  it('round-trips a config this form built', () => {
    const cfg = ok(buildAbConfig(state(), BODY));
    const back = abFormStateFrom(cfg);
    expect(back).not.toBeNull();
    expect(back!.variants).toEqual([
      { id: 'a', subject: 'Sleva 20 %', percentage: '10' },
      { id: 'b', subject: 'Jenom dnes', percentage: '10' },
    ]);
    expect(back!.testDurationHours).toBe('4');
    expect(back!.winnerCriteria).toBe('click_rate');
    expect(back!.autoSendWinner).toBe(true);
    expect(back!.confidenceThreshold).toBe('95');
  });

  it('answers null for anything that is not an A/B test, AB_OFF included', () => {
    expect(abFormStateFrom(null)).toBeNull();
    expect(abFormStateFrom(undefined)).toBeNull();
    expect(abFormStateFrom(AB_OFF)).toBeNull();
    expect(abFormStateFrom({ variants: [] })).toBeNull();
    expect(abFormStateFrom({ variants: [{ id: 'a', percentage: 100 }] })).toBeNull();
  });

  it('survives a config written by something other than this form', () => {
    const back = abFormStateFrom({
      variants: [{ subject: 'A' }, { subject: 'B' }],
      autoSendWinner: false,
    });
    expect(back!.variants.map((v) => v.id)).toEqual(['a', 'b']);
    expect(back!.variants.map((v) => v.percentage)).toEqual(['0', '0']);
    expect(back!.autoSendWinner).toBe(false);
    // Missing duration reads back as blank, which buildAbConfig then refuses
    // rather than quietly saving a test that can never finish.
    expect(back!.testDurationHours).toBe('');
  });
});
