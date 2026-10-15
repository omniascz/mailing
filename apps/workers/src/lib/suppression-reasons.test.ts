/**
 * batch-sender's status test, with the flow's transactional exception and
 * without it (Z158). Every value of the contact_status enum and the empty
 * cases.
 */
import { describe, it, expect } from 'vitest';
import { refusedByStatus } from './suppression-reasons.js';

describe('refusedByStatus', () => {
  it.each([
    ['active', false, false],
    ['non_subscribed', false, false],
    ['pending', true, false],
    ['archived', true, false],
    ['unsubscribed', true, false],
    ['complained', true, false],
    // Bounced waits on Michal: refused with the exception as without it.
    ['bounced', true, true],
    [null, false, false],
    [undefined, false, false],
  ] as const)('%s → refused %s without the exception, %s with it', (status, without, withIt) => {
    expect(refusedByStatus(status, false)).toBe(without);
    expect(refusedByStatus(status, true)).toBe(withIt);
  });
});
