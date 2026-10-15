/**
 * A viewer may not create, change or start a flow (Z164, item 9 of point 1).
 *
 * ─── Why this file exists ────────────────────────────────────────────────────
 *
 * The standing decision: owner, admin and editor may send; a viewer may not;
 * an API key acts with its creator's role (Z129, Z130). The flow routes had
 * requireAuth and nothing else, so a viewer could write a flow — and Z163
 * measured one re-marking a marketing node as transactional through PUT, the
 * mail then reaching an unsubscribed buyer. The routes that create, change,
 * activate or start a flow now take requireRole('editor').
 *
 * ─── What this file measures ─────────────────────────────────────────────────
 *
 * Every such route × {a viewer's API key, the same viewer's session, editor,
 * admin, owner, system_admin}: the HTTP status, the body with ids and times
 * replaced, and the database before and after (the organisation's flows,
 * templates and runs, the target flow's row as JSON, the sandbox
 * organisations). A viewer: 403 and the database byte for byte as it was. The
 * other roles: printed for the master/branch comparison, asserted 2xx.
 * Controls: import (already editor and up), deactivate and the list (left as
 * they are), a publishable key.
 *
 * The viewer's key is made the way a viewer comes to hold one: since Z130 only
 * an admin mints a key, so the user mints it as admin through POST
 * /api/v1/api-keys and is then made a viewer (no route changes a member's role
 * in their own organisation, so that is a row update, as every role user of
 * the integration suites is made). The key then acts as viewer
 * (services/auth/api-key-role.ts). The viewer's session is a real login after
 * that. Real HTTP through buildApp(); every call holds its own credential, so
 * the limiter gives this file buckets of its own.
 *
 * Everything measured is printed once as `Z164_API_CELLS_JSON {…}`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { createTestApp, login, SEED, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  apiKeys,
  contacts,
  organizations,
  templates,
  users,
  workflowRuns,
  workflows,
} from '../db/schema/index.js';
import { orgSandboxes } from '../db/schema/sandboxes.js';

let app: FastifyInstance;
const TAG = `z164-${randomUUID().slice(0, 8)}`;
let startedAt: Date;
let orgId: string;

type Who = 'viewerKey' | 'viewerSession' | 'editor' | 'admin' | 'owner' | 'systemAdmin';
const WHO: Who[] = ['viewerKey', 'viewerSession', 'editor', 'admin', 'owner', 'systemAdmin'];
const VIEWER: Who[] = ['viewerKey', 'viewerSession'];
const headersOf = {} as Record<Who, Record<string, string>>;
let publicKey = '';
const createdUsers: string[] = [];
let contactId = '';
let orgBefore: Record<string, unknown> = {};
let templatesBefore = new Set<string>();
let workflowsBefore = new Set<string>();
let sandboxesBefore = new Set<string>();
const report: Record<string, unknown> = { tag: TAG, mock: 'none' };

const call = async (
  who: Who | Record<string, string>,
  method: string,
  url: string,
  body?: unknown,
) => {
  const res = await app.inject({
    method: method as 'POST',
    url,
    headers: typeof who === 'string' ? headersOf[who] : who,
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  });
  return { status: res.statusCode, body: res.body };
};

/** A body with what differs per run replaced. */
function normalise(body: string): string {
  return body
    .split(TAG)
    .join('<TAG>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<TIME>')
    .replace(/-sbx-[a-z0-9]+/g, '-sbx-<T>');
}

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];

