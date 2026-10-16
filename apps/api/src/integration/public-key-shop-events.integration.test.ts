/**
 * A publishable key may not send payment_pending, pickup_ready or
 * order_shipped (Z165).
 *
 * Michal, 15. 10. ~21:30, point 1d (variant a): the publishable key gets 403
 * EVENT_NAME_RESERVED for the three, as for ticketing.* in Z161; only the shop's
 * server sends them (a secret key, the shop's webhook, the ingest). Then the
 * three joined the transactional trigger list — the workers file
 * (apps/workers/src/integration/public-key-shop-events) walks what that does.
 *
 * This file is the route's side, through the real app (buildApp, inject, the
 * real database, real API keys of its own, so its own rate-limit bucket):
 *   - a publishable key × {the three, two other spellings} × {a contact that
 *     exists, a contactId that does not}: 403, one body, no workflow_events
 *     row, no run of a flow listening for the name;
 *   - unchanged: a publishable key with ticketing.order_paid (403 since Z161)
 *     and with order_shipped_late, payment_pending_reminder, checkout_started,
 *     page_viewed; a secret key with the three;
 *   - probe 3: the forks of payment-pending-cs and pickup-invoice-cs, as the
 *     gallery makes them, carry priority 'transactional' on their
 *     informational nodes in the database.
 *
 * Everything measured is printed once as `Z165_API_CELLS_JSON {…}`.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The queues and the workers: the workers file walks those.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  apiKeys,
  contacts,
  templates,
  workflowEvents,
  workflowRuns,
  workflows,
} from '../db/schema/index.js';

const TAG = `z165-${randomUUID().slice(0, 8)}`;

let app: FastifyInstance;
let session: Session;
let publicKey = '';
let secretKey = '';
let contactId = '';
const missingId = randomUUID();
const contactIds: string[] = [];
const workflowIds: string[] = [];
let templatesBefore = new Set<string>();
let orgBefore: Record<string, unknown> = {};
const report: Record<string, unknown> = { tag: TAG, mock: 'none' };

const RESERVED = [
  'payment_pending',
  'pickup_ready',
  'order_shipped',
  'PAYMENT_PENDING',
  'Pickup_Ready',
];
const CONTROLS = [
  'ticketing.order_paid',
  'order_shipped_late',
  'payment_pending_reminder',
  'checkout_started',
  'page_viewed',
];
const LISTENED = [...RESERVED, ...CONTROLS];
const FORBIDDEN_BODY = {
  code: 'EVENT_NAME_RESERVED',
  message: 'A publishable key cannot send this event',
  statusCode: 403,
};

async function newKey(isPublic: boolean): Promise<string> {
  const raw = `${isPublic ? 'fm_pub_' : 'fm_live_'}${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId: session.orgId,
    userId: session.userId,
    name: `${TAG} ${isPublic ? 'public' : 'secret'}`,
    keyHash: createHash('sha256').update(raw).digest('hex'),
    keyPrefix: raw.slice(0, 12),
    scopes: [],
    isPublic,
  });
  return raw;
}

async function call(key: string, method: string, url: string, body?: unknown) {
  const res = await app.inject({
    method: method as 'POST',
    url,
    headers: { 'x-api-key': key },
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  });
  return { status: res.statusCode, body: res.body };
}

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];

/** workflow_events rows of this name for the two contact ids of this file. */
async function eventRows(eventName: string): Promise<number> {
  const r = await db
    .select({ id: workflowEvents.id })
    .from(workflowEvents)
    .where(
      and(
        eq(workflowEvents.orgId, session.orgId),
        eq(workflowEvents.eventName, eventName),
        inArray(workflowEvents.contactId, [contactId, missingId]),
      ),
    );
  return r.length;
}

/** Runs of this file's flows for the two contact ids. */
async function runRows(): Promise<number> {
  const r = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        inArray(workflowRuns.workflowId, workflowIds),
        inArray(workflowRuns.contactId, [contactId, missingId]),
      ),
    );
  return r.length;
}

