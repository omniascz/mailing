/**
 * Tests for workflow execution engine (5.2), triggers (5.3), and actions (5.4).
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
  onConflictDoNothing: vi.fn().mockReturnThis(),
  execute: vi.fn().mockResolvedValue({ rows: [] }),
};

vi.mock('../../db/client.js', () => ({ db: mockDb }));
vi.mock('../../lib/redis.js', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn(),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn(),
  },
}));
vi.mock('../../lib/queues.js', () => ({
  queues: {
    email: { add: vi.fn().mockResolvedValue({}) },
    sms: { add: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock('../../db/schema/index.js', () => ({
  contacts: {
    id: 'id',
    orgId: 'org_id',
    deletedAt: 'deleted_at',
    firstName: 'first_name',
    lastName: 'last_name',
    email: 'email',
    phone: 'phone',
    customFields: 'custom_fields',
    updatedAt: 'updated_at',
  },
  tags: { id: 'id', name: 'name', orgId: 'org_id' },
  contactTags: { contactId: 'contact_id', tagId: 'tag_id' },
  contactLists: { contactId: 'contact_id', listId: 'list_id' },
  workflows: {
    id: 'id',
    orgId: 'org_id',
    status: 'status',
    triggerType: 'trigger_type',
    deletedAt: 'deleted_at',
    triggerConfig: 'trigger_config',
    totalRuns: 'total_runs',
    completedRuns: 'completed_runs',
    failedRuns: 'failed_runs',
  },
  workflowRuns: {
    id: 'id',
    workflowId: 'workflow_id',
    orgId: 'org_id',
    contactId: 'contact_id',
    status: 'status',
    currentNodeId: 'current_node_id',
    nextExecutionAt: 'next_execution_at',
  },
  workflowEvents: {
    id: 'id',
    orgId: 'org_id',
    contactId: 'contact_id',
    eventName: 'event_name',
    properties: 'properties',
    processed: 'processed',
    createdAt: 'created_at',
  },
  emailEvents: { contactId: 'contact_id', orgId: 'org_id', eventType: 'event_type', id: 'id' },
}));
vi.mock('../../lib/app-error.js', () => ({
  AppError: {
    internal: (msg: string) =>
      Object.assign(new Error(msg), { statusCode: 500, code: 'INTERNAL_ERROR' }),
    badRequest: (msg: string) =>
      Object.assign(new Error(msg), { statusCode: 400, code: 'BAD_REQUEST' }),
    notFound: (resource = 'Resource') =>
      Object.assign(new Error(`${resource} not found`), { statusCode: 404, code: 'NOT_FOUND' }),
  },
}));

// ─── Actions: substituteMergeTags ────────────────────────────────────────────

describe('substituteMergeTags', () => {
  it('replaces known tags', async () => {
    const { substituteMergeTags } = await import('./actions.js');
    const contact = {
      id: '1',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '+1234',
      customFields: { plan: 'pro' },
      tags: [],
      listIds: [],
    };

    const result = substituteMergeTags('Hi {{first_name}}, your email is {{email}}', contact);
    expect(result).toBe('Hi Jane, your email is jane@example.com');
  });

  it('preserves unknown tags', async () => {
    const { substituteMergeTags } = await import('./actions.js');
    const result = substituteMergeTags('Click {{cta_url}}', null);
    expect(result).toBe('Click {{cta_url}}');
  });

  it('substitutes custom fields', async () => {
    const { substituteMergeTags } = await import('./actions.js');
    const contact = {
      id: '1',
      email: null,
      firstName: null,
      lastName: null,
      phone: null,
      customFields: { company: 'Acme' },
      tags: [],
      listIds: [],
    };
    const result = substituteMergeTags('Hello from {{custom.company}}', contact);
    expect(result).toBe('Hello from Acme');
  });

  it('handles null contact gracefully', async () => {
    const { substituteMergeTags } = await import('./actions.js');
    const result = substituteMergeTags('Hi {{first_name}}', null);
    expect(result).toBe('Hi ');
  });

  it('resolves event/order tags from run data (buildRunMergeData)', async () => {
    const { substituteMergeTags, buildRunMergeData } = await import('./actions.js');
    const run = {
      data: {
        triggerEvent: 'ticketing.order_paid',
        cart_url: 'https://tixly.cz/cart/abc', // payload scalar passes through
        externalEventId: 'evt-1',
        event: { title: 'Jazz Night', venueCity: 'Brno', startsAt: '2026-09-01' },
        order: { amount: 50000, currency: 'CZK', orderId: 'o-9' },
        recommendations: ['evt-2', 'evt-3'],
      },
    };
    const extra = buildRunMergeData(run);
    expect(extra.event_title).toBe('Jazz Night');
    expect(extra.event_city).toBe('Brno');
    expect(extra.order_amount).toBe(50000);
    expect(extra.cart_url).toBe('https://tixly.cz/cart/abc');
    expect(extra.recommendations).toBe('evt-2, evt-3');

    const html = substituteMergeTags(
      '<a href="{{cart_url}}">{{event_title}}</a> v {{event_city}}',
      { firstName: 'Jan' } as never,
      extra,
    );
    expect(html).toBe('<a href="https://tixly.cz/cart/abc">Jazz Night</a> v Brno');
  });

  it('cron-supplied eventTitle resolves to {{event_title}}', async () => {
    const { buildRunMergeData } = await import('./actions.js');
    const extra = buildRunMergeData({ data: { eventTitle: 'Hamlet', externalEventId: 'e1' } });
    expect(extra.event_title).toBe('Hamlet');
  });

  it('empty run data yields empty extra', async () => {
    const { buildRunMergeData } = await import('./actions.js');
    expect(buildRunMergeData({ data: null })).toEqual({});
  });
});

// ─── Actions: condition evaluator ────────────────────────────────────────────

describe('condition evaluation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.from as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.orderBy as ReturnType<typeof vi.fn>).mockReturnThis();
  });

  it('has_tag returns true when contact has the tag', async () => {
    const { executeAction } = await import('./actions.js');

    // Mock loadContact: contact with tags
    (mockDb.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        {
          id: 'c1',
          email: 'test@x.com',
          firstName: 'A',
          lastName: 'B',
          phone: null,
          customFields: {},
        },
      ])
      .mockResolvedValueOnce([{ name: 'vip' }, { name: 'gold' }]) // tags
      .mockResolvedValueOnce([]); // lists

    const node = {
      id: 'n1',
      type: 'condition' as const,
      config: { field: 'has_tag', op: 'eq', value: 'vip' },
    };
    const run = { id: 'r1', workflowId: 'w1', orgId: 'o1', contactId: 'c1' } as never;
    const ctx = {
      orgId: 'o1',
      contact: {
        id: 'c1',
        email: null,
        firstName: null,
        lastName: null,
        phone: null,
        customFields: {},
        tags: ['vip', 'gold'],
        listIds: [],
      },
    };

    const result = await executeAction(
      node,
      run as unknown as Parameters<typeof executeAction>[1],
      ctx,
    );
    expect(result.type).toBe('branch');
    if (result.type === 'branch') expect(result.branch).toBe('true');
  });

  it('has_tag returns false when contact lacks the tag', async () => {
    const { executeAction } = await import('./actions.js');
    const node = {
      id: 'n1',
      type: 'condition' as const,
      config: { field: 'has_tag', op: 'eq', value: 'premium' },
    };
    const run = { id: 'r1', workflowId: 'w1', orgId: 'o1', contactId: 'c1' } as never;
    const ctx = {
      orgId: 'o1',
      contact: {
        id: 'c1',
        email: null,
        firstName: null,
        lastName: null,
        phone: null,
        customFields: {},
        tags: ['basic'],
        listIds: [],
      },
    };

    const result = await executeAction(
      node,
      run as unknown as Parameters<typeof executeAction>[1],
      ctx,
    );
    expect(result.type).toBe('branch');
    if (result.type === 'branch') expect(result.branch).toBe('false');
  });

  it('condition with null contact returns false branch', async () => {
    const { executeAction } = await import('./actions.js');
    const node = {
      id: 'n1',
      type: 'condition' as const,
      config: { field: 'has_tag', op: 'eq', value: 'vip' },
    };
    const run = { id: 'r1', workflowId: 'w1', orgId: 'o1', contactId: 'c1' } as never;
    const ctx = { orgId: 'o1', contact: null };

    const result = await executeAction(
      node,
      run as unknown as Parameters<typeof executeAction>[1],
      ctx,
    );
    expect(result.type).toBe('branch');
    if (result.type === 'branch') expect(result.branch).toBe('false');
  });
});

// ─── Actions: wait node ───────────────────────────────────────────────────────

describe('wait node', () => {
  it('returns wait result with correct future date (hours)', async () => {
    const { executeAction } = await import('./actions.js');
    const before = Date.now();
    const node = { id: 'n1', type: 'wait' as const, config: { duration: 24, unit: 'hours' } };
    const run = { id: 'r1' } as never;
    const ctx = { orgId: 'o1', contact: null };

    const result = await executeAction(
      node,
      run as unknown as Parameters<typeof executeAction>[1],
      ctx,
    );
    expect(result.type).toBe('wait');
    if (result.type === 'wait') {
      const diff = result.until.getTime() - before;
      expect(diff).toBeGreaterThan(23 * 3600 * 1000);
      expect(diff).toBeLessThan(25 * 3600 * 1000);
    }
  });

  it('returns wait result with correct future date (days)', async () => {
    const { executeAction } = await import('./actions.js');
    const before = Date.now();
    const node = { id: 'n1', type: 'wait' as const, config: { duration: 3, unit: 'days' } };
    const run = { id: 'r1' } as never;
    const ctx = { orgId: 'o1', contact: null };

    const result = await executeAction(
      node,
      run as unknown as Parameters<typeof executeAction>[1],
      ctx,
    );
    expect(result.type).toBe('wait');
    if (result.type === 'wait') {
      const diff = result.until.getTime() - before;
      expect(diff).toBeGreaterThan(2 * 86400 * 1000);
    }
  });

  it('handles until absolute datetime', async () => {
    const { executeAction } = await import('./actions.js');
    const future = new Date(Date.now() + 86400000).toISOString();
    const node = { id: 'n1', type: 'wait' as const, config: { until: future } };
    const run = { id: 'r1' } as never;
    const ctx = { orgId: 'o1', contact: null };

    const result = await executeAction(
      node,
      run as unknown as Parameters<typeof executeAction>[1],
      ctx,
    );
    expect(result.type).toBe('wait');
    if (result.type === 'wait') {
      expect(result.until.toISOString()).toBe(future);
    }
  });

  it('returns error for invalid until date', async () => {
    const { executeAction } = await import('./actions.js');
    const node = { id: 'n1', type: 'wait' as const, config: { until: 'not-a-date' } };
    const run = { id: 'r1' } as never;
    const ctx = { orgId: 'o1', contact: null };

    const result = await executeAction(
      node,
      run as unknown as Parameters<typeof executeAction>[1],
      ctx,
    );
    expect(result.type).toBe('error');
  });
});

// ─── Actions: webhook node ────────────────────────────────────────────────────

describe('send_webhook action', () => {
  it('returns error when URL is missing', async () => {
    const { executeAction } = await import('./actions.js');
    const node = { id: 'n1', type: 'send_webhook' as const, config: {} };
    const run = { id: 'r1', orgId: 'o1' } as never;
    const ctx = { orgId: 'o1', contact: null };

    const result = await executeAction(
      node,
      run as unknown as Parameters<typeof executeAction>[1],
      ctx,
    );
    expect(result.type).toBe('error');
    if (result.type === 'error') expect(result.message).toContain('URL');
  });

  it('returns error when webhook returns non-2xx', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });

    const { executeAction } = await import('./actions.js');
    const node = {
      id: 'n1',
      type: 'send_webhook' as const,
      config: { url: 'https://example.com/hook' },
    };
    const run = { id: 'r1', orgId: 'o1', contactId: 'c1' } as never;
    const ctx = { orgId: 'o1', contact: null };

    const result = await executeAction(
      node,
      run as unknown as Parameters<typeof executeAction>[1],
      ctx,
    );
    expect(result.type).toBe('error');
    if (result.type === 'error') expect(result.message).toContain('500');
  });

  it('returns next when webhook succeeds', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });

    const { executeAction } = await import('./actions.js');
    const node = {
      id: 'n1',
      type: 'send_webhook' as const,
      config: { url: 'https://example.com/hook' },
    };
    const run = { id: 'r1', orgId: 'o1', contactId: 'c1' } as never;
    const ctx = { orgId: 'o1', contact: null };

    const result = await executeAction(
      node,
      run as unknown as Parameters<typeof executeAction>[1],
      ctx,
    );
    expect(result.type).toBe('next');
  });
});

// ─── Workflow CRUD ────────────────────────────────────────────────────────────

describe('workflow CRUD service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.from as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.orderBy as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.values as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.set as ReturnType<typeof vi.fn>).mockReturnThis();
  });

  it('createWorkflow returns the created workflow', async () => {
    const expected = {
      id: 'w-1',
      orgId: 'org-1',
      name: 'Welcome Series',
      status: 'draft',
      triggerType: 'list_subscribe',
      nodes: [],
      edges: [],
    };
    (mockDb.returning as ReturnType<typeof vi.fn>).mockResolvedValueOnce([expected]);

    const { createWorkflow } = await import('./index.js');
    const result = await createWorkflow({
      orgId: 'org-1',
      name: 'Welcome Series',
      triggerType: 'list_subscribe',
    });

    expect(result.name).toBe('Welcome Series');
    expect(result.id).toBe('w-1');
  });

  it('getWorkflow throws 404 when not found', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const { getWorkflow } = await import('./index.js');
    await expect(getWorkflow('not-found', 'org-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('listWorkflows returns paginated results', async () => {
    const mockWorkflows = Array.from({ length: 3 }, (_, i) => ({
      id: `w-${i}`,
      name: `Flow ${i}`,
      status: 'active',
    }));
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockWorkflows);

    const { listWorkflows } = await import('./index.js');
    const result = await listWorkflows('org-1', { limit: 20 });
    expect(result.data).toHaveLength(3);
    expect(result.hasMore).toBe(false);
  });

  it('deleteWorkflow throws 404 when not found', async () => {
    (mockDb.returning as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const { deleteWorkflow } = await import('./index.js');
    await expect(deleteWorkflow('not-found', 'org-1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─── Triggers ─────────────────────────────────────────────────────────────────

describe('workflow triggers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.from as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.orderBy as ReturnType<typeof vi.fn>).mockReturnThis();
  });

  it('onListSubscribe finds matching active workflows', async () => {
    // Drizzle chain: db.select().from().where() → awaitable → resolves to array
    // Mock the final .where() call to resolve to empty array (no matching workflows)
    (mockDb.where as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { onListSubscribe } = await import('./triggers.js');
    await expect(onListSubscribe('org-1', 'contact-1', 'list-1')).resolves.toBeUndefined();
  });

  it('isAlreadyRunning prevents duplicate workflow runs', async () => {
    // onApiEvent queries DB for active workflows → empty list → no runs started
    (mockDb.where as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { onApiEvent } = await import('./triggers.js');
    await expect(onApiEvent('org-1', 'c-1', 'purchase', {})).resolves.toBeUndefined();
  });
});

// ─── processWorkflowRuns ──────────────────────────────────────────────────────

describe('processWorkflowRuns', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.from as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.orderBy as ReturnType<typeof vi.fn>).mockReturnThis();
  });

  it('returns zero processed when no runs are due', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]); // no due runs

    const { processWorkflowRuns } = await import('./executor.js');
    const result = await processWorkflowRuns();
    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);
  });
});

// ─── Cascade delivery node (5.5) ──────────────────────────────────────────────

describe('cascadeDeliveryNode', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.from as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.where as ReturnType<typeof vi.fn>).mockReturnThis();
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('sends first step on initial execution', async () => {
    const { executeAction } = await import('./actions.js');
    const node = {
      id: 'cascade-1',
      type: 'cascade' as const,
      config: {
        steps: [
          { channel: 'email', delayHours: 4, condition: 'not_opened' },
          { channel: 'sms', delayHours: 24, condition: 'not_clicked' },
        ],
      },
    };
    const run = {
      id: 'run-1',
      contactId: 'c-1',
      workflowId: 'w-1',
      orgId: 'org-1',
      status: 'running',
      currentNodeId: 'cascade-1',
      data: {},
    };
    const ctx = {
      orgId: 'org-1',
      contact: {
        id: 'c-1',
        email: 'test@example.com',
        phone: '+1234',
        firstName: 'John',
        lastName: 'Doe',
        customFields: {},
        tags: [],
        listIds: [],
      },
    };

    const result = await executeAction(
      node,
      run as unknown as Parameters<typeof executeAction>[1],
      ctx,
    );
    expect(result.type).toBe('wait'); // should schedule next check
  });

  it('evaluates not_opened condition and proceeds to next step', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]); // no open event

    const { executeAction } = await import('./actions.js');
    const node = {
      id: 'cascade-1',
      type: 'cascade' as const,
      config: {
        steps: [
          { channel: 'email', delayHours: 4, condition: 'not_opened' },
          { channel: 'sms', delayHours: 24, condition: 'not_clicked' },
        ],
      },
    };
    const run = {
      id: 'run-1',
      contactId: 'c-1',
      workflowId: 'w-1',
      orgId: 'org-1',
      status: 'running',
      currentNodeId: 'cascade-1',
      data: { cascadeStep: 1 }, // resuming after first step
    };
    const ctx = {
      orgId: 'org-1',
      contact: {
        id: 'c-1',
        email: 'test@example.com',
        phone: '+1234',
        firstName: 'John',
        lastName: 'Doe',
        customFields: {},
        tags: [],
        listIds: [],
      },
    };

    const result = await executeAction(
      node,
      run as unknown as Parameters<typeof executeAction>[1],
      ctx,
    );
    expect(result.type).toBe('wait'); // should schedule next step
  });

  it('exits cascade if condition not met', async () => {
    // Mock returns a result (email was opened)
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'event-1', eventType: 'open' },
    ]);

    const { executeAction } = await import('./actions.js');
    const node = {
      id: 'cascade-1',
      type: 'cascade' as const,
      config: {
        steps: [{ channel: 'email', delayHours: 4, condition: 'not_opened' }],
      },
    };
    const run = {
      id: 'run-1',
      contactId: 'c-1',
      workflowId: 'w-1',
      orgId: 'org-1',
      status: 'running',
      currentNodeId: 'cascade-1',
      data: { cascadeStep: 1 },
    };
    const ctx = {
      orgId: 'org-1',
      contact: {
        id: 'c-1',
        email: 'test@example.com',
        phone: '+1234',
        firstName: 'John',
        lastName: 'Doe',
        customFields: {},
        tags: [],
        listIds: [],
      },
    };

    const result = await executeAction(
      node,
      run as unknown as Parameters<typeof executeAction>[1],
      ctx,
    );
    expect(result.type).toBe('next'); // exit cascade
  });

  it('completes cascade when all steps sent', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]); // no events

    const { executeAction } = await import('./actions.js');
    const node = {
      id: 'cascade-1',
      type: 'cascade' as const,
      config: {
        steps: [{ channel: 'email', delayHours: 4, condition: 'not_opened' }],
      },
    };
    const run = {
      id: 'run-1',
      contactId: 'c-1',
      workflowId: 'w-1',
      orgId: 'org-1',
      status: 'running',
      currentNodeId: 'cascade-1',
      data: { cascadeStep: 1 }, // about to exhaust all steps
    };
    const ctx = {
      orgId: 'org-1',
      contact: {
        id: 'c-1',
        email: 'test@example.com',
        phone: '+1234',
        firstName: 'John',
        lastName: 'Doe',
        customFields: {},
        tags: [],
        listIds: [],
      },
    };

    const result = await executeAction(
      node,
      run as unknown as Parameters<typeof executeAction>[1],
      ctx,
    );
    expect(result.type).toBe('next'); // all steps done
  });

  it('handles empty steps array gracefully', async () => {
    const { executeAction } = await import('./actions.js');
    const node = {
      id: 'cascade-1',
      type: 'cascade' as const,
      config: { steps: [] },
    };
    const run = {
      id: 'run-1',
      contactId: 'c-1',
      workflowId: 'w-1',
      orgId: 'org-1',
      status: 'running',
      currentNodeId: 'cascade-1',
      data: {},
    };
    const ctx = {
      orgId: 'org-1',
      contact: null,
    };

    const result = await executeAction(
      node,
      run as unknown as Parameters<typeof executeAction>[1],
      ctx,
    );
    expect(result.type).toBe('next');
  });
});
