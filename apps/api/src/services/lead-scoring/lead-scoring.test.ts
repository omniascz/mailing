/**
 * Tests for lead scoring engine (task 5.10).
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
  execute: vi.fn().mockResolvedValue([{ new_score: 0 }]),
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
  leadScoreRules: {
    id: 'id',
    orgId: 'org_id',
    eventType: 'event_type',
    points: 'points',
    decayDays: 'decay_days',
    active: 'active',
    description: 'description',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  leadScoreEvents: {
    id: 'id',
    orgId: 'org_id',
    contactId: 'contact_id',
    eventType: 'event_type',
    pointsDelta: 'points_delta',
    scoreAfter: 'score_after',
    metadata: 'metadata',
    createdAt: 'created_at',
  },
  tags: { id: 'id', name: 'name', orgId: 'org_id' },
  contactTags: { contactId: 'contact_id', tagId: 'tag_id' },
}));
vi.mock('../../lib/app-error.js', () => ({
  AppError: {
    notFound: (r = 'Resource') =>
      Object.assign(new Error(`${r} not found`), { statusCode: 404, code: 'NOT_FOUND' }),
  },
}));

// ─── Default rules ────────────────────────────────────────────────────────────

describe('DEFAULT_RULES', () => {
  it('contains expected event types', async () => {
    const { DEFAULT_RULES } = await import('./index.js');
    const types = DEFAULT_RULES.map((r) => r.eventType);
    expect(types).toContain('email_open');
    expect(types).toContain('email_click');
    expect(types).toContain('purchase');
    expect(types).toContain('spam_complaint');
  });

  it('has positive points for positive events', async () => {
    const { DEFAULT_RULES } = await import('./index.js');
    const openRule = DEFAULT_RULES.find((r) => r.eventType === 'email_open');
    expect(openRule!.points).toBeGreaterThan(0);
  });

  it('has negative points for negative events', async () => {
    const { DEFAULT_RULES } = await import('./index.js');
    const spamRule = DEFAULT_RULES.find((r) => r.eventType === 'spam_complaint');
    expect(spamRule!.points).toBeLessThan(0);
  });
});

// ─── seedDefaultRules ─────────────────────────────────────────────────────────

describe('seedDefaultRules', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.from as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.values as ReturnType<typeof vi.fn>).mockReturnThis();
  });

  it('does not insert if rules already exist', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 'existing' }]);

    const { seedDefaultRules } = await import('./index.js');
    await seedDefaultRules('org-1');

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('inserts default rules when none exist', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const { seedDefaultRules } = await import('./index.js');
    await seedDefaultRules('org-1');

    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'email_open', orgId: 'org-1' }),
      ]),
    );
  });
});

// ─── applyLeadScore ───────────────────────────────────────────────────────────

describe('applyLeadScore', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.from as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.values as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.set as ReturnType<typeof vi.fn>).mockReturnThis();
  });

  it('returns null when no rule found for event type', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]); // no rule

    const { applyLeadScore } = await import('./index.js');
    const result = await applyLeadScore('c1', 'o1', 'unknown_event');
    expect(result).toBeNull();
  });

  it('calculates correct scoreAfter adding positive points', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ points: 5, eventType: 'email_click', decayDays: 90, active: true }]) // rule
      .mockResolvedValueOnce([{ id: 'c1', leadScore: 20 }]); // contact

    // Mock update chain to return the updated contact
    (mockDb.set as ReturnType<typeof vi.fn>).mockReturnThis();
    // insert values mock (for leadScoreEvents)
    (mockDb.values as ReturnType<typeof vi.fn>).mockReturnThis();

    const { applyLeadScore } = await import('./index.js');
    const result = await applyLeadScore('c1', 'o1', 'email_click');

    expect(result).not.toBeNull();
    expect(result!.pointsDelta).toBe(5);
    expect(result!.scoreAfter).toBe(25); // 20 + 5
  });

  it('floors score at 0 when negative points applied', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { points: -25, eventType: 'spam_complaint', decayDays: 365, active: true },
      ])
      .mockResolvedValueOnce([{ id: 'c1', leadScore: 10 }]);

    const { applyLeadScore } = await import('./index.js');
    const result = await applyLeadScore('c1', 'o1', 'spam_complaint');

    expect(result!.scoreAfter).toBe(0); // 10 - 25 = -15 → floored to 0
  });

  it('throws 404 when contact not found', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ points: 5, eventType: 'email_open', decayDays: 90, active: true }])
      .mockResolvedValueOnce([]); // contact not found

    const { applyLeadScore } = await import('./index.js');
    await expect(applyLeadScore('missing', 'o1', 'email_open')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ─── CRUD ─────────────────────────────────────────────────────────────────────

describe('listLeadScoreRules', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.from as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.orderBy as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('returns rules ordered by points descending', async () => {
    const mockRules = [
      { id: 'r1', eventType: 'purchase', points: 20 },
      { id: 'r2', eventType: 'email_open', points: 1 },
    ];
    (mockDb.orderBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRules);

    const { listLeadScoreRules } = await import('./index.js');
    const rules = await listLeadScoreRules('org-1');

    expect(rules).toHaveLength(2);
    expect(rules[0]!.eventType).toBe('purchase');
  });
});

describe('createLeadScoreRule', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.values as ReturnType<typeof vi.fn>).mockReturnThis();
  });

  it('creates and returns a new rule', async () => {
    const newRule = {
      id: 'r-new',
      orgId: 'o1',
      eventType: 'demo_booked',
      points: 15,
      decayDays: 90,
      active: true,
    };
    (mockDb.returning as ReturnType<typeof vi.fn>).mockResolvedValueOnce([newRule]);

    const { createLeadScoreRule } = await import('./index.js');
    const rule = await createLeadScoreRule('o1', { eventType: 'demo_booked', points: 15 });

    expect(rule.eventType).toBe('demo_booked');
    expect(rule.points).toBe(15);
  });
});

describe('updateLeadScoreRule', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.set as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();
  });

  it('throws 404 when rule not found', async () => {
    (mockDb.returning as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const { updateLeadScoreRule } = await import('./index.js');
    await expect(updateLeadScoreRule('non-existent', 'o1', { points: 10 })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('returns updated rule', async () => {
    const updated = { id: 'r1', points: 10, active: false };
    (mockDb.returning as ReturnType<typeof vi.fn>).mockResolvedValueOnce([updated]);

    const { updateLeadScoreRule } = await import('./index.js');
    const rule = await updateLeadScoreRule('r1', 'o1', { points: 10, active: false });
    expect(rule.points).toBe(10);
  });
});

describe('deleteLeadScoreRule', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.delete as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();
  });

  it('throws 404 when rule not found', async () => {
    (mockDb.returning as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const { deleteLeadScoreRule } = await import('./index.js');
    await expect(deleteLeadScoreRule('non-existent', 'o1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('resolves without error when rule exists', async () => {
    (mockDb.returning as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 'r1' }]);

    const { deleteLeadScoreRule } = await import('./index.js');
    await expect(deleteLeadScoreRule('r1', 'o1')).resolves.toBeUndefined();
  });
});

// ─── decayScores ─────────────────────────────────────────────────────────────

describe('decayScores', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.from as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.set as ReturnType<typeof vi.fn>).mockReturnThis();
  });

  it('returns zero updated when no contacts have score > 0', async () => {
    (mockDb.where as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]); // no contacts

    const { decayScores } = await import('./index.js');
    const result = await decayScores('org-1');
    expect(result.updated).toBe(0);
  });

  it('updates score when decay changes the value', async () => {
    // Contact with score 20
    (mockDb.where as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 'c1', leadScore: 20 }]);
    // SQL execute returns new_score = 10 (after decay)
    (mockDb.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ new_score: 10 }]);
    // Update chain
    (mockDb.set as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();

    const { decayScores } = await import('./index.js');
    const result = await decayScores('org-1');
    expect(result.updated).toBe(1);
  });
});