/** The seed org as a whole: what this file must leave as it found it. */
async function orgState(): Promise<Record<string, unknown>> {
  const [r] = await rows<Record<string, unknown>>(sql`
    SELECT (SELECT count(*)::int FROM workflows WHERE org_id = ${session.orgId}::uuid) AS workflows,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id = ${session.orgId}::uuid) AS runs,
           (SELECT count(*)::int FROM workflow_events WHERE org_id = ${session.orgId}::uuid) AS events,
           (SELECT count(*)::int FROM templates WHERE org_id = ${session.orgId}::uuid) AS templates,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${session.orgId}::uuid) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${session.orgId}::uuid) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${session.orgId}::uuid AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${session.orgId}::uuid) AS api_keys
  `);
  return r!;
}

interface Cell {
  status: number;
  body: string;
  events: number;
  runs: number;
}

/** One POST /api/v1/events; the rows it left once the trigger had time to fire. */
async function fire(key: string, eventName: string, who: string): Promise<Cell> {
  // A run left by an earlier cell must not stop this one from starting.
  await db.delete(workflowRuns).where(inArray(workflowRuns.workflowId, workflowIds));
  const e0 = await eventRows(eventName);
  const r0 = await runRows();
  const res = await call(key, 'POST', '/api/v1/events', {
    contactId: who,
    eventName,
    properties: { order: { number: TAG } },
  });
  // onApiEvent runs after the answer (events.ts does not await it).
  await new Promise((r) => setTimeout(r, 1_500));
  return {
    status: res.status,
    body: res.body
      .split(TAG)
      .join('<TAG>')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<TIME>'),
    events: (await eventRows(eventName)) - e0,
    runs: (await runRows()) - r0,
  };
}

const cells: Record<string, Cell> = {};
const controlCells: Record<string, Cell> = {};
const secretCells: Record<string, Cell> = {};

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  orgBefore = await orgState();
  const tpl = await db
    .select({ id: templates.id })
    .from(templates)
    .where(eq(templates.orgId, session.orgId));
  templatesBefore = new Set(tpl.map((t) => t.id));
  publicKey = await newKey(true);
  secretKey = await newKey(false);
  const [c] = await db
    .insert(contacts)
    .values({ orgId: session.orgId, email: `${TAG}@example.invalid`, status: 'active' })
    .returning({ id: contacts.id });
  contactId = c!.id;
  contactIds.push(contactId);
  // An active flow per name, trigger → a one-day wait: a run is written when
  // the name starts it, and nothing is sent.
  for (const eventName of LISTENED) {
    const [w] = await db
      .insert(workflows)
      .values({
        orgId: session.orgId,
        name: `${TAG} ${eventName}`,
        status: 'active',
        triggerType: 'api_event',
        triggerConfig: { eventName },
        nodes: [
          { id: 't', type: 'trigger', config: { triggerType: 'api_event', eventName } },
          { id: 'w1', type: 'wait', config: { duration: 1, unit: 'days' } },
        ],
        edges: [{ id: 'e0', source: 't', target: 'w1' }],
      })
      .returning({ id: workflows.id });
    workflowIds.push(w!.id);
  }
}, 60_000);

afterAll(async () => {
  if (workflowIds.length) {
    await db.delete(workflowRuns).where(inArray(workflowRuns.workflowId, workflowIds));
    await db.delete(workflows).where(inArray(workflows.id, workflowIds));
  }
  if (contactIds.length) {
    await db.delete(workflowRuns).where(inArray(workflowRuns.contactId, contactIds));
    await db.delete(workflowEvents).where(inArray(workflowEvents.contactId, contactIds));
    await db.delete(contacts).where(inArray(contacts.id, contactIds));
  }
  const tpl = await db
    .select({ id: templates.id })
    .from(templates)
    .where(eq(templates.orgId, session.orgId));
  const madeHere = tpl.map((t) => t.id).filter((id) => !templatesBefore.has(id));
  if (madeHere.length) await db.delete(templates).where(inArray(templates.id, madeHere));
  await db.delete(apiKeys).where(inArray(apiKeys.name, [`${TAG} public`, `${TAG} secret`]));
  const orgAfter = await orgState();
  report.cells = cells;
  report.controls = controlCells;
  report.secret = secretCells;
  report.seedOrg = { before: orgBefore, after: orgAfter };
  console.log(`Z165_API_CELLS_JSON ${JSON.stringify(report)}`);
  await app?.close();
  // The seed org exactly as this file found it.
  expect(orgAfter).toEqual(orgBefore);
}, 60_000);

