/**
 * flowTransactionalException — the one place that decides a flow's
 * transactional exception (Z156; Michal, 14. 10. 22:10).
 *
 * The database is a stub that answers the run → flow lookup with the row the
 * test sets, and records the WHERE clause so the org scoping can be read back
 * as SQL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const state = vi.hoisted(() => ({
  row: null as null | { triggerType: string; triggerConfig: unknown; nodes: unknown },
  queries: 0,
  where: null as unknown,
}));

vi.mock('../../db/client.js', () => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: (w: unknown) => {
      state.where = w;
      return chain;
    },
    limit: () => {
      state.queries++;
      return Promise.resolve(state.row ? [state.row] : []);
    },
  };
  return { db: { select: () => chain } };
});

import {
  flowTransactionalException,
  isTransactionalFlowTrigger,
  TRANSACTIONAL_FLOW_TRIGGERS,
} from './transactional-exception.js';

const ORG = '00000000-0000-4000-8000-000000000001';
const RUN = '00000000-0000-4000-8000-000000000003';

function flow(
  eventName: string | undefined,
  node: { id?: string; type?: string; config?: Record<string, unknown> | null } = {},
  triggerType = 'api_event',
) {
  state.row = {
    triggerType,
    triggerConfig: eventName === undefined ? {} : { eventName },
    nodes: [
      { id: 'trigger', type: 'trigger', config: {} },
      {
        id: node.id ?? 'send',
        type: node.type ?? 'send_sms',
        config:
          node.config === undefined ? { message: 'x', priority: 'transactional' } : node.config,
      },
    ],
  };
}

/** "api_event:<eventName>", or "purchase_event", which is listed whatever its config. */
function listed(t: (typeof TRANSACTIONAL_FLOW_TRIGGERS)[number]): string {
  if (t.triggerType === 'purchase_event') return t.triggerType;
  return `${t.triggerType}:${t.eventName}`;
}

const LISTED_EVENT_NAMES: string[] = [];
for (const t of TRANSACTIONAL_FLOW_TRIGGERS) {
  if (t.triggerType === 'api_event') LISTED_EVENT_NAMES.push(t.eventName);
}

beforeEach(() => {
  state.row = null;
  state.queries = 0;
  state.where = null;
});

describe('the closed list of transactional triggers', () => {
  // Z163: purchase_event joined the list (Michal, 15. 10. 19:40, point 1c a+b).
  it('is the order, the two day-of events, the change of an event and purchase_event', () => {
    expect(TRANSACTIONAL_FLOW_TRIGGERS.map(listed).sort()).toEqual([
      'api_event:ticketing.day_of_reminder',
      'api_event:ticketing.day_of_sms',
      'api_event:ticketing.event_changed',
      'api_event:ticketing.order_paid',
      'purchase_event',
    ]);
  });

  it.each([
    'ticketing.cart_abandoned',
    'ticketing.order_refunded',
    'ticketing.event_attended',
    'ticketing.waitlist_freed',
    'ticketing.lottery_won',
    'ticketing.fill_the_house_offer',
    'ticketing.discover_digest',
    'ticketing.subscription_past_due',
    'order_placed',
    'checkout_started',
    // Z164 first (Michal, point 1d): a publishable key can still fire them.
    'payment_pending',
    'pickup_ready',
    'order_shipped',
    'ticketing.order_paid ',
    'TICKETING.ORDER_PAID',
  ])('%s is not on it', (eventName) => {
    expect(isTransactionalFlowTrigger('api_event', { eventName })).toBe(false);
  });

  it('a flow with no eventName (it starts on every api_event) is not on it', () => {
    expect(isTransactionalFlowTrigger('api_event', {})).toBe(false);
    expect(isTransactionalFlowTrigger('api_event', null)).toBe(false);
  });

  // Z163: was "purchase_event is not on it" — Michal, 15. 10. 19:40, point 1c a+b.
  it('purchase_event is on it whatever its triggerConfig', () => {
    expect(isTransactionalFlowTrigger('purchase_event', {})).toBe(true);
    expect(isTransactionalFlowTrigger('purchase_event', null)).toBe(true);
    expect(isTransactionalFlowTrigger('purchase_event', { categoryTag: 'consumable' })).toBe(true);
    expect(
      isTransactionalFlowTrigger('purchase_event', { eventName: 'ticketing.order_paid' }),
    ).toBe(true);
  });

  it('a listed name under another trigger type is not on it', () => {
    expect(isTransactionalFlowTrigger('manual', { eventName: 'ticketing.day_of_sms' })).toBe(false);
    expect(isTransactionalFlowTrigger('purchase', {})).toBe(false);
    expect(isTransactionalFlowTrigger('api_event', { eventName: 'purchase_event' })).toBe(false);
  });
});

