import { describe, it, expect } from 'vitest';
import {
  scoreCandidate,
  rankAudienceForEvent,
  buildCascadeSteps,
  type AudienceCandidate,
} from './fill-the-house.js';
import { computeDayOfSchedule, stepsDueNow } from './day-of.js';
import { coOccurrence, recommendForContact } from './recommendations.js';
import { recipesForTrigger, recipesByGroup, TICKETING_RECIPES } from './recipes.js';
import { ATTENDANCE_FOR_TYPE } from './ingest.js';
import { buildWorkflowGraph, SEED_DEFS } from './seed-workflows.js';

// ─── Fill-the-house (yield) ───────────────────────────────────────────────────

describe('scoreCandidate', () => {
  const event = { venueCity: 'Brno', category: 'music' };

  it('rewards city match, category affinity, recency, frequency', () => {
    const hot: AudienceCandidate = {
      contactId: 'a',
      city: 'Brno',
      attendedCategories: ['music'],
      lapsedDays: 10,
      orders: 5,
    };
    const cold: AudienceCandidate = {
      contactId: 'b',
      city: 'Praha',
      attendedCategories: ['sport'],
      lapsedDays: 400,
      orders: 0,
    };
    expect(scoreCandidate(hot, event)).toBeGreaterThan(scoreCandidate(cold, event));
  });

  it('city match is case-insensitive', () => {
    const c: AudienceCandidate = {
      contactId: 'a',
      city: 'brno',
      attendedCategories: [],
      lapsedDays: 999,
      orders: 0,
    };
    expect(scoreCandidate(c, event)).toBeGreaterThanOrEqual(40);
  });

  it('never-purchased (Infinity lapsed) does not crash + scores low', () => {
    const c: AudienceCandidate = {
      contactId: 'a',
      city: 'Ostrava',
      attendedCategories: [],
      lapsedDays: Infinity,
      orders: 0,
    };
    expect(Number.isFinite(scoreCandidate(c, event))).toBe(true);
    expect(scoreCandidate(c, event)).toBe(0);
  });
});

describe('rankAudienceForEvent', () => {
  it('sorts best-fit first', () => {
    const ranked = rankAudienceForEvent(
      [
        { contactId: 'far', city: 'Praha', attendedCategories: [], lapsedDays: 500, orders: 0 },
        {
          contactId: 'near',
          city: 'Brno',
          attendedCategories: ['music'],
          lapsedDays: 5,
          orders: 8,
        },
      ],
      { venueCity: 'Brno', category: 'music' },
    );
    expect(ranked[0]!.contactId).toBe('near');
  });
});

describe('buildCascadeSteps', () => {
  it('no steps when nothing unsold', () => {
    expect(buildCascadeSteps(0, 1000)).toEqual([]);
  });

  it('escalates discount + reach as the event approaches (high pressure)', () => {
    const steps = buildCascadeSteps(900, 1000); // pressure ~0.9 → all 4 waves
    expect(steps).toHaveLength(4);
    expect(steps[0]!.discountPct).toBe(0);
    expect(steps[3]!.discountPct).toBeGreaterThan(steps[1]!.discountPct);
    expect(steps[3]!.daysBeforeEvent).toBeLessThan(steps[0]!.daysBeforeEvent);
    expect(steps.map((s) => s.audienceFraction)).toEqual([0.2, 0.5, 0.85, 1.0]);
  });

  it('low pressure keeps it to early waves (no giveaway)', () => {
    expect(buildCascadeSteps(50, 1000)).toHaveLength(2); // pressure 0.05
    expect(buildCascadeSteps(200, 1000)).toHaveLength(3); // pressure 0.2
  });

  it('caps discount at 50%', () => {
    const steps = buildCascadeSteps(1000, 1000, { maxDiscountPct: 99 });
    expect(Math.max(...steps.map((s) => s.discountPct))).toBeLessThanOrEqual(50);
  });
});

// ─── Day-of journey ───────────────────────────────────────────────────────────

describe('computeDayOfSchedule', () => {
  it('returns future steps relative to event start, sorted', () => {
    const start = new Date('2026-09-01T19:00:00Z');
    const now = new Date('2026-08-20T00:00:00Z'); // well before
    const sched = computeDayOfSchedule(start, now);
    expect(sched.map((s) => s.channel)).toEqual(['email', 'sms']);
    expect(sched[0]!.sendAt.getTime()).toBe(start.getTime() - 24 * 3_600_000);
    expect(sched[1]!.sendAt.getTime()).toBe(start.getTime() - 2 * 3_600_000);
  });

  it('drops steps already in the past', () => {
    const start = new Date('2026-09-01T19:00:00Z');
    const now = new Date('2026-09-01T18:00:00Z'); // 1h before → -24h email + -2h sms both passed
    const sched = computeDayOfSchedule(start, now);
    expect(sched).toEqual([]); // nothing left before the show
  });
});

describe('stepsDueNow', () => {
  it('fires a step only within the tick window', () => {
    const start = new Date('2026-09-01T19:00:00Z');
    const emailAt = new Date(start.getTime() - 24 * 3_600_000);
    const due = stepsDueNow(start, new Date(emailAt.getTime() + 2 * 60_000), 5); // 2 min after email-due
    expect(due.map((s) => s.channel)).toEqual(['email']);
    const notDue = stepsDueNow(start, new Date(emailAt.getTime() + 30 * 60_000), 5); // 30 min later
    expect(notDue).toHaveLength(0);
  });
});