describe('publishable key and the shop events on POST /api/v1/events (Z165)', () => {
  it.each(RESERVED.flatMap((name) => [[name, 'existing'] as const, [name, 'missing'] as const]))(
    'a publishable key with %s × %s contact → 403 EVENT_NAME_RESERVED, nothing stored, no run',
    async (eventName, who) => {
      const cell = await fire(publicKey, eventName, who === 'existing' ? contactId : missingId);
      cells[`${eventName} × ${who}`] = cell;
      console.log(`[z165] public ${eventName} × ${who}: ${JSON.stringify(cell)}`);
      expect(cell.status, cell.body).toBe(403);
      expect(JSON.parse(cell.body)).toEqual(FORBIDDEN_BODY);
      expect(cell.events).toBe(0);
      expect(cell.runs).toBe(0);
    },
  );

  // Unchanged on master and the branch: the status and the body.
  it.each(CONTROLS.flatMap((name) => [[name, 'existing'] as const, [name, 'missing'] as const]))(
    'unchanged: a publishable key with %s × %s contact',
    async (eventName, who) => {
      const cell = await fire(publicKey, eventName, who === 'existing' ? contactId : missingId);
      controlCells[`${eventName} × ${who}`] = cell;
      console.log(`[z165] public control ${eventName} × ${who}: ${JSON.stringify(cell)}`);
      if (eventName.startsWith('ticketing.')) {
        expect(cell.status, cell.body).toBe(403);
        expect(JSON.parse(cell.body)).toEqual(FORBIDDEN_BODY);
        expect(cell.events).toBe(0);
        expect(cell.runs).toBe(0);
      } else if (who === 'existing') {
        expect(cell.status, cell.body).toBe(200);
        expect(cell.events).toBeGreaterThan(0);
        expect(cell.runs).toBe(1);
      } else {
        expect(cell.status, cell.body).toBe(404);
        expect(JSON.parse(cell.body).code).toBe('NOT_FOUND');
        expect(cell.events).toBe(0);
        expect(cell.runs).toBe(0);
      }
    },
  );

  it.each(['payment_pending', 'pickup_ready', 'order_shipped'])(
    'unchanged: a secret key with %s is accepted and starts the flow',
    async (eventName) => {
      const cell = await fire(secretKey, eventName, contactId);
      secretCells[eventName] = cell;
      console.log(`[z165] secret ${eventName}: ${JSON.stringify(cell)}`);
      expect(cell.status, cell.body).toBe(200);
      expect(cell.events).toBeGreaterThan(0);
      expect(cell.runs).toBe(1);
    },
  );
});

describe('probe 3 — the informational nodes of the forks carry the priority (Z165)', () => {
  it.each([
    ['payment-pending-cs', ['e1']],
    ['pickup-invoice-cs', ['e1', 'e2']],
  ] as const)('a fork of %s has priority transactional on %j', async (slug, informational) => {
    const res = await call(secretKey, 'POST', `/api/v1/workflow-templates/${slug}/fork`, {
      name: `${TAG} ${slug}`,
    });
    expect(res.status, res.body).toBe(201);
    const id = (JSON.parse(res.body) as { data: { id: string } }).data.id;
    workflowIds.push(id);
    const [w] = await db
      .select({
        nodes: workflows.nodes,
        triggerType: workflows.triggerType,
        triggerConfig: workflows.triggerConfig,
      })
      .from(workflows)
      .where(eq(workflows.id, id));
    const nodes = (w!.nodes as { id: string; type: string; config: Record<string, unknown> }[]).map(
      (n) => ({ id: n.id, type: n.type, priority: n.config.priority ?? null }),
    );
    report[`fork ${slug}`] = { trigger: w!.triggerType, triggerConfig: w!.triggerConfig, nodes };
    console.log(`[z165] fork ${slug}: ${JSON.stringify(report[`fork ${slug}`])}`);
    for (const node of nodes) {
      expect(node.priority, `${slug} ${node.id}`).toBe(
        (informational as readonly string[]).includes(node.id) ? 'transactional' : null,
      );
    }
  });
});
