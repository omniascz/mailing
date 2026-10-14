/**
 * The pure half of consent-hold.ts: which status an operator may write over a
 * refusal, and which status an archive from before 0033 is read back as. The
 * routes that use them are walked end to end, with real sends, in
 * apps/workers/src/integration/no-resurrection.integration.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  assertBounceReleased,
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

describe('assertBounceReleased', () => {
  const row = (reason: string) => ({ id: `id-${reason}`, reason });
  const blocked = (held: ContactStatus, next: ContactStatus, reasons: string[]) => {
    try {
      assertBounceReleased(held, next, reasons.map(row));
      return null;
    } catch (err) {
      return err as { code: string; statusCode: number; message: string; details: unknown };
    }
  };

  it('bounced → active waits while the address has a hard_bounce or invalid_email row', () => {
    for (const reason of ['hard_bounce', 'invalid_email']) {
      const err = blocked('bounced', 'active', [reason]);
      expect(err, reason).toMatchObject({
        code: 'BOUNCE_ACTIVE',
        statusCode: 409,
        details: { reason, suppressionId: `id-${reason}` },
      });
      expect(err!.message).toContain(reason);
      expect(err!.message).toContain('owner or admin must first release');
      expect(err!.message).toContain(`DELETE /api/v1/suppressions/id-${reason}`);
    }
  });

  it('bounced → active goes through with no such row, or only rows that are not a bounce', () => {
    for (const reasons of [[], ['block'], ['complaint'], ['unsubscribe'], ['manual']])
      expect(blocked('bounced', 'active', reasons), reasons.join() || 'no row').toBeNull();
  });

  it('bounced → anything but active is not refused, row or not', () => {
    for (const next of ALL.filter((s) => s !== 'active'))
      expect(blocked('bounced', next, ['hard_bounce', 'invalid_email']), next).toBeNull();
  });

  it('only a held bounced status is checked — other statuses have their own rules', () => {
    for (const held of ALL.filter((s) => s !== 'bounced'))
      expect(blocked(held, 'active', ['hard_bounce']), held).toBeNull();
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