// ─── Recommendations (co-attendance) ──────────────────────────────────────────

describe('coOccurrence + recommendForContact', () => {
  const pairs = [
    { contactId: 'u1', eventId: 'A' },
    { contactId: 'u1', eventId: 'B' },
    { contactId: 'u2', eventId: 'A' },
    { contactId: 'u2', eventId: 'B' },
    { contactId: 'u2', eventId: 'C' },
    { contactId: 'u3', eventId: 'A' },
    { contactId: 'u3', eventId: 'C' },
  ];

  it('counts shared attendees symmetrically', () => {
    const co = coOccurrence(pairs);
    expect(co.get('A')!.get('B')).toBe(2); // u1,u2 attended both A&B
    expect(co.get('B')!.get('A')).toBe(2);
    expect(co.get('A')!.get('C')).toBe(2); // u2,u3
  });

  it('recommends co-attended events the contact has not seen', () => {
    const co = coOccurrence(pairs);
    // a contact who attended only A → recommend B (2) and C (2), not A
    const recs = recommendForContact(['A'], co);
    const ids = recs.map((r) => r.eventId).sort();
    expect(ids).toEqual(['B', 'C']);
    expect(recs.every((r) => r.eventId !== 'A')).toBe(true);
  });

  it('respects eligibleEvents filter + limit', () => {
    const co = coOccurrence(pairs);
    const recs = recommendForContact(['A'], co, { eligibleEvents: new Set(['B']), limit: 5 });
    expect(recs.map((r) => r.eventId)).toEqual(['B']);
  });
});

// ─── Recipe catalog ───────────────────────────────────────────────────────────

describe('ticketing recipe catalog', () => {
  it('covers all 7 feature groups', () => {
    const groups = recipesByGroup();
    expect(Object.keys(groups).map(Number).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('maps triggers to recipes', () => {
    expect(recipesForTrigger('cart_abandoned').some((r) => r.key === 'abandoned_cart')).toBe(true);
    expect(recipesForTrigger('event_attended').some((r) => r.key === 'post_event_review')).toBe(
      true,
    );
  });

  it('every recipe names at least one ForgeMsg module', () => {
    expect(TICKETING_RECIPES.every((r) => r.modules.length > 0)).toBe(true);
  });
});

// ─── Ingest mapping ───────────────────────────────────────────────────────────

describe('ATTENDANCE_FOR_TYPE', () => {
  it('maps purchase + attendance + waitlist + lottery; not contact_sync', () => {
    expect(ATTENDANCE_FOR_TYPE.order_paid).toBe('purchased');
    expect(ATTENDANCE_FOR_TYPE.event_attended).toBe('attended');
    expect(ATTENDANCE_FOR_TYPE.lottery_won).toBe('lottery_won');
    expect(ATTENDANCE_FOR_TYPE.contact_sync).toBeUndefined();
  });
});

describe('seed workflows', () => {
  it('builds a valid trigger → wait → send graph when waitHours set', () => {
    const def = SEED_DEFS.find((d) => d.key === 'abandoned_cart')!;
    const { nodes, edges } = buildWorkflowGraph(def);
    expect(nodes[0]!.type).toBe('trigger');
    expect(nodes.map((n) => n.type)).toContain('wait');
    expect(nodes.map((n) => n.type)).toContain('send_email');
    // edges form a connected path trigger → wait → send
    expect(edges.some((e) => e.source === 'trigger' && e.target === 'wait')).toBe(true);
    expect(edges.some((e) => e.source === 'wait' && e.target === 'send')).toBe(true);
  });

  it('builds trigger → send directly when no wait', () => {
    const def = SEED_DEFS.find((d) => d.key === 'waitlist_freed')!;
    const { nodes, edges } = buildWorkflowGraph(def);
    expect(nodes.map((n) => n.type)).toEqual(['trigger', 'send_email']);
    expect(edges).toEqual([{ id: 'e_trigger_send', source: 'trigger', target: 'send' }]);
  });

  it('every seed has a ticketing.* trigger + a content-carrying send node', () => {
    for (const d of SEED_DEFS) {
      expect(d.eventName.startsWith('ticketing.')).toBe(true);
      const send = buildWorkflowGraph(d).nodes.find(
        (n) => n.type === 'send_email' || n.type === 'send_sms',
      )!;
      expect(send).toBeTruthy();
      if (send.type === 'send_sms') {
        expect((send.config as { message?: string }).message).toBeTruthy();
      } else {
        const cfg = send.config as { subject?: string; html?: string };
        expect(cfg.subject && cfg.html).toBeTruthy();
      }
    }
  });

  it('builds an SMS seed as a send_sms node', () => {
    const def = SEED_DEFS.find((d) => d.key === 'day_of_sms')!;
    const { nodes } = buildWorkflowGraph(def);
    const send = nodes.find((n) => n.id === 'send')!;
    expect(send.type).toBe('send_sms');
    expect((send.config as { message?: string }).message).toContain('{{ticket_url}}');
  });

  it('covers the key reuse + cron-driven recipes', () => {
    const keys = SEED_DEFS.map((d) => d.key);
    for (const k of [
      'abandoned_cart',
      'post_event_review',
      'referral',
      'day_of_reminder',
      'day_of_sms',
      'fill_the_house_offer',
      'discover_digest',
    ]) {
      expect(keys).toContain(k);
    }
  });
});
