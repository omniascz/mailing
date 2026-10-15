/**
 * Which seeded ticketing nodes are transactional (Z156).
 *
 * Michal, 14. 10. 22:10: a node with priority 'transactional' in a flow on a
 * transactional trigger reaches an unsubscribed, complained or non_subscribed
 * contact. The commissioner (15. 10.): the day-of reminder (the ticket) and
 * the event change notice get it; the day-of SMS always had it; every other
 * seed stays marketing — the Referral too, although it shares order_paid.
 */
import { describe, it, expect } from 'vitest';
import { SEED_DEFS, buildWorkflowGraph } from './seed-workflows.js';
import { isTransactionalFlowTrigger } from '../workflows/transactional-exception.js';

const sendNode = (key: string) => {
  const def = SEED_DEFS.find((d) => d.key === key)!;
  return buildWorkflowGraph(def).nodes.find((n) => n.id === 'send')!;
};

describe('seeded ticketing priorities', () => {
  it('the ticket and the change of an event are transactional nodes', () => {
    for (const key of ['day_of_reminder', 'event_changed', 'day_of_sms']) {
      expect(sendNode(key).config.priority, key).toBe('transactional');
    }
  });

  it('every other seed is not', () => {
    const others = SEED_DEFS.filter(
      (d) => !['day_of_reminder', 'event_changed', 'day_of_sms'].includes(d.key),
    );
    expect(others.map((d) => d.key).sort()).toEqual([
      'abandoned_cart',
      'discover_digest',
      'fill_the_house_offer',
      'lottery_won',
      'post_event_review',
      'referral',
      'renewal_dunning',
      'waitlist_freed',
    ]);
    for (const d of others) expect(sendNode(d.key).config.priority, d.key).toBeUndefined();
  });

  it('a transactional seed is a seed on a transactional trigger', () => {
    for (const d of SEED_DEFS) {
      if (sendNode(d.key).config.priority !== 'transactional') continue;
      expect(isTransactionalFlowTrigger('api_event', { eventName: d.eventName }), d.key).toBe(true);
    }
  });
});
