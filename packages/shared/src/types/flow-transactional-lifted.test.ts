import { describe, it, expect } from 'vitest';
import {
  FLOW_TRANSACTIONAL_LIFTED_STATUSES,
  MARKETING_REFUSED_CONTACT_STATUSES,
  liftedByFlowTransactional,
} from './index.js';

/**
 * Every value of the contact_status enum (apps/api db/schema/enums.ts) and the
 * empty cases. Michal, 14. 10. 22:10, in the commissioner's narrowest reading
 * (Z156): a flow's transactional exception lifts only unsubscribed and
 * complained ('non_subscribed' is not refused in the first place). Pending,
 * archived and bounced stay refused.
 */
describe('liftedByFlowTransactional', () => {
  it.each([
    ['active', false],
    ['unsubscribed', true],
    ['complained', true],
    ['bounced', false],
    ['pending', false],
    ['archived', false],
    ['non_subscribed', false],
    [null, false],
    [undefined, false],
  ] as const)('%s → %s', (status, lifted) => {
    expect(liftedByFlowTransactional(status)).toBe(lifted);
  });

  it('the list is exactly unsubscribed and complained, and both are refused statuses', () => {
    expect([...FLOW_TRANSACTIONAL_LIFTED_STATUSES].sort()).toEqual(['complained', 'unsubscribed']);
    for (const s of FLOW_TRANSACTIONAL_LIFTED_STATUSES) {
      expect(MARKETING_REFUSED_CONTACT_STATUSES).toContain(s);
    }
  });
});