describe('flowTransactionalException', () => {
  it.each(LISTED_EVENT_NAMES)(
    'holds for a transactional send_sms and send_email node on %s',
    async (eventName) => {
      flow(eventName);
      expect(await flowTransactionalException(ORG, RUN, 'send')).toBe(true);
      flow(eventName, {
        type: 'send_email',
        config: { html: '<p>x</p>', priority: 'transactional' },
      });
      expect(await flowTransactionalException(ORG, RUN, 'send')).toBe(true);
    },
  );

  it('does not hold for a transactional node on another trigger', async () => {
    flow('ticketing.cart_abandoned');
    expect(await flowTransactionalException(ORG, RUN, 'send')).toBe(false);
    flow(undefined);
    expect(await flowTransactionalException(ORG, RUN, 'send')).toBe(false);
    flow('payment_pending', { type: 'send_email', config: { priority: 'transactional' } });
    expect(await flowTransactionalException(ORG, RUN, 'send')).toBe(false);
  });

  // Z163: was false — Michal, 15. 10. 19:40, point 1c a+b.
  it('holds on purchase_event for a transactional node only', async () => {
    const transactional = { type: 'send_email', config: { priority: 'transactional' } };
    flow(undefined, transactional, 'purchase_event');
    expect(await flowTransactionalException(ORG, RUN, 'send')).toBe(true);
    flow(undefined, {}, 'purchase_event');
    expect(await flowTransactionalException(ORG, RUN, 'send')).toBe(true);
    flow(undefined, { type: 'send_email', config: { templateId: 't' } }, 'purchase_event');
    expect(await flowTransactionalException(ORG, RUN, 'send')).toBe(false);
    flow(
      undefined,
      { type: 'send_email', config: { templateId: 't', priority: 'marketing' } },
      'purchase_event',
    );
    expect(await flowTransactionalException(ORG, RUN, 'send')).toBe(false);
  });

  it.each([
    ['no priority', { message: 'x' }],
    ['marketing', { message: 'x', priority: 'marketing' }],
    ['promotional', { message: 'x', priority: 'promotional' }],
    ['a different spelling', { message: 'x', priority: 'Transactional' }],
    ['a boolean', { message: 'x', priority: true }],
    ['a null config', null],
  ])('does not hold for a node with %s', async (_label, config) => {
    flow('ticketing.day_of_sms', { config });
    expect(await flowTransactionalException(ORG, RUN, 'send')).toBe(false);
  });

  it.each(['send_whatsapp', 'send_push', 'send_review_request', 'send_personal_email', 'add_tag'])(
    'does not hold for a %s node, even with priority transactional',
    async (type) => {
      flow('ticketing.day_of_sms', { type });
      expect(await flowTransactionalException(ORG, RUN, 'send')).toBe(false);
    },
  );

  it('does not hold for a node id the flow does not have', async () => {
    flow('ticketing.day_of_sms');
    expect(await flowTransactionalException(ORG, RUN, 'ghost')).toBe(false);
    expect(await flowTransactionalException(ORG, RUN, 'trigger')).toBe(false);
  });

  it('does not hold when the run is not found — another org, or no such run', async () => {
    state.row = null;
    expect(await flowTransactionalException(ORG, RUN, 'send')).toBe(false);
    expect(state.queries).toBe(1);
  });

  it('asks without a query when the job carries no nodeId or no run', async () => {
    flow('ticketing.day_of_sms');
    expect(await flowTransactionalException(ORG, RUN, undefined)).toBe(false);
    expect(await flowTransactionalException(ORG, RUN, '')).toBe(false);
    expect(await flowTransactionalException(ORG, undefined, 'send')).toBe(false);
    expect(await flowTransactionalException(ORG, null, null)).toBe(false);
    expect(state.queries).toBe(0);
  });

  it('scopes the run AND its flow to the org, in one query', async () => {
    flow('ticketing.day_of_sms');
    await flowTransactionalException(ORG, RUN, 'send');
    expect(state.queries).toBe(1);
    const q = new PgDialect().sqlToQuery(state.where as SQL);
    expect(q.sql).toContain('"workflow_runs"."id" = $1');
    expect(q.sql).toContain('"workflow_runs"."org_id" = $2');
    expect(q.sql).toContain('"workflows"."org_id" = $3');
    expect(q.params).toEqual([RUN, ORG, ORG]);
  });

  it('a nodes column that is not an array answers false, not a throw', async () => {
    state.row = {
      triggerType: 'api_event',
      triggerConfig: { eventName: 'ticketing.day_of_sms' },
      nodes: null,
    };
    expect(await flowTransactionalException(ORG, RUN, 'send')).toBe(false);
  });
});
