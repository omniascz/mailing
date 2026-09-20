/**
 * Every door into the `workflows` table refuses the same graphs.
 *
 * Measured before this change, against this database:
 *
 *   POST /workflows/import      a `cascade` node → 201 and stored; REST → 400
 *   POST /workflows/import      `config: null`   → 500 (TypeError in
 *                               remapNodeRefs, which calls Object.entries)
 *   POST /workflows             `config: null`   → 200 and stored
 *   POST /workflows             no config at all  → 200 and stored
 *   POST /workflows/templates/:id/use             no graph check at all
 *
 * The checks now live in lib/workflow-graph.ts and the writers call it:
 * createWorkflow and updateWorkflow (REST, fork, "use"), importWorkflow, and
 * the ticketing seed.
 *
 * The two template routes ship only valid graphs, so a refusal cannot be shown
 * with a real one. Each case below adds one broken entry to the registry array
 * for its own duration and removes it in `finally`.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * A door that refuses everything would pass every refusal here, so each one is
 * followed by a valid graph through the SAME door, which must answer 2xx and
 * leave a row. Every refusal also asserts the table is unchanged.
 *
 * WHAT THIS TEST CANNOT SEE
 * - The sandbox copy (services/sandboxes/index.ts) is deliberately not checked:
 *   it copies rows that passed a door of their own. The case at the end proves
 *   it still copies, not that it would refuse anything.
 * - Edges are not checked by anything, here or in the product.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations, workflows } from '../db/schema/index.js';
import { FLOW_TEMPLATES } from '../services/workflows/flow-templates.js';
import {
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
} from '../services/workflow-templates/registry.js';

const TAG = `wfgraph-${randomUUID().slice(0, 8)}`;

/** Refused by every door: a node type the product does not offer. */
const CASCADE = { id: 'c', type: 'cascade', config: { channel: 'email' } };
/** Refused by every door: the wait shape that fails at runtime (#189). */
const BROKEN_WAIT = { id: 'w', type: 'wait', config: { duration: { days: 1, hours: 0 } } };
const TRIGGER = { id: 't', type: 'trigger', config: {} };
const EMAIL = { id: 'e1', type: 'send_email', config: { subject: 'Ahoj' } };

let app: FastifyInstance;
let session: Session;
const sandboxOrgIds: string[] = [];

