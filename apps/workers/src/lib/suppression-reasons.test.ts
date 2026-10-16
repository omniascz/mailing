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

  // Z166 — Michal, 14. 10. 22:10, point 3: a flow's marketing node refuses
  // non_subscribed as well; under the exception flowMarketing is not read.
  it.each([
    ['active', false],
    ['non_subscribed', true],
    ['pending', true],
    ['archived', true],
    ['unsubscribed', true],
    ['complained', true],
    ['bounced', true],
    [null, false],
    [undefined, false],
  ] as const)('%s → refused %s for a flow marketing node', (status, refused) => {
    expect(refusedByStatus(status, false, true)).toBe(refused);
  });

  it.each([
    'active',
    'non_subscribed',
    'pending',
    'archived',
    'unsubscribed',
    'complained',
    'bounced',
  ])('%s: with the exception the flowMarketing flag changes nothing', (status) => {
    expect(refusedByStatus(status, true, true)).toBe(refusedByStatus(status, true));
  });
});
