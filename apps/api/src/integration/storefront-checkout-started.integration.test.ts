/**
 * A shop page reports its own basket, and the abandoned-cart recipe runs.
 *
 * Shoptet delivers no cart webhook — its webhook code list has orders,
 * customers, products and stock, and nothing about a basket — and its
 * abandoned-cart export carries neither a cart identifier nor a recovery URL,
 * so a poller could neither deduplicate nor link back (probe Z75). What Shoptet
 * does allow is a script: HTML codes can be inserted from the e-shop
 * administration, and the dataLayer exposes the basket on the cart page.
 *
 * So POST /api/v1/checkout-started takes what the page knows — an address and
 * the basket — and calls the same onCheckoutStarted the Shopify connector
 * calls, which is what the recipes have listened for since #204.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "The endpoint answered 202" is not the claim. Each case asserts over the RUN:
 * that it reached the email step (node statistics), and that the queued job
 * carries the basket's own values. The duplicate case asserts the number of
 * runs did not grow — not that the second call answered differently — because
 * an endpoint can report "duplicate" and enrol anyway.
 *
 * WHAT THIS TEST CANNOT SEE
 * - It does not run a browser or Shoptet's dataLayer; it posts what the
 *   documented script would post.
 * - It does not wait out the recipe's real delays: the graph is trimmed to the
 *   trigger and its first email, as the merge-data suite does.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { and, eq, inArray, like } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts, workflows, workflowRuns, workflowEvents, apiKeys } from '../db/schema/index.js';
import { workflowNodeStats } from '../db/schema/workflow-node-stats.js';

type Node = { id: string; type: string; config: Record<string, unknown> };

const TAG = `z76-${randomUUID().slice(0, 8)}`;
const SHOPPER = `${TAG}-shopper@example.invalid`;
const BUYER = `${TAG}-buyer@example.invalid`;

let app: FastifyInstance;
let session: Session;
let publicKey: string;
let workflowId: string;
let emailNodeId: string;
const created: string[] = [];

const api = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
  const res = await app.inject({
    method,
    url,
    headers: { cookie: session.cookie },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
  return { statusCode: res.statusCode, body: res.body, json: () => res.json() };
};

/** What the documented script posts, with the shop's publishable key. */
const report = async (body: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/checkout-started',
    headers: { 'x-api-key': publicKey },
    // A distinct address per call: the route's own limit is keyed on key + ip.
    remoteAddress: `198.51.100.${Math.floor(Math.random() * 254) + 1}`,
    payload: body,
  });

async function emailJobIds(): Promise<Set<string>> {
  const { emailQueue } = await import('../lib/queues.js');
  const jobs = await emailQueue.getJobs(['waiting', 'delayed', 'active', 'completed'], 0, 500);
  return new Set(jobs.map((j) => String(j?.id)));
}

async function emailJobsAddedSince(before: Set<string>) {
  const { emailQueue } = await import('../lib/queues.js');
  const jobs = await emailQueue.getJobs(['waiting', 'delayed', 'active', 'completed'], 0, 500);
  return jobs
    .filter((j) => j && !before.has(String(j.id)))
    .map((j) => j.data as Record<string, unknown>);
}

const runCount = async () =>
  (
    await db
      .select({ id: workflowRuns.id })
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, workflowId))
  ).length;

const entered = async (nodeId: string) => {
  const [stat] = await db
    .select({ entered: workflowNodeStats.entered })
    .from(workflowNodeStats)
    .where(and(eq(workflowNodeStats.workflowId, workflowId), eq(workflowNodeStats.nodeId, nodeId)));
  return stat?.entered ?? 0;
};