/** What a call may have written: the organisation's flows, templates, runs, sandboxes, the target row. */
async function snapshot(targetId?: string) {
  const [c] = await rows<Record<string, number>>(sql`
    SELECT (SELECT count(*)::int FROM workflows WHERE org_id = ${orgId}::uuid) AS workflows,
           (SELECT count(*)::int FROM templates WHERE org_id = ${orgId}::uuid) AS templates,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id = ${orgId}::uuid) AS runs,
           (SELECT count(*)::int FROM org_sandboxes WHERE org_id = ${orgId}::uuid) AS sandboxes,
           (SELECT count(*)::int FROM organizations) AS organizations
  `);
  let target: string | null = null;
  let targetRuns = 0;
  if (targetId) {
    const [t] = await rows<{ row: string }>(
      sql`SELECT row_to_json(w)::text AS row FROM workflows w WHERE id = ${targetId}::uuid`,
    );
    target = t?.row ?? null;
    const [r] = await rows<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM workflow_runs WHERE workflow_id = ${targetId}::uuid`,
    );
    targetRuns = r!.n;
  }
  return { ...c, target, targetRuns };
}

/** A flow of this file, made by the owner through the API. */
async function ownerFlow(label: string, extra: Record<string, unknown> = {}) {
  const res = await call('owner', 'POST', '/api/v1/workflows', {
    name: `${TAG} ${label}`,
    triggerType: 'manual',
    nodes: [{ id: 't', type: 'trigger', config: {} }],
    edges: [],
    ...extra,
  });
  expect(res.status, res.body).toBe(200);
  return (JSON.parse(res.body) as { data: { id: string } }).data.id;
}

async function activeOwnerFlow(label: string) {
  const id = await ownerFlow(label);
  const a = await call('owner', 'POST', `/api/v1/workflows/${id}/activate`);
  expect(a.status, a.body).toBe(200);
  return id;
}

const MARKED = [
  { id: 't', type: 'trigger', config: {} },
  { id: 'e1', type: 'send_email', config: { subject: 'Ahoj', priority: 'transactional' } },
];

interface Route {
  key: string;
  /** Prepare a target (if any) and return the request. */
  make: (who: Who) => Promise<{ method: string; url: string; body?: unknown; target?: string }>;
}

const ROUTES: Route[] = [
  {
    key: 'POST /api/v1/workflows',
    make: async (who) => ({
      method: 'POST',
      url: '/api/v1/workflows',
      body: {
        name: `${TAG} created by ${who}`,
        triggerType: 'purchase_event',
        nodes: MARKED,
        edges: [{ id: 'x', source: 't', target: 'e1' }],
      },
    }),
  },
  {
    key: 'PUT /api/v1/workflows/:id',
    make: async (who) => {
      const id = await ownerFlow(`put ${who}`, { triggerType: 'purchase_event' });
      return {
        method: 'PUT',
        url: `/api/v1/workflows/${id}`,
        body: { nodes: MARKED, edges: [{ id: 'x', source: 't', target: 'e1' }] },
        target: id,
      };
    },
  },
  {
    key: 'POST /api/v1/workflows/:id/activate',
    make: async (who) => {
      const id = await ownerFlow(`activate ${who}`);
      return { method: 'POST', url: `/api/v1/workflows/${id}/activate`, target: id };
    },
  },
  {
    key: 'POST /api/v1/workflows/:id/trigger',
    make: async (who) => {
      const id = await activeOwnerFlow(`trigger ${who}`);
      return {
        method: 'POST',
        url: `/api/v1/workflows/${id}/trigger`,
        body: { contactId },
        target: id,
      };
    },
  },
  {
    key: 'POST /api/v1/workflows/templates/:templateId/use',
    make: async (who) => ({
      method: 'POST',
      url: '/api/v1/workflows/templates/abandoned-cart/use',
      body: { name: `${TAG} use by ${who}` },
    }),
  },
  {
    key: 'POST /api/v1/workflow-templates/:slug/fork',
    make: async (who) => ({
      method: 'POST',
      url: '/api/v1/workflow-templates/abandoned-cart-3-touch/fork',
      body: { name: `${TAG} fork by ${who}` },
    }),
  },
  {
    key: 'POST /api/v1/ticketing/seed-workflows',
    make: async () => ({ method: 'POST', url: '/api/v1/ticketing/seed-workflows', body: {} }),
  },
  {
    key: 'POST /api/v1/sandboxes',
    make: async (who) => ({
      method: 'POST',
      url: '/api/v1/sandboxes',
      body: { name: `${TAG} ${who}`, seedConfig: { copyWorkflows: true } },
    }),
  },
];

/** What a cell left behind that the file found absent: sandboxes, flows and their runs, e-mail copies. */
async function undoCell() {
  const sbx = await db
    .select({ id: orgSandboxes.sandboxOrgId })
    .from(orgSandboxes)
    .where(eq(orgSandboxes.orgId, orgId));
  for (const s of sbx) {
    if (sandboxesBefore.has(s.id)) continue;
    await db.delete(workflows).where(eq(workflows.orgId, s.id));
    await db.delete(organizations).where(eq(organizations.id, s.id));
  }
  const wf = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(eq(workflows.orgId, orgId));
  const madeWf = wf.map((w) => w.id).filter((id) => !workflowsBefore.has(id));
  if (madeWf.length) {
    await db.delete(workflowRuns).where(inArray(workflowRuns.workflowId, madeWf));
    await db.delete(workflows).where(inArray(workflows.id, madeWf));
  }
  const tpl = await db
    .select({ id: templates.id })
    .from(templates)
    .where(eq(templates.orgId, orgId));
  const madeTpl = tpl.map((t) => t.id).filter((id) => !templatesBefore.has(id));
  if (madeTpl.length) await db.delete(templates).where(inArray(templates.id, madeTpl));
}

/** The seed org as a whole: what this file must leave as it found it. */
async function orgState() {
  const [r] = await rows<Record<string, unknown>>(sql`
    SELECT (SELECT count(*)::int FROM workflows WHERE org_id = ${orgId}::uuid) AS workflows,
           (SELECT count(*)::int FROM workflows WHERE org_id = ${orgId}::uuid AND status = 'active') AS active_workflows,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id = ${orgId}::uuid) AS workflow_runs,
           (SELECT count(*)::int FROM templates WHERE org_id = ${orgId}::uuid) AS templates,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${orgId}::uuid) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${orgId}::uuid) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${orgId}::uuid AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM users WHERE org_id = ${orgId}::uuid) AS users,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${orgId}::uuid) AS api_keys,
           (SELECT count(*)::int FROM org_sandboxes WHERE org_id = ${orgId}::uuid) AS sandboxes,
           (SELECT count(*)::int FROM organizations) AS organizations,
           (SELECT count(*)::int FROM email_events WHERE org_id = ${orgId}::uuid) AS email_events
  `);
  return r!;
}

async function roleUser(role: string): Promise<{ id: string; email: string }> {
  const [seed] = await db
    .select({ hash: users.passwordHash })
    .from(users)
    .where(eq(users.email, SEED.email));
  const email = `${TAG}-${role.replace('_', '')}@test.local`;
  const [u] = await db
    .insert(users)
    .values({
      orgId,
      email,
      name: `${TAG} ${role}`,
      passwordHash: seed!.hash,
      role: role as 'viewer',
      emailVerified: true,
    })
    .returning({ id: users.id });
  createdUsers.push(u!.id);
  return { id: u!.id, email };
}

const cookieOf = (s: Session) => ({ cookie: s.cookie });

beforeAll(async () => {
  startedAt = new Date();
  app = await createTestApp();
  await app.ready();
  const owner = await login(app);
  orgId = owner.orgId;
  orgBefore = await orgState();
  templatesBefore = new Set(
    (await rows<{ id: string }>(sql`SELECT id FROM templates WHERE org_id = ${orgId}::uuid`)).map(
      (t) => t.id,
    ),
  );
  workflowsBefore = new Set(
    (await rows<{ id: string }>(sql`SELECT id FROM workflows WHERE org_id = ${orgId}::uuid`)).map(
      (t) => t.id,
    ),
  );
  sandboxesBefore = new Set(
    (
      await rows<{ id: string }>(
        sql`SELECT sandbox_org_id AS id FROM org_sandboxes WHERE org_id = ${orgId}::uuid`,
      )
    ).map((t) => t.id),
  );
  headersOf.owner = cookieOf(owner);
  for (const role of ['admin', 'editor', 'system_admin'] as const) {
    const u = await roleUser(role);
    headersOf[role === 'system_admin' ? 'systemAdmin' : role] = cookieOf(await login(app, u.email));
  }

  // The viewer: a key minted while an admin, then the member made a viewer.
  const v = await roleUser('admin');
  const asAdmin = await login(app, v.email);
  const minted = await app.inject({
    method: 'POST',
    url: '/api/v1/api-keys',
    headers: cookieOf(asAdmin),
    payload: { name: `${TAG} viewer key` },
  });
  expect(minted.statusCode, minted.body).toBe(201);
  const rawViewerKey = (minted.json() as { data: { rawKey: string } }).data.rawKey;
  await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: cookieOf(asAdmin) });
  await db.update(users).set({ role: 'viewer' }).where(eq(users.id, v.id));
  headersOf.viewerKey = { 'x-api-key': rawViewerKey };
  headersOf.viewerSession = cookieOf(await login(app, v.email));

  const pub = await app.inject({
    method: 'POST',
    url: '/api/v1/api-keys',
    headers: headersOf.owner,
    payload: { name: `${TAG} public`, isPublic: true },
  });
  expect(pub.statusCode, pub.body).toBe(201);
  publicKey = (pub.json() as { data: { rawKey: string } }).data.rawKey;

  const [c] = await db
    .insert(contacts)
    .values({ orgId, email: `${TAG}-contact@test.local`, firstName: 'Z', status: 'active' })
    .returning({ id: contacts.id });
  contactId = c!.id;

  // Who each credential is, as the API sees it.
  const me: Record<string, string> = {};
  for (const who of WHO) {
    const r = await call(who, 'GET', '/api/v1/workflows?limit=1');
    me[who] = String(r.status);
  }
  const [keyRow] = await db
    .select({ role: apiKeys.role })
    .from(apiKeys)
    .where(eq(apiKeys.name, `${TAG} viewer key`));
  report.credentials = { listStatus: me, viewerKeyStoredRole: keyRow?.role };
}, 120_000);

afterAll(async () => {
  await undoCell();
  if (contactId) {
    await db.execute(sql`DELETE FROM workflow_runs WHERE contact_id = ${contactId}::uuid`);
    await db.delete(contacts).where(eq(contacts.id, contactId));
  }
  if (createdUsers.length) {
    await db.delete(apiKeys).where(inArray(apiKeys.userId, createdUsers));
    await db.delete(users).where(inArray(users.id, createdUsers));
  }
  await db.delete(apiKeys).where(and(eq(apiKeys.orgId, orgId), eq(apiKeys.name, `${TAG} public`)));
  await db.execute(
    sql`DELETE FROM audit_logs WHERE org_id = ${orgId}::uuid AND created_at >= ${startedAt.toISOString()}::timestamptz`,
  );
  const orgAfter = await orgState();
  report.seedOrg = { before: orgBefore, after: orgAfter };
  console.log(`Z164_API_CELLS_JSON ${JSON.stringify(report)}`);
  await app?.close();
  // The seed org exactly as this file found it.
  expect(orgAfter).toEqual(orgBefore);
}, 120_000);

const matrix: Record<string, Record<string, unknown>> = {};
report.matrix = matrix;

describe('role × route: a viewer may not create, change, activate or start a flow (Z164)', () => {
  for (const route of ROUTES) {
    for (const who of WHO) {
      it(`${route.key} — ${who}`, async () => {
        const req = await route.make(who);
        const before = await snapshot(req.target);
        const res = await call(who, req.method, req.url, req.body);
        const after = await snapshot(req.target);
        const unchanged = JSON.stringify(after) === JSON.stringify(before);
        const changed = Object.keys(before).filter(
          (k) =>
            JSON.stringify((before as Record<string, unknown>)[k]) !==
            JSON.stringify((after as Record<string, unknown>)[k]),
        );
        const cell = {
          status: res.status,
          body: normalise(res.body).slice(0, 4000),
          dbUnchanged: unchanged,
          changed: Object.fromEntries(
            changed.map((k) => [
              k,
              k === 'target'
                ? 'row differs'
                : `${(before as Record<string, unknown>)[k]} → ${(after as Record<string, unknown>)[k]}`,
            ]),
          ),
        };
        (matrix[route.key] ??= {})[who] = cell;
        console.log(`[z164] ${route.key} ${who}: ${res.status} db=${JSON.stringify(cell.changed)}`);
        await undoCell();
        if (VIEWER.includes(who)) {
          expect(res.status, res.body.slice(0, 300)).toBe(403);
          expect(JSON.parse(res.body)).toMatchObject({
            code: 'FORBIDDEN',
            message: 'Requires one of: editor',
          });
          expect(after, 'a refused call writes nothing').toEqual(before);
        } else {
          expect(res.status, res.body.slice(0, 300)).toBeGreaterThanOrEqual(200);
          expect(res.status, res.body.slice(0, 300)).toBeLessThan(300);
        }
      });
    }
  }
});

describe('controls: what Z164 leaves as it was', () => {
  const blob = (who: string) => ({
    version: '1.0',
    workflow: {
      name: `${TAG} import by ${who}`,
      description: null,
      triggerType: 'manual',
      triggerConfig: {},
      nodes: [{ id: 't', type: 'trigger', config: {} }],
      edges: [],
    },
  });

  it('import (workflow-export, editor and up already): viewer 403, editor 2xx', async () => {
    const out: Record<string, unknown> = {};
    for (const who of ['viewerKey', 'viewerSession', 'editor'] as Who[]) {
      const before = await snapshot();
      const r = await call(who, 'POST', '/api/v1/workflows/import', blob(who));
      const after = await snapshot();
      out[who] = {
        status: r.status,
        body: normalise(r.body).slice(0, 600),
        dbUnchanged: JSON.stringify(after) === JSON.stringify(before),
      };
      await undoCell();
      if (who === 'editor') expect(r.status, r.body).toBeLessThan(300);
      else {
        expect(r.status, r.body).toBe(403);
        expect(after).toEqual(before);
      }
    }
    report.import = out;
  });

  it('deactivate, cancel and the list stay open to a viewer (not part of Z164)', async () => {
    const id = await activeOwnerFlow('deactivate');
    const list = await call('viewerKey', 'GET', '/api/v1/workflows?limit=1');
    const get = await call('viewerSession', 'GET', `/api/v1/workflows/${id}`);
    const deactivate = await call('viewerKey', 'POST', `/api/v1/workflows/${id}/deactivate`);
    report.viewerUnchanged = {
      list: list.status,
      get: get.status,
      deactivate: deactivate.status,
      statusAfter: (
        await rows<{ s: string }>(sql`SELECT status AS s FROM workflows WHERE id = ${id}::uuid`)
      )[0]?.s,
    };
    await undoCell();
    expect([list.status, get.status, deactivate.status]).toEqual([200, 200, 200]);
  });

  it('a publishable key on POST /workflows is refused, before and after', async () => {
    const before = await snapshot();
    const r = await call({ 'x-api-key': publicKey }, 'POST', '/api/v1/workflows', {
      name: `${TAG} by a public key`,
    });
    const after = await snapshot();
    report.publicKey = { status: r.status, body: normalise(r.body) };
    await undoCell();
    expect(r.status, r.body).toBe(403);
    expect(after).toEqual(before);
  });
});
