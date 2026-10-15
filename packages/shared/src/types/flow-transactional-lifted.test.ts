import { describe, it, expect } from 'vitest';
import {
  FLOW_TRANSACTIONAL_LIFTED_STATUSES,
  MARKETING_REFUSED_CONTACT_STATUSES,
  liftedByFlowTransactional,
} from './index.js';

/**
 * Every value of the contact_status enum (apps/api db/schema/enums.ts) and the
 * empty cases. Michal, 14. 10. 22:10, in the commissioner's narrowest reading
 * (Z156): a flow's transactional exception lifted only unsubscribed and
 * complained. Michal, 15. 10. 6:10, point 1b, overrides that reading (Z158):
 * pending and archived are lifted too — the two rows below that said false
 * now say true, which is that change of behaviour. 'non_subscribed' is not
 * refused in the first place; bounced stays refused (waits on Michal).
 */
describe('liftedByFlowTransactional', () => {
  it.each([
    ['active', false],
    ['unsubscribed', true],
    ['complained', true],
    ['bounced', false],
    ['pending', true],
    ['archived', true],
    ['non_subscribed', false],
    [null, false],
    [undefined, false],
  ] as const)('%s → %s', (status, lifted) => {
    expect(liftedByFlowTransactional(status)).toBe(lifted);
  });

  it('the list is exactly unsubscribed, complained, pending and archived, all refused statuses', () => {
    expect([...FLOW_TRANSACTIONAL_LIFTED_STATUSES].sort()).toEqual([
      'archived',
      'complained',
      'pending',
      'unsubscribed',
    ]);
    for (const s of FLOW_TRANSACTIONAL_LIFTED_STATUSES) {
      expect(MARKETING_REFUSED_CONTACT_STATUSES).toContain(s);
    }
  });
});