const contactByEmail = async (email: string) =>
  (
    await db
      .select({ id: contacts.id, status: contacts.status })
      .from(contacts)
      .where(and(eq(contacts.orgId, session.orgId), eq(contacts.email, email)))
      .limit(1)
  )[0];

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);

  // The key a shop pastes into its template: publishable, visible in the page.
  publicKey = `fm_pub_${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId: session.orgId,
    name: `storefront ${TAG}`,
    keyHash: createHash('sha256').update(publicKey).digest('hex'),
    keyPrefix: publicKey.slice(0, 12),
    scopes: [],
    isPublic: true,
  });

  // The recipe, trimmed to trigger + first email so the run sends instead of
  // parking on the wait that makes it an abandonment.
  const fork = await api('POST', '/api/v1/workflow-templates/abandoned-cart-cs/fork', {
    name: `${TAG} cart`,
  });
  expect(fork.statusCode, fork.body).toBe(201);
  workflowId = (fork.json() as { data: { id: string } }).data.id;
  created.push(workflowId);

  const [row] = await db
    .select({ nodes: workflows.nodes })
    .from(workflows)
    .where(eq(workflows.id, workflowId));
  const nodes = row!.nodes as Node[];
  const trigger = nodes.find((n) => n.type === 'trigger')!;
  const email = nodes.find((n) => n.type === 'send_email')!;
  emailNodeId = email.id;
  await db
    .update(workflows)
    .set({
      nodes: [trigger, email] as never,
      edges: [{ id: 'e0', source: trigger.id, target: email.id }] as never,
      status: 'active',
    })
    .where(eq(workflows.id, workflowId));
}, 120_000);

afterAll(async () => {
  const ids = (
    await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(and(eq(workflows.orgId, session.orgId), like(workflows.name, `${TAG}%`)))
  ).map((r) => r.id);
  const all = [...new Set([...ids, ...created])];
  if (all.length) {
    await db.delete(workflowRuns).where(inArray(workflowRuns.workflowId, all));
    await db.delete(workflowNodeStats).where(inArray(workflowNodeStats.workflowId, all));
    await db.delete(workflows).where(inArray(workflows.id, all));
  }
  const mine = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, session.orgId), like(contacts.email, `${TAG}%`)));
  if (mine.length) {
    const cids = mine.map((c) => c.id);
    await db.delete(workflowEvents).where(inArray(workflowEvents.contactId, cids));
    await db.delete(contacts).where(inArray(contacts.id, cids));
  }
  await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.orgId, session.orgId), like(apiKeys.name, `storefront ${TAG}`)));
  await app?.close();
}, 120_000);

describe('the page reports a basket', () => {
  it('starts the recipe, and the mail carries the basket', async () => {
    const before = await emailJobIds();

    const res = await report({
      email: SHOPPER,
      cartId: 'kosik-1',
      amount: 1299,
      currency: 'CZK',
      itemCount: 3,
      recoveryUrl: 'https://obchod.example.cz/kosik',
    });

    expect(res.statusCode, res.body).toBe(202);
    expect(res.json()).toMatchObject({ data: { started: true } });

    // The shopper exists, and reaching a checkout did not make them a
    // marketing recipient.
    const shopper = await contactByEmail(SHOPPER);
    expect(shopper, 'no contact was created for the address').toBeTruthy();
    expect(shopper!.status).toBe('non_subscribed');

    expect(await entered(emailNodeId), 'the run never reached the email step').toBe(1);

    const jobs = await emailJobsAddedSince(before);
    const mine = jobs.filter((j) => j.contactId === shopper!.id);
    expect(mine.length, 'nothing reached the email queue').toBe(1);

    // The values the page sent travelled with it (#197 carries run data to the
    // template path), including where to send the shopper back to.
    const merge = JSON.stringify(mine[0]!.mergeData ?? {});
    expect(merge).toContain('1299');
    expect(merge).toContain('https://obchod.example.cz/kosik');
  });

  it('a second load of the same page does not enrol again', async () => {
    const runsBefore = await runCount();

    const res = await report({ email: SHOPPER, cartId: 'kosik-1', itemCount: 3 });

    expect(res.statusCode, res.body).toBe(202);
    expect(res.json()).toMatchObject({ data: { started: false, reason: 'duplicate' } });
    // The claim is about runs, not about what the endpoint said: a route can
    // answer "duplicate" and enrol anyway.
    expect(await runCount(), 'the second report started another run').toBe(runsBefore);
  });
});

describe('what must not happen', () => {
  it('a shopper who bought is not reminded', async () => {
    // A SECOND fork, with its wait kept: the suppression only counts a
    // conversion that happened after the run started, so the run has to park
    // first and the purchase has to land while it waits. That is also the real
    // sequence — report, wait, buy, and only then the send that must not come.
    const fork = await api('POST', '/api/v1/workflow-templates/abandoned-cart-cs/fork', {
      name: `${TAG} suppress`,
    });
    expect(fork.statusCode, fork.body).toBe(201);
    const suppressId = (fork.json() as { data: { id: string } }).data.id;
    created.push(suppressId);

    const [row] = await db
      .select({ nodes: workflows.nodes })
      .from(workflows)
      .where(eq(workflows.id, suppressId));
    const nodes = row!.nodes as Node[];
    const trigger = nodes.find((n) => n.type === 'trigger')!;
    const wait = nodes.find((n) => n.type === 'wait')!;
    const email = nodes.find((n) => n.type === 'send_email')!;
    await db
      .update(workflows)
      .set({
        nodes: [trigger, wait, email] as never,
        edges: [
          { id: 'e0', source: trigger.id, target: wait.id },
          { id: 'e1', source: wait.id, target: email.id },
        ] as never,
        status: 'active',
      })
      .where(eq(workflows.id, suppressId));

    const { onApiEvent } = await import('../services/workflows/triggers.js');
    const { processWorkflowRuns } = await import('../services/workflows/executor.js');

    const accepted = await report({ email: BUYER, itemCount: 1, amount: 499 });
    expect(accepted.json(), accepted.body).toMatchObject({ data: { started: true } });
    const buyer = await contactByEmail(BUYER);
    expect(buyer, 'no contact was created for the buyer').toBeTruthy();

    const [parked] = await db
      .select({ id: workflowRuns.id, status: workflowRuns.status })
      .from(workflowRuns)
      .where(and(eq(workflowRuns.workflowId, suppressId), eq(workflowRuns.contactId, buyer!.id)));
    expect(parked?.status, 'the report did not start a run that parks on the wait').toBe('waiting');

    // They buy while the reminder is still queued.
    await onApiEvent(session.orgId, buyer!.id, 'order_placed', { order: { number: 'OBJ-9' } });

    const before = await emailJobIds();
    await db
      .update(workflowRuns)
      .set({ nextExecutionAt: new Date(Date.now() - 60_000) })
      .where(eq(workflowRuns.id, parked!.id));
    await processWorkflowRuns();

    // The run reached the send and chose not to send — different from never
    // getting there.
    const [stat] = await db
      .select({ entered: workflowNodeStats.entered })
      .from(workflowNodeStats)
      .where(
        and(eq(workflowNodeStats.workflowId, suppressId), eq(workflowNodeStats.nodeId, email.id)),
      );
    expect(stat?.entered ?? 0, 'the run never reached the email step').toBe(1);

    const after = await emailJobsAddedSince(before);
    expect(
      after.filter((j) => j.contactId === buyer!.id).length,
      'a shopper who already bought was sent the cart reminder',
    ).toBe(0);
  });

  it('a report with no address is refused and creates nothing', async () => {
    const contactsBefore = (
      await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.orgId, session.orgId))
    ).length;

    const res = await report({ itemCount: 2, amount: 100 });

    expect(res.statusCode, res.body).toBe(400);
    expect(
      (await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.orgId, session.orgId)))
        .length,
      'a malformed report created a contact',
    ).toBe(contactsBefore);
  });

  it('a publishable key may not name a contact id', async () => {
    const shopper = await contactByEmail(SHOPPER);
    const res = await report({ email: SHOPPER, contactId: shopper!.id });
    expect(res.statusCode, res.body).toBe(403);
  });
});
