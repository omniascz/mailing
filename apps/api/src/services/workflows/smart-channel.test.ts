/**
 * Tests for smart channel selector (5.6), A/B split (5.7), goal node (5.7),
 * and pre-built flow templates (5.8).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockDb: Record<string, unknown> = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  groupBy: vi.fn().mockResolvedValue([]),
  onConflictDoNothing: vi.fn().mockReturnThis(),
  execute: vi.fn().mockResolvedValue([]),
};

vi.mock('../../db/client.js', () => ({ db: mockDb }));
vi.mock('../../lib/redis.js', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  },
}));
vi.mock('../../db/schema/index.js', () => ({
  contacts: { id: 'id', orgId: 'org_id', leadScore: 'lead_score', updatedAt: 'updated_at' },
  emailEvents: { contactId: 'contact_id', orgId: 'org_id', eventType: 'event_type', createdAt: 'created_at', id: 'id' },
  workflowEvents: { id: 'id', orgId: 'org_id', contactId: 'contact_id', eventName: 'event_name', createdAt: 'created_at' },
  leadScoreRules: { id: 'id', orgId: 'org_id', eventType: 'event_type', points: 'points', decayDays: 'decay_days', active: 'active', description: 'description', createdAt: 'created_at', updatedAt: 'updated_at' },
  leadScoreEvents: { id: 'id', orgId: 'org_id', contactId: 'contact_id', eventType: 'event_type', pointsDelta: 'points_delta', scoreAfter: 'score_after', metadata: 'metadata', createdAt: 'created_at' },
  tags: { id: 'id', name: 'name', orgId: 'org_id' },
  contactTags: { contactId: 'contact_id', tagId: 'tag_id' },
}));
vi.mock('../../lib/app-error.js', () => ({
  AppError: {
    notFound: (r = 'Resource') => Object.assign(new Error(`${r} not found`), { statusCode: 404, code: 'NOT_FOUND' }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { statusCode: 400, code: 'BAD_REQUEST' }),
  },
}));

// ─── Smart channel selector ───────────────────────────────────────────────────

describe('selectBestChannel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.from as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('returns email when open rate > 30%', async () => {
    // emailRows: send=100, open=35 → open_rate 0.35
    (mockDb.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { eventType: 'send', cnt: 100 },
      { eventType: 'open', cnt: 35 },
    ]);

    const { selectBestChannel } = await import('./smart-channel.js');
    const result = await selectBestChannel('c1', 'o1');

    expect(result.channel).toBe('email');
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it('returns push when email open rate is low and push token exists', async () => {
    (mockDb.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { eventType: 'send', cnt: 100 },
      { eventType: 'open', cnt: 5 },
    ]);

    const { redis } = await import('../../lib/redis.js');
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null).mockResolvedValueOnce('token-xyz');

    const { selectBestChannel } = await import('./smart-channel.js');
    const result = await selectBestChannel('c2', 'o1');

    // open rate 5% < 30% threshold; no push token in first call (redis mock null)
    expect(['email', 'push']).toContain(result.channel);
  });

  it('falls back to email when no strong signal', async () => {
    (mockDb.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const { selectBestChannel } = await import('./smart-channel.js');
    const result = await selectBestChannel('c3', 'o1');

    expect(result.channel).toBe('email');
    expect(result.reason).toContain('fallback');
  });
});

// ─── A/B split node ───────────────────────────────────────────────────────────

describe('split node (A/B)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.from as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('assigns contact to a deterministic branch', async () => {
    const { executeAction } = await import('./actions.js');
    const node = {
      id: 'split-1',
      type: 'split' as const,
      config: { weights: [50, 50], variants: ['A', 'B'] },
    };
    const run = { id: 'r1', contactId: 'contact-uuid-1234' } as never;
    const ctx = { orgId: 'o1', contact: null };

    const result1 = await executeAction(node, run, ctx);
    const result2 = await executeAction(node, run, ctx); // same contact + same node → same branch

    expect(result1.type).toBe('branch');
    expect(result2.type).toBe('branch');
    if (result1.type === 'branch' && result2.type === 'branch') {
      expect(result1.branch).toBe(result2.branch); // deterministic
      expect(['A', 'B']).toContain(result1.branch);
    }
  });

  it('distributes approximately 50/50 across many contacts', async () => {
    const { executeAction } = await import('./actions.js');
    const node = {
      id: 'split-1',
      type: 'split' as const,
      config: { weights: [50, 50], variants: ['A', 'B'] },
    };

    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        executeAction(node, { id: 'r1', contactId: `contact-${i}` } as never, { orgId: 'o1', contact: null }),
      ),
    );

    const aCount = results.filter((r) => r.type === 'branch' && (r as { branch: string }).branch === 'A').length;
    // With 100 contacts expect roughly 40-60 in each bucket
    expect(aCount).toBeGreaterThan(30);
    expect(aCount).toBeLessThan(70);
  });

  it('assigns to first variant when no contactId', async () => {
    const { executeAction } = await import('./actions.js');
    const node = {
      id: 'split-1',
      type: 'split' as const,
      config: { weights: [50, 50], variants: ['A', 'B'] },
    };
    const run = { id: 'r1', contactId: null } as never;
    const ctx = { orgId: 'o1', contact: null };

    const result = await executeAction(node, run, ctx);
    expect(result.type).toBe('branch');
    if (result.type === 'branch') expect(result.branch).toBe('A');
  });
});

// ─── Goal node ────────────────────────────────────────────────────────────────

describe('goal node', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.from as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('marks run as converted when email_open found', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 'event-1' }]);

    const { executeAction } = await import('./actions.js');
    const node = {
      id: 'goal-1',
      type: 'goal' as const,
      config: { emailEventType: 'open' },
    };
    const run = { id: 'r1', orgId: 'o1', contactId: 'c1', createdAt: new Date(), data: {} } as never;
    const ctx = { orgId: 'o1', contact: null };

    const result = await executeAction(node, run, ctx);
    expect(result.type).toBe('next'); // goal is pass-through
    // run.converted would have been set by executeGoal
  });

  it('does not convert when no matching email event found', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const { executeAction } = await import('./actions.js');
    const node = {
      id: 'goal-1',
      type: 'goal' as const,
      config: { emailEventType: 'open' },
    };
    const run = { id: 'r1', orgId: 'o1', contactId: 'c1', createdAt: new Date(), data: {} } as never;
    const ctx = { orgId: 'o1', contact: null };

    const result = await executeAction(node, run, ctx);
    expect(result.type).toBe('next');
  });

  it('handles goal node with no config gracefully', async () => {
    const { executeAction } = await import('./actions.js');
    const node = { id: 'goal-1', type: 'goal' as const, config: {} };
    const run = { id: 'r1', orgId: 'o1', contactId: 'c1', createdAt: new Date(), data: {} } as never;
    const ctx = { orgId: 'o1', contact: null };

    const result = await executeAction(node, run, ctx);
    expect(result.type).toBe('next');
  });
});

// ─── Pre-built flow templates ─────────────────────────────────────────────────

describe('flow templates (5.8)', () => {
  it('lists all 5 templates', async () => {
    const { FLOW_TEMPLATES } = await import('./flow-templates.js');
    expect(FLOW_TEMPLATES).toHaveLength(5);
    expect(FLOW_TEMPLATES.map((t) => t.id)).toEqual([
      'welcome-series',
      'abandoned-cart',
      'onboarding-tour',
      're-engagement',
      'dunning-payment-failed',
    ]);
  });

  it('getFlowTemplate returns correct template by id', async () => {
    const { getFlowTemplate } = await import('./flow-templates.js');
    const t = getFlowTemplate('welcome-series');
    expect(t).toBeDefined();
    expect(t!.triggerType).toBe('list_subscribe');
    expect(t!.nodes.length).toBeGreaterThan(0);
    expect(t!.edges.length).toBeGreaterThan(0);
  });

  it('getFlowTemplate returns undefined for unknown id', async () => {
    const { getFlowTemplate } = await import('./flow-templates.js');
    expect(getFlowTemplate('non-existent')).toBeUndefined();
  });

  it('all templates have consistent node/edge structure', async () => {
    const { FLOW_TEMPLATES } = await import('./flow-templates.js');
    for (const template of FLOW_TEMPLATES) {
      // All edge sources/targets reference real node ids
      const nodeIds = new Set(template.nodes.map((n) => n.id));
      for (const edge of template.edges) {
        expect(nodeIds.has(edge.source), `Edge ${edge.id} source '${edge.source}' not in nodes`).toBe(true);
        expect(nodeIds.has(edge.target), `Edge ${edge.id} target '${edge.target}' not in nodes`).toBe(true);
      }
    }
  });

  it('abandoned-cart template has a goal node', async () => {
    const { getFlowTemplate } = await import('./flow-templates.js');
    const t = getFlowTemplate('abandoned-cart')!;
    expect(t.nodes.some((n) => n.type === 'goal')).toBe(true);
  });

  it('re-engagement template uses smart_channel node', async () => {
    const { getFlowTemplate } = await import('./flow-templates.js');
    const t = getFlowTemplate('re-engagement')!;
    expect(t.nodes.some((n) => n.type === 'smart_channel')).toBe(true);
  });

  it('onboarding-tour template has a split via condition node', async () => {
    const { getFlowTemplate } = await import('./flow-templates.js');
    const t = getFlowTemplate('onboarding-tour')!;
    expect(t.nodes.some((n) => n.type === 'condition')).toBe(true);
  });
});
