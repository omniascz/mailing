/**
 * Tests for analytics service and anomaly detector (tasks 4.2, 4.3, 4.4).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRows: unknown[] = [];
const mockExecRows: unknown[] = [];

const mockDb: Record<string, unknown> = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue(mockRows),
  groupBy: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  execute: vi.fn().mockResolvedValue(mockExecRows),
};

vi.mock('../../db/client.js', () => ({ db: mockDb }));
vi.mock('@forgemsg/shared/redis', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), setex: vi.fn() },
}));
vi.mock('../../db/schema/index.js', () => ({
  emailEvents: {
    campaignId: 'campaign_id',
    orgId: 'org_id',
    eventType: 'event_type',
    bounceType: 'bounce_type',
    contactId: 'contact_id',
    linkUrl: 'link_url',
    deviceType: 'device_type',
    createdAt: 'created_at',
  },
  campaigns: { id: 'id', orgId: 'org_id' },
  organizations: { id: 'id', deletedAt: 'deleted_at' },
  campaignAlerts: { orgId: 'org_id', id: 'id' },
}));

// ─── Analytics service ────────────────────────────────────────────────────────

describe('getCampaignStats', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.from as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.groupBy as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.orderBy as ReturnType<typeof vi.fn>).mockReturnThis();
  });

  it('returns zero stats when no events exist', async () => {
    // Campaign exists check
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 'camp-1' }]);
    // Events query
    (mockDb.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const { getCampaignStats } = await import('./index.js');
    const stats = await getCampaignStats('camp-1', 'org-1');

    expect(stats.sent).toBe(0);
    expect(stats.deliveryRate).toBe(0);
    expect(stats.openRate).toBe(0);
    expect(stats.clickRate).toBe(0);
    expect(stats.ctor).toBe(0);
    expect(stats.bounceRate).toBe(0);
  });

  it('calculates open rate correctly', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 'camp-1' }]);
    (mockDb.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { eventType: 'send', bounceType: null, total: 1000, uniqueContacts: 1000 },
      { eventType: 'deliver', bounceType: null, total: 980, uniqueContacts: 980 },
      { eventType: 'open', bounceType: null, total: 300, uniqueContacts: 245 },
      { eventType: 'click', bounceType: null, total: 80, uniqueContacts: 65 },
    ]);

    const { getCampaignStats } = await import('./index.js');
    const stats = await getCampaignStats('camp-1', 'org-1');

    expect(stats.sent).toBe(1000);
    expect(stats.delivered).toBe(980);
    expect(stats.deliveryRate).toBe(98);
    expect(stats.uniqueOpens).toBe(245);
    // openRate = uniqueOpens / delivered * 100 = 245/980 * 100 ≈ 25
    expect(stats.openRate).toBeCloseTo(25, 0);
    expect(stats.uniqueClicks).toBe(65);
  });

  it('calculates CTOR correctly', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 'camp-1' }]);
    (mockDb.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { eventType: 'send', bounceType: null, total: 500, uniqueContacts: 500 },
      { eventType: 'open', bounceType: null, total: 100, uniqueContacts: 100 },
      { eventType: 'click', bounceType: null, total: 50, uniqueContacts: 50 },
    ]);

    const { getCampaignStats } = await import('./index.js');
    const stats = await getCampaignStats('camp-1', 'org-1');

    // CTOR = uniqueClicks / uniqueOpens * 100 = 50/100 = 50%
    expect(stats.ctor).toBe(50);
  });

  it('separates hard and soft bounces', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 'camp-1' }]);
    (mockDb.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { eventType: 'send', bounceType: null, total: 200, uniqueContacts: 200 },
      { eventType: 'bounce', bounceType: 'hard', total: 10, uniqueContacts: 10 },
      { eventType: 'bounce', bounceType: 'soft', total: 5, uniqueContacts: 5 },
    ]);

    const { getCampaignStats } = await import('./index.js');
    const stats = await getCampaignStats('camp-1', 'org-1');

    expect(stats.bounces).toBe(15);
    expect(stats.hardBounces).toBe(10);
    expect(stats.softBounces).toBe(5);
    expect(stats.bounceRate).toBeCloseTo(7.5, 1);
  });

  it('throws NotFound when campaign does not belong to org', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]); // no campaign

    const { getCampaignStats } = await import('./index.js');
    await expect(getCampaignStats('not-found', 'org-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ─── Heatmap ──────────────────────────────────────────────────────────────────

describe('getCampaignHeatmapData', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.from as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.groupBy as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.orderBy as ReturnType<typeof vi.fn>).mockReturnThis();
  });

  it('returns link click data sorted by clicks descending', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 'camp-1' }]);
    (mockDb.orderBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { url: 'https://example.com/promo', clicks: 150, uniqueClicks: 120 },
      { url: 'https://example.com/about', clicks: 30, uniqueClicks: 25 },
    ]);

    const { getCampaignHeatmapData } = await import('./index.js');
    const data = await getCampaignHeatmapData('camp-1', 'org-1');

    expect(data.totalClicks).toBe(180);
    expect(data.links[0]!.url).toBe('https://example.com/promo');
    expect(data.links[0]!.clicks).toBe(150);
  });

  it('returns empty links when no clicks recorded', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 'camp-1' }]);
    (mockDb.orderBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const { getCampaignHeatmapData } = await import('./index.js');
    const data = await getCampaignHeatmapData('camp-1', 'org-1');

    expect(data.links).toHaveLength(0);
    expect(data.totalClicks).toBe(0);
  });
});

// ─── Anomaly detector ─────────────────────────────────────────────────────────

describe('runAnomalyCheckForOrg', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.execute as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.values as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('returns no alerts when traffic is below threshold', async () => {
    // < 10 sends → skip all checks
    (mockDb.execute as ReturnType<typeof vi.fn>).mockResolvedValue([
      { event_type: 'send', cnt: '5' },
    ]);

    const { runAnomalyCheckForOrg } = await import('./anomaly-detector.js');
    const result = await runAnomalyCheckForOrg('org-1');

    expect(result.alerts).toHaveLength(0);
  });

  it('detects bounce rate spike above absolute 5% threshold', async () => {
    const { redis } = await import('@forgemsg/shared/redis');
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    // Last hour: 100 sends, 10 bounces (10% bounce rate > 5% threshold)
    (mockDb.execute as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { event_type: 'send', cnt: '100' },
        { event_type: 'bounce', cnt: '10' },
      ])
      // 30-day baseline: normal
      .mockResolvedValueOnce([
        { event_type: 'send', cnt: '50000' },
        { event_type: 'bounce', cnt: '500' },
      ]);

    const { runAnomalyCheckForOrg } = await import('./anomaly-detector.js');
    const result = await runAnomalyCheckForOrg('org-1');

    const bounceAlert = result.alerts.find((a) => a.type === 'bounce_rate_spike');
    expect(bounceAlert).toBeDefined();
    expect(bounceAlert?.severity).toBe('warning');
  });

  it('detects complaint rate above 0.1% threshold', async () => {
    const { redis } = await import('@forgemsg/shared/redis');
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    (mockDb.execute as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { event_type: 'send', cnt: '1000' },
        { event_type: 'complaint', cnt: '2' }, // 0.2% > 0.1%
      ])
      .mockResolvedValueOnce([{ event_type: 'send', cnt: '30000' }]);

    const { runAnomalyCheckForOrg } = await import('./anomaly-detector.js');
    const result = await runAnomalyCheckForOrg('org-1');

    const alert = result.alerts.find((a) => a.type === 'complaint_rate_spike');
    expect(alert).toBeDefined();
  });

  it('detects open rate drop below 50% of baseline', async () => {
    const { redis } = await import('@forgemsg/shared/redis');
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    (mockDb.execute as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { event_type: 'send', cnt: '500' },
        { event_type: 'open', cnt: '10' }, // 2% open rate
      ])
      .mockResolvedValueOnce([
        { event_type: 'send', cnt: '100000' },
        { event_type: 'open', cnt: '25000' }, // baseline ~25%
      ]);

    const { runAnomalyCheckForOrg } = await import('./anomaly-detector.js');
    const result = await runAnomalyCheckForOrg('org-1');

    const alert = result.alerts.find((a) => a.type === 'open_rate_drop');
    expect(alert).toBeDefined();
    expect(alert?.message).toContain('dropped');
  });

  it('does not create duplicate alerts within dedup window', async () => {
    const { redis } = await import('@forgemsg/shared/redis');
    // Simulate alert already sent recently
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue('1');

    (mockDb.execute as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { event_type: 'send', cnt: '100' },
        { event_type: 'bounce', cnt: '10' },
      ])
      .mockResolvedValueOnce([{ event_type: 'send', cnt: '10000' }]);

    const { runAnomalyCheckForOrg } = await import('./anomaly-detector.js');
    await runAnomalyCheckForOrg('org-1');

    // insert should NOT have been called (deduped)
    expect(mockDb.insert as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('no alerts when metrics are within normal range', async () => {
    const { redis } = await import('@forgemsg/shared/redis');
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    (mockDb.execute as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { event_type: 'send', cnt: '100' },
        { event_type: 'open', cnt: '25' },
        { event_type: 'click', cnt: '8' },
        { event_type: 'bounce', cnt: '1' },
      ])
      .mockResolvedValueOnce([
        { event_type: 'send', cnt: '100000' },
        { event_type: 'open', cnt: '25000' },
        { event_type: 'click', cnt: '8000' },
        { event_type: 'bounce', cnt: '1000' },
      ]);

    const { runAnomalyCheckForOrg } = await import('./anomaly-detector.js');
    const result = await runAnomalyCheckForOrg('org-1');

    expect(result.alerts).toHaveLength(0);
  });
});
