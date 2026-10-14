/**
 * The pure half of consent-hold.ts: which status an operator may write over a
 * refusal, and which status an archive from before 0033 is read back as. The
 * routes that use them are walked end to end, with real sends, in
 * apps/workers/src/integration/no-resurrection.integration.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  assertNotLiftingRefusal,
  statusFromSuppressionReasons,
  type ContactStatus,
} from './consent-hold.js';

const ALL: ContactStatus[] = [
  'active',
  'unsubscribed',
  'bounced',
  'complained',
  'pending',
  'non_subscribed',
  'archived',
];

const refused = (held: ContactStatus, next: ContactStatus): boolean => {
  try {
    assertNotLiftingRefusal(held, next);
    return false;
  } catch (err) {
    expect(err).toMatchObject({ code: 'CONSENT_REQUIRED', statusCode: 409 });
    return true;
  }
};

describe('assertNotLiftingRefusal', () => {
  it('an unsubscribed contact can be archived or marked complained, nothing that sends', () => {
    const allowed = ALL.filter((next) => !refused('unsubscribed', next));
    expect(allowed.sort()).toEqual(['archived', 'complained', 'unsubscribed']);
  });

  it('a complained contact can be archived or unsubscribed, nothing that sends', () => {
    const allowed = ALL.filter((next) => !refused('complained', next));
    expect(allowed.sort()).toEqual(['archived', 'complained', 'unsubscribed']);
  });

  it('a contact who never said yes can be moved anywhere but active', () => {
    for (const held of ['pending', 'non_subscribed'] as const) {
      const allowed = ALL.filter((next) => !refused(held, next));
      expect(allowed.sort(), held).toEqual(ALL.filter((s) => s !== 'active').sort());
    }
  });

  it('active and bounced are not this guard’s business', () => {
    for (const held of ['active', 'bounced'] as const)
      for (const next of ALL) expect(refused(held, next), `${held} → ${next}`).toBe(false);
  });
});

describe('statusFromSuppressionReasons', () => {
  it('reads back the strongest refusal first', () => {
    expect(statusFromSuppressionReasons(['unsubscribe', 'complaint'])).toBe('complained');
    expect(statusFromSuppressionReasons(['hard_bounce', 'unsubscribe'])).toBe('unsubscribed');
    expect(statusFromSuppressionReasons(['invalid_email'])).toBe('bounced');
    expect(statusFromSuppressionReasons(['block'])).toBe('bounced');
    expect(statusFromSuppressionReasons(['hard_bounce'])).toBe('bounced');
  });

  it('no row, or only a manual one, is what unarchive always gave back', () => {
    expect(statusFromSuppressionReasons([])).toBe('active');
    expect(statusFromSuppressionReasons(['manual'])).toBe('active');
  });
});
