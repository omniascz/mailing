import { describe, it, expect } from 'vitest';
import { MARKETING_REFUSED_CONTACT_STATUSES, refusesMarketing } from './index.js';

/**
 * Every value of the contact_status enum (apps/api db/schema/enums.ts) and
 * the empty cases. 'archived' is refused since Z153; 'non_subscribed' is not —
 * it waits on the owner's decision about § 7(3).
 */
describe('refusesMarketing', () => {
  it.each([
    ['active', false],
    ['unsubscribed', true],
    ['bounced', true],
    ['complained', true],
    ['pending', true],
    ['non_subscribed', false],
    ['archived', true],
    [null, false],
    [undefined, false],
  ] as const)('%s → %s', (status, refused) => {
    expect(refusesMarketing(status)).toBe(refused);
  });

  it('the list is exactly the five refused statuses', () => {
    expect([...MARKETING_REFUSED_CONTACT_STATUSES].sort()).toEqual(
      ['archived', 'bounced', 'complained', 'pending', 'unsubscribed'].sort(),
    );
  });
});