const api = async (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => {
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
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(eq(workflows.orgId, session.orgId), eq(workflows.name, name)));

const codeOf = (res: { json: () => unknown }) => (res.json() as { code?: string }).code;

const blob = (name: string, nodes: unknown[]) => ({
  version: '1.0',
  workflow: {
    name: `${TAG} ${name}`,
    description: null,
    triggerType: 'manual',
    triggerConfig: {},
    nodes,
    edges: [],
  },
});

/** A registry entry that exists only while one test runs. */
async function withTemplate<T>(nodes: unknown[], run: (slug: string) => Promise<T>): Promise<T> {
  const slug = `${TAG}-tpl-${nodes.length}`;
  const entry = {
    slug,
    name: 'test-only entry',
    category: 'welcome',
    description: 'test-only entry',
    recommendedFor: [],
    locale: 'en',
    trigger: { type: 'manual', config: {} },
    nodes,
    edges: [],
  } as unknown as WorkflowTemplate;
  WORKFLOW_TEMPLATES.push(entry);
  try {
    return await run(slug);
  } finally {
    WORKFLOW_TEMPLATES.splice(WORKFLOW_TEMPLATES.indexOf(entry), 1);
  }
}

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
  for (const orgId of sandboxOrgIds) {
    await db.delete(workflows).where(eq(workflows.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  await app?.close();
}, 120_000);

describe('POST /api/v1/workflows', () => {
  it('refuses a node with no usable config, then stores the same graph with one', async () => {
    const nullConfig = await api('POST', '/api/v1/workflows', {
      name: `${TAG} rest-null`,
      triggerType: 'manual',
      nodes: [TRIGGER, { id: 'e1', type: 'send_email', config: null }],
      edges: [],
    });
    expect(nullConfig.statusCode, nullConfig.body).toBe(400);
    expect(codeOf(nullConfig)).toBe('INVALID_GRAPH_NODE');
    expect(await rowsNamed(`${TAG} rest-null`)).toEqual([]);

    const noConfig = await api('POST', '/api/v1/workflows', {
      name: `${TAG} rest-missing`,
      triggerType: 'manual',
      nodes: [TRIGGER, { id: 'e1', type: 'send_email' }],
      edges: [],
    });
    expect(noConfig.statusCode, noConfig.body).toBe(400);
    expect(await rowsNamed(`${TAG} rest-missing`)).toEqual([]);

    const good = await api('POST', '/api/v1/workflows', {
      name: `${TAG} rest-ok`,
      triggerType: 'manual',
      nodes: [TRIGGER, EMAIL],
      edges: [{ id: 'a', source: 't', target: 'e1' }],
    });
    expect(good.statusCode, good.body).toBe(200);
    expect(await rowsNamed(`${TAG} rest-ok`)).toHaveLength(1);
  });

  it('PUT refuses the same and leaves the stored graph alone', async () => {
    const created = await api('POST', '/api/v1/workflows', {
      name: `${TAG} put`,
      triggerType: 'manual',
      nodes: [TRIGGER, EMAIL],
      edges: [],
    });
    expect(created.statusCode, created.body).toBe(200);
    const id = (created.json() as { data: { id: string } }).data.id;

    const refused = await api('PUT', `/api/v1/workflows/${id}`, { nodes: [TRIGGER, CASCADE] });
    expect(refused.statusCode, refused.body).toBe(400);
    expect(codeOf(refused)).toBe('NODE_TYPE_NOT_OFFERED');

    const [row] = await db
      .select({ nodes: workflows.nodes })
      .from(workflows)
      .where(eq(workflows.id, id));
    expect((row!.nodes as Array<{ id: string }>).map((n) => n.id)).toEqual(['t', 'e1']);

    // A PUT that does not touch the graph still writes.
    const renamed = await api('PUT', `/api/v1/workflows/${id}`, { name: `${TAG} put renamed` });
    expect(renamed.statusCode, renamed.body).toBe(200);
    expect(await rowsNamed(`${TAG} put renamed`)).toHaveLength(1);
  });
});

describe('POST /api/v1/workflows/import', () => {
  it('refuses a cascade node the REST route refuses, then imports a valid blob', async () => {
    const refused = await api(
      'POST',
      '/api/v1/workflows/import',
      blob('imp-cascade', [TRIGGER, CASCADE]),
    );
    expect(refused.statusCode, refused.body).toBe(400);
    expect(codeOf(refused)).toBe('NODE_TYPE_NOT_OFFERED');
    expect(await rowsNamed(`${TAG} imp-cascade (imported)`)).toEqual([]);

    const ok = await api('POST', '/api/v1/workflows/import', blob('imp-ok', [TRIGGER, EMAIL]));
    expect(ok.statusCode, ok.body).toBe(201);
    expect(await rowsNamed(`${TAG} imp-ok (imported)`)).toHaveLength(1);
  });

  it('answers 400 for a null config instead of 500', async () => {
    const refused = await api(
      'POST',
      '/api/v1/workflows/import',
      blob('imp-null', [TRIGGER, { id: 'e1', type: 'send_email', config: null }]),
    );
    expect(refused.statusCode, refused.body).toBe(400);
    expect(codeOf(refused)).toBe('INVALID_GRAPH_NODE');
    expect(await rowsNamed(`${TAG} imp-null (imported)`)).toEqual([]);

    const ok = await api('POST', '/api/v1/workflows/import', blob('imp-null-ok', [TRIGGER, EMAIL]));
    expect(ok.statusCode, ok.body).toBe(201);
    expect(await rowsNamed(`${TAG} imp-null-ok (imported)`)).toHaveLength(1);
  });
});

describe('POST /api/v1/workflow-templates/:slug/fork', () => {
  it('refuses a template with a broken wait, then forks a shipped one', async () => {
    await withTemplate([TRIGGER, BROKEN_WAIT], async (slug) => {
      const refused = await api('POST', `/api/v1/workflow-templates/${slug}/fork`, {
        name: `${TAG} fork-broken`,
      });
      expect(refused.statusCode, refused.body).toBe(400);
      expect(codeOf(refused)).toBe('INVALID_WAIT_CONFIG');
      expect(await rowsNamed(`${TAG} fork-broken`)).toEqual([]);
    });

    const ok = await api('POST', '/api/v1/workflow-templates/abandoned-cart-3-touch/fork', {
      name: `${TAG} fork-ok`,
    });
    expect(ok.statusCode, ok.body).toBe(201);
    expect(await rowsNamed(`${TAG} fork-ok`)).toHaveLength(1);
  });
});

describe('POST /api/v1/workflows/templates/:templateId/use', () => {
  it('refuses a template with a cascade node, then uses a shipped one', async () => {
    const entry = {
      id: `${TAG}-flow`,
      name: 'test-only entry',
      description: 'test-only entry',
      triggerType: 'manual',
      nodes: [TRIGGER, CASCADE],
      edges: [],
    } as unknown as (typeof FLOW_TEMPLATES)[number];

    FLOW_TEMPLATES.push(entry);
    try {
      const refused = await api('POST', `/api/v1/workflows/templates/${TAG}-flow/use`, {
        name: `${TAG} use-broken`,
      });
      expect(refused.statusCode, refused.body).toBe(400);
      expect(codeOf(refused)).toBe('NODE_TYPE_NOT_OFFERED');
      expect(await rowsNamed(`${TAG} use-broken`)).toEqual([]);
    } finally {
      FLOW_TEMPLATES.splice(FLOW_TEMPLATES.indexOf(entry), 1);
    }

    const ok = await api('POST', '/api/v1/workflows/templates/abandoned-cart/use', {
      name: `${TAG} use-ok`,
    });
    expect(ok.statusCode, ok.body).toBe(201);
    expect(await rowsNamed(`${TAG} use-ok`)).toHaveLength(1);
  });
});

describe('what already worked keeps working', () => {
  it('every shipped template forks or is used without being refused', async () => {
    // The check itself sees all 103 shipped graphs (lib/workflow-graph.test.ts).
    // Here: one of each kind through its own route, end to end.
    for (const slug of ['event-webinar-reminder', 'post-purchase-shipping-update']) {
      const res = await api('POST', `/api/v1/workflow-templates/${slug}/fork`, {
        name: `${TAG} fork ${slug}`,
      });
      expect(res.statusCode, `${slug}: ${res.body}`).toBe(201);
    }
    for (const id of ['welcome-series', 're-engagement']) {
      const res = await api('POST', `/api/v1/workflows/templates/${id}/use`, {
        name: `${TAG} use ${id}`,
      });
      expect(res.statusCode, `${id}: ${res.body}`).toBe(201);
    }
  });

  it('the sandbox copy still copies the parent graph, unchecked by design', async () => {
    const created = await api('POST', '/api/v1/workflows', {
      name: `${TAG} sandbox-source`,
      triggerType: 'manual',
      nodes: [TRIGGER, EMAIL],
      edges: [{ id: 'a', source: 't', target: 'e1' }],
    });
    expect(created.statusCode, created.body).toBe(200);

    const sandbox = await api('POST', '/api/v1/sandboxes', {
      name: `${TAG}-sbx`,
      seedConfig: { copyWorkflows: true, seedContacts: 0 },
    });
    expect(sandbox.statusCode, sandbox.body).toBe(201);
    const sandboxOrgId = (sandbox.json() as { data: { sandboxOrgId?: string; id: string } }).data
      .sandboxOrgId;
    expect(sandboxOrgId, `no sandbox org id in ${sandbox.body}`).toBeTruthy();
    sandboxOrgIds.push(sandboxOrgId!);

    const copied = await db
      .select({ name: workflows.name })
      .from(workflows)
      .where(and(eq(workflows.orgId, sandboxOrgId!), eq(workflows.name, `${TAG} sandbox-source`)));
    expect(copied, 'the sandbox copied no workflow').toHaveLength(1);
  });
});

describe('edges', () => {
  it('refuses an edge to a node that does not exist, then stores the same graph wired up', async () => {
    // Measured before the check: the graph was stored and a contact reaching
    // that step failed the run — "Node ghost not found in workflow", with the
    // run left on the previous node.
    const refused = await api('POST', '/api/v1/workflows', {
      name: `${TAG} edge-ghost`,
      triggerType: 'manual',
      nodes: [TRIGGER, EMAIL],
      edges: [{ id: 'e0', source: 't', target: 'ghost' }],
    });
    expect(refused.statusCode, refused.body).toBe(400);
    expect(codeOf(refused)).toBe('INVALID_GRAPH_EDGE');
    expect(await rowsNamed(`${TAG} edge-ghost`)).toEqual([]);

    const ok = await api('POST', '/api/v1/workflows', {
      name: `${TAG} edge-ok`,
      triggerType: 'manual',
      nodes: [TRIGGER, EMAIL],
      edges: [{ id: 'e0', source: 't', target: 'e1' }],
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(await rowsNamed(`${TAG} edge-ok`)).toHaveLength(1);
  });

  it('refuses two edges out of one node with the same label, and a self-loop', async () => {
    const twice = await api('POST', '/api/v1/workflows', {
      name: `${TAG} edge-dup`,
      triggerType: 'manual',
      nodes: [TRIGGER, EMAIL, { id: 'e2', type: 'send_email', config: { subject: 'B' } }],
      edges: [
        { id: 'a', source: 't', target: 'e1' },
        { id: 'b', source: 't', target: 'e2' },
      ],
    });
    expect(twice.statusCode, twice.body).toBe(400);
    expect(codeOf(twice)).toBe('INVALID_GRAPH_EDGE');
    expect(await rowsNamed(`${TAG} edge-dup`)).toEqual([]);

    const loop = await api('POST', '/api/v1/workflows', {
      name: `${TAG} edge-loop`,
      triggerType: 'manual',
      nodes: [TRIGGER, EMAIL],
      edges: [
        { id: 'a', source: 't', target: 'e1' },
        { id: 'b', source: 'e1', target: 'e1' },
      ],
    });
    expect(loop.statusCode, loop.body).toBe(400);
    expect(await rowsNamed(`${TAG} edge-loop`)).toEqual([]);

    // Labelled branches out of one node are the point of labels, and still pass.
    const branched = await api('POST', '/api/v1/workflows', {
      name: `${TAG} edge-branch`,
      triggerType: 'manual',
      nodes: [
        TRIGGER,
        { id: 'c1', type: 'condition', config: { field: 'email', op: 'is_set' } },
        EMAIL,
        { id: 'e2', type: 'send_email', config: { subject: 'B' } },
      ],
      edges: [
        { id: 'a', source: 't', target: 'c1' },
        { id: 'b', source: 'c1', target: 'e1', label: 'true' },
        { id: 'c', source: 'c1', target: 'e2', label: 'false' },
      ],
    });
    expect(branched.statusCode, branched.body).toBe(200);
    expect(await rowsNamed(`${TAG} edge-branch`)).toHaveLength(1);
  });

  it('PUT that replaces only the nodes cannot orphan the stored edges', async () => {
    const created = await api('POST', '/api/v1/workflows', {
      name: `${TAG} edge-put`,
      triggerType: 'manual',
      nodes: [TRIGGER, EMAIL],
      edges: [{ id: 'e0', source: 't', target: 'e1' }],
    });
    expect(created.statusCode, created.body).toBe(200);
    const id = (created.json() as { data: { id: string } }).data.id;

    // The stored edge points at e1; these nodes no longer have it.
    const refused = await api('PUT', `/api/v1/workflows/${id}`, { nodes: [TRIGGER] });
    expect(refused.statusCode, refused.body).toBe(400);
    expect(codeOf(refused)).toBe('INVALID_GRAPH_EDGE');

    // Sending both halves together is how the editor saves, and it writes.
    const both = await api('PUT', `/api/v1/workflows/${id}`, { nodes: [TRIGGER], edges: [] });
    expect(both.statusCode, both.body).toBe(200);
    const [row] = await db
      .select({ nodes: workflows.nodes, edges: workflows.edges })
      .from(workflows)
      .where(eq(workflows.id, id));
    expect((row!.nodes as Array<{ id: string }>).map((n) => n.id)).toEqual(['t']);
    expect(row!.edges).toEqual([]);
  });
});
