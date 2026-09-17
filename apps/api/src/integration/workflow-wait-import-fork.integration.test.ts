/**
 * Import and template fork refuse a wait the executor cannot time, the way
 * POST and PUT /api/v1/workflows have since #189.
 *
 * Both write through their own services — importWorkflow
 * (services/workflows/export.ts) inserts the blob's nodes directly, forkTemplate
 * (services/workflow-templates/index.ts) calls createWorkflow — so neither went
 * through the route-level check. Measured before this change: an import blob
 * with `{ duration: { days: 1, hours: 0 } }` answered 201 and stored it, and a
 * run on that step fails with "Invalid time value".
 *
 * Every template this repo ships passes the check (lib/workflow-wait-config
 * .test.ts asserts all of them), so the fork refusal cannot be shown with a
 * real template. The case below adds one broken entry to the registry array
 * for its own duration and removes it after.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * Every refusal is followed by the same door with a valid graph, which must
 * write a row — a service refusing everything fails there.
 *
 * WHAT THIS TEST CANNOT SEE
 * - Import drops a workflow's edges (export writes `edges: []`, import inserts
 *   none). That is a separate defect and is not asserted here.
 * - POST /api/v1/workflows/templates/:templateId/use (FLOW_TEMPLATES) is a
 *   third way in and is not covered by this change.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { workflows } from '../db/schema/index.js';
import {
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
} from '../services/workflow-templates/registry.js';

const TAG = `wfimp-${randomUUID().slice(0, 8)}`;
const BROKEN = { duration: { days: 1, hours: 0 } };

let app: FastifyInstance;
let session: Session;

const api = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
  const res = await app.inject({
    method,
    url,
    headers: { cookie: session.cookie },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
  return { statusCode: res.statusCode, body: res.body, json: () => res.json() };
};

const rowsNamed = (name: string) =>
  db
    .select({ id: workflows.id, nodes: workflows.nodes })
    .from(workflows)
    .where(and(eq(workflows.orgId, session.orgId), eq(workflows.name, name)));

const blob = (name: string, waitConfig: unknown) => ({
  version: '1.0',
  workflow: {
    name: `${TAG} ${name}`,
    description: null,
    triggerType: 'manual',
    triggerConfig: {},
    nodes: [
      { id: 't', type: 'trigger', config: {} },
      { id: 'w1', type: 'wait', config: waitConfig },
      { id: 'e1', type: 'send_email', config: { subject: 'Ahoj' } },
    ],
    edges: [],
  },
});

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
}, 120_000);

afterAll(async () => {
  const ids = (
    await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(and(eq(workflows.orgId, session.orgId), like(workflows.name, `${TAG}%`)))
  ).map((r) => r.id);
  if (ids.length) await db.delete(workflows).where(inArray(workflows.id, ids));
  await app?.close();
}, 120_000);

describe('import', () => {
  it('refuses a broken wait and stores nothing; the same blob with a timed wait is stored', async () => {
    const refused = await api('POST', '/api/v1/workflows/import', blob('broken', BROKEN));
    expect(refused.statusCode, refused.body).toBe(400);
    expect((refused.json() as { code: string }).code).toBe('INVALID_WAIT_CONFIG');
    expect(await rowsNamed(`${TAG} broken (imported)`), 'a refused import was written').toEqual([]);

    const stored = await api(
      'POST',
      '/api/v1/workflows/import',
      blob('timed', { duration: 1, unit: 'days' }),
    );
    expect(stored.statusCode, stored.body).toBe(201);
    const rows = await rowsNamed(`${TAG} timed (imported)`);
    expect(rows).toHaveLength(1);
    const wait = (rows[0]!.nodes as Array<{ type: string; config: unknown }>).find(
      (n) => n.type === 'wait',
    );
    expect(wait?.config).toEqual({ duration: 1, unit: 'days' });
  });

  it('accepts an until wait', async () => {
    const res = await api(
      'POST',
      '/api/v1/workflows/import',
      blob('until', { until: { field: 'event.starts_at', offsetHours: -24 } }),
    );
    expect(res.statusCode, res.body).toBe(201);
    expect(await rowsNamed(`${TAG} until (imported)`)).toHaveLength(1);
  });
});

describe('template fork', () => {
  it('refuses a template with a broken wait; a shipped template still forks', async () => {
    const slug = `${TAG}-broken`;
    const broken = {
      slug,
      name: 'broken',
      category: 'welcome',
      description: 'test-only entry',
      recommendedFor: [],
      locale: 'en',
      trigger: { type: 'manual', config: {} },
      nodes: [
        { id: 't', type: 'trigger', config: {} },
        { id: 'w1', type: 'wait', config: BROKEN },
      ],
      edges: [{ id: 'e', source: 't', target: 'w1' }],
    } as unknown as WorkflowTemplate;

    WORKFLOW_TEMPLATES.push(broken);
    try {
      const refused = await api('POST', `/api/v1/workflow-templates/${slug}/fork`, {
        name: `${TAG} fork broken`,
      });
      expect(refused.statusCode, refused.body).toBe(400);
      expect((refused.json() as { code: string }).code).toBe('INVALID_WAIT_CONFIG');
      expect(await rowsNamed(`${TAG} fork broken`), 'a refused fork was written').toEqual([]);
    } finally {
      WORKFLOW_TEMPLATES.splice(WORKFLOW_TEMPLATES.indexOf(broken), 1);
    }

    const ok = await api('POST', '/api/v1/workflow-templates/abandoned-cart-3-touch/fork', {
      name: `${TAG} fork ok`,
    });
    expect(ok.statusCode, ok.body).toBe(201);
    expect(await rowsNamed(`${TAG} fork ok`)).toHaveLength(1);
  });

  it('templates with until waits still fork', async () => {
    const withUntil = WORKFLOW_TEMPLATES.filter((t) =>
      t.nodes.some((n) => n.type === 'wait' && (n.config as { until?: unknown }).until),
    );
    expect(withUntil.map((t) => t.slug).sort()).toEqual(
      ['event-in-person-prep', 'event-webinar-reminder', 'post-purchase-shipping-update'].sort(),
    );
    for (const t of withUntil) {
      const res = await api('POST', `/api/v1/workflow-templates/${t.slug}/fork`, {
        name: `${TAG} fork ${t.slug}`,
      });
      expect(res.statusCode, `${t.slug}: ${res.body}`).toBe(201);
      expect(await rowsNamed(`${TAG} fork ${t.slug}`)).toHaveLength(1);
    }
  });
});
