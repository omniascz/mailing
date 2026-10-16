import { describe, it, expect } from 'vitest';
import {
  FLOW_MARKETING_REFUSED_CONTACT_STATUSES,
  FLOW_TRANSACTIONAL_LIFTED_STATUSES,
  MARKETING_REFUSED_CONTACT_STATUSES,
  refusesFlowMarketing,
  refusesMarketing,
} from './index.js';

/**
 * A flow's marketing node refuses the shared list plus 'non_subscribed' —
 * Michal, 14. 10. 22:10, point 3 (Z166). Every value of the contact_status
 * enum (apps/api db/schema/enums.ts) and the empty cases. The shared list and
 * the exception's list are not changed by it.
 */
describe('refusesFlowMarketing', () => {
  it.each([
    ['active', false],
    ['unsubscribed', true],
    ['bounced', true],
    ['complained', true],
    ['pending', true],
    ['non_subscribed', true],
    ['archived', true],
    [null, false],
    [undefined, false],
  ] as const)('%s → %s', (status, refused) => {
    expect(refusesFlowMarketing(status)).toBe(refused);
  });

  it('the list is the shared list plus non_subscribed', () => {
    expect([...FLOW_MARKETING_REFUSED_CONTACT_STATUSES].sort()).toEqual(
      [...MARKETING_REFUSED_CONTACT_STATUSES, 'non_subscribed'].sort(),
    );
  });

  it('differs from refusesMarketing only in non_subscribed', () => {
    const all = [
      'active',
      'unsubscribed',
      'bounced',
      'complained',
      'pending',
      'non_subscribed',
      'archived',
    ];
    expect(all.filter((s) => refusesFlowMarketing(s) !== refusesMarketing(s))).toEqual([
      'non_subscribed',
    ]);
  });

  it('leaves the shared list and the exception list as they were', () => {
    expect([...MARKETING_REFUSED_CONTACT_STATUSES].sort()).toEqual(
      ['archived', 'bounced', 'complained', 'pending', 'unsubscribed'].sort(),
    );
    expect([...FLOW_TRANSACTIONAL_LIFTED_STATUSES].sort()).toEqual(
      ['archived', 'complained', 'pending', 'unsubscribed'].sort(),
    );
  });
});
