import { describe, it, expect } from 'vitest';
import { computeReport, type ReportEvent, type ReportDefinition } from './pure.js';

function ev(
  eventType: ReportEvent['eventType'],
  iso: string,
  contactId?: string,
  campaignId?: string,
): ReportEvent {
  return { eventType, createdAt: new Date(iso), contactId, campaignId };
}

// A small fixture: 2 delivered, 1 unique open (2 open events same contact),
// 1 click (distinct contact), 1 bounce, spread across two days.
const events: ReportEvent[] = [
  ev('deliver', '2026-06-01T10:00:00Z', 'c1', 'camp1'),
  ev('deliver', '2026-06-01T10:00:00Z', 'c2', 'camp1'),
  ev('open', '2026-06-01T11:00:00Z', 'c1', 'camp1'),
  ev('open', '2026-06-01T12:00:00Z', 'c1', 'camp1'), // duplicate open, same contact
  ev('click', '2026-06-02T09:00:00Z', 'c2', 'camp1'),
  ev('bounce', '2026-06-02T09:30:00Z', 'c3', 'camp1'),
  ev('send', '2026-06-01T09:00:00Z', 'c1', 'camp1'),
  ev('send', '2026-06-01T09:00:00Z', 'c2', 'camp1'),
  ev('send', '2026-06-02T09:00:00Z', 'c3', 'camp1'),
];

describe('computeReport totals', () => {
  it('counts base metrics and unique opens/clicks', () => {
    const def: ReportDefinition = {
      metrics: [
        'sends',
        'delivered',
        'opens',
        'unique_opens',
        'clicks',
        'unique_clicks',
        'bounces',
      ],
      dimension: 'none',
    };
    const { rows, totals } = computeReport(events, def);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.group).toBe('all');
    expect(totals.sends).toBe(3);
    expect(totals.delivered).toBe(2);
    expect(totals.opens).toBe(2); // 2 raw open events
    expect(totals.unique_opens).toBe(1); // same contact
    expect(totals.clicks).toBe(1);
    expect(totals.unique_clicks).toBe(1);
    expect(totals.bounces).toBe(1);
  });

  it('derives rates using newsletter conventions (unique / delivered)', () => {
    const def: ReportDefinition = {
      metrics: ['open_rate', 'click_rate', 'click_to_open_rate', 'bounce_rate'],
      dimension: 'none',
    };
    const { totals } = computeReport(events, def);
    expect(totals.open_rate).toBe(0.5); // 1 unique open / 2 delivered
    expect(totals.click_rate).toBe(0.5); // 1 unique click / 2 delivered
    expect(totals.click_to_open_rate).toBe(1); // 1 unique click / 1 unique open
    expect(totals.bounce_rate).toBeCloseTo(0.3333, 4); // 1 bounce / 3 sends
  });

  it('returns 0 for rates with a zero denominator', () => {
    const { totals } = computeReport([ev('open', '2026-06-01T10:00:00Z', 'c1')], {
      metrics: ['open_rate'],
      dimension: 'none',
    });
    expect(totals.open_rate).toBe(0); // no delivered events
  });
});

describe('computeReport dimensions', () => {
  it('groups by day, sorted ascending', () => {
    const def: ReportDefinition = { metrics: ['sends', 'delivered'], dimension: 'day' };
    const { rows } = computeReport(events, def);
    expect(rows.map((r) => r.group)).toEqual(['2026-06-01', '2026-06-02']);
    expect(rows[0]!.values.delivered).toBe(2);
    expect(rows[1]!.values.sends).toBe(1);
  });

  it('groups by month', () => {
    const { rows } = computeReport(events, { metrics: ['sends'], dimension: 'month' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.group).toBe('2026-06');
  });

  it('groups by ISO week (Monday-anchored)', () => {
    // 2026-06-01 is a Monday → its own week bucket.
    const { rows } = computeReport(events, { metrics: ['sends'], dimension: 'week' });
    expect(rows[0]!.group).toBe('2026-06-01');
  });

  it('groups by campaign', () => {
    const mixed = [
      ev('open', '2026-06-01T10:00:00Z', 'c1', 'campA'),
      ev('open', '2026-06-01T10:00:00Z', 'c2', 'campB'),
      ev('click', '2026-06-01T10:00:00Z', 'c1'), // no campaign → 'none'
    ];
    const { rows } = computeReport(mixed, { metrics: ['opens', 'clicks'], dimension: 'campaign' });
    const groups = rows.map((r) => r.group);
    expect(groups).toContain('campA');
    expect(groups).toContain('campB');
    expect(groups).toContain('none');
  });
});
