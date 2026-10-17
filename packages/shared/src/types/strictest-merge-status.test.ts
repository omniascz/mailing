import { describe, it, expect } from 'vitest';
import { strictestMergeStatus, type ContactStatus, type MergeStatusInput } from './index.js';

/**
 * The winner of a merge gets the strictest consent status of the merged
 * contacts: complained > unsubscribed > pending > non_subscribed > active.
 * A bounce belongs to an address and is not carried; an archive counts by
 * what it replaced (Z174, položka 6).
 */
const c = (status: ContactStatus, archivedFrom: ContactStatus | null = null): MergeStatusInput => ({
  status,
  archivedFrom,
});

describe('strictestMergeStatus', () => {
  it.each([
    // winner, loser, winner after
    ['active', 'complained', 'complained'],
    ['active', 'unsubscribed', 'unsubscribed'],
    ['active', 'pending', 'pending'],
    ['active', 'non_subscribed', 'non_subscribed'],
    ['active', 'active', 'active'],
    ['non_subscribed', 'pending', 'pending'],
    ['non_subscribed', 'unsubscribed', 'unsubscribed'],
    ['non_subscribed', 'active', 'non_subscribed'],
    ['pending', 'unsubscribed', 'unsubscribed'],
    ['pending', 'non_subscribed', 'pending'],
    ['unsubscribed', 'complained', 'complained'],
    ['unsubscribed', 'pending', 'unsubscribed'],
    ['complained', 'unsubscribed', 'complained'],
    ['complained', 'active', 'complained'],
  ] as const)('%s ← %s → %s', (winner, loser, after) => {
    expect(strictestMergeStatus(c(winner), [c(loser)])).toEqual(c(after));
  });

  it("a loser's bounce is not carried — it belongs to the loser's address", () => {
    for (const w of [
      'active',
      'non_subscribed',
      'pending',
      'unsubscribed',
      'complained',
    ] as const) {
      expect(strictestMergeStatus(c(w), [c('bounced')])).toEqual(c(w));
    }
  });

  it('a bounced winner stays bounced, whatever the losers refused', () => {
    expect(strictestMergeStatus(c('bounced'), [c('unsubscribed'), c('complained')])).toEqual(
      c('bounced'),
    );
  });

  it('an archived loser counts by its archived_from; bounced or NULL is ignored', () => {
    expect(strictestMergeStatus(c('active'), [c('archived', 'unsubscribed')])).toEqual(
      c('unsubscribed'),
    );
    expect(strictestMergeStatus(c('active'), [c('archived', 'complained')])).toEqual(
      c('complained'),
    );
    expect(strictestMergeStatus(c('active'), [c('archived', 'active')])).toEqual(c('active'));
    expect(strictestMergeStatus(c('active'), [c('archived', 'bounced')])).toEqual(c('active'));
    expect(strictestMergeStatus(c('active'), [c('archived', null)])).toEqual(c('active'));
  });

  it('an archived winner stays archived; archived_from takes the strictest', () => {
    expect(strictestMergeStatus(c('archived', 'active'), [c('unsubscribed')])).toEqual(
      c('archived', 'unsubscribed'),
    );
    expect(strictestMergeStatus(c('archived', 'unsubscribed'), [c('pending')])).toEqual(
      c('archived', 'unsubscribed'),
    );
    expect(strictestMergeStatus(c('archived', 'pending'), [c('archived', 'complained')])).toEqual(
      c('archived', 'complained'),
    );
  });

  it("an archived winner's archived_from of bounced or NULL is not changed", () => {
    expect(strictestMergeStatus(c('archived', 'bounced'), [c('complained')])).toEqual(
      c('archived', 'bounced'),
    );
    expect(strictestMergeStatus(c('archived', null), [c('complained')])).toEqual(
      c('archived', null),
    );
  });

  it('several losers: the strictest of all of them', () => {
    expect(
      strictestMergeStatus(c('active'), [
        c('pending'),
        c('bounced'),
        c('archived', 'unsubscribed'),
        c('non_subscribed'),
      ]),
    ).toEqual(c('unsubscribed'));
    expect(strictestMergeStatus(c('active'), [])).toEqual(c('active'));
  });

  it('never returns a more permissive status than the winner has', () => {
    const order: ContactStatus[] = [
      'complained',
      'unsubscribed',
      'pending',
      'non_subscribed',
      'active',
    ];
    const all: ContactStatus[] = [...order, 'bounced', 'archived'];
    for (const w of order) {
      for (const l of all) {
        for (const from of [null, ...all] as (ContactStatus | null)[]) {
          const loser = c(l, l === 'archived' ? from : null);
          const got = strictestMergeStatus(c(w), [loser]).status;
          expect(order.indexOf(got), `${w} ← ${l}/${from} → ${got}`).toBeLessThanOrEqual(
            order.indexOf(w),
          );
        }
      }
    }
  });
});
