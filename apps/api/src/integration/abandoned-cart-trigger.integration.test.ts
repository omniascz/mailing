/**
 * The abandoned-cart recipes fire on the event the product actually emits.
 *
 * Five shipped recipes waited for `cart_abandoned`. Nothing emitted it: the
 * only producer in the product is onCheckoutStarted, which emits
 * `checkout_started` (services/workflows/triggers.ts), fed by the ecommerce
 * connectors. So a customer who forked "Opuštěný košík — 3 doteky" got a flow
 * that could never start, and the failure was silent — an active workflow with
 * zero runs looks exactly like a shop with no abandoned carts.
 *
 * ─── Why this is not only a rename ───────────────────────────────────────────
 *
 * `checkout_started` fires when the shopper reaches the checkout, which is also
 * what happens immediately before a successful purchase. Pointing the recipes
 * at it without anything else would nag people who bought. The product already
 * has the mechanism — `suppressOnEvent` on the trigger config, read back at the
 * moment of the send by isSuppressedAtSendTime (services/workflows/
 * conversion-suppression.ts) — and no shipped template used it. Now all five
 * declare `suppressOnEvent: 'order_placed'`.
 *
 * So the abandonment is the flow's wait plus that suppression, not a separate
 * event somebody has to invent.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "A run started" is not the claim; the claim is that the mail is queued with
 * the event's own data. Each case therefore reads the email queue and the node
 * statistics, and the suppression case asserts the run reached the send step
 * and produced NO job — which is a different thing from never getting there.
 *
 * WHAT THIS TEST CANNOT SEE
 * - It does not run the connectors; it calls the trigger entry point they call.
 * - It does not wait out the flow's real delays: the graph is trimmed to the
 *   trigger and the first email, the way the merge-data suite does it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, like } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts, workflows, workflowRuns, workflowEvents } from '../db/schema/index.js';
import { workflowNodeStats } from '../db/schema/workflow-node-stats.js';

type Node = { id: string; type: string; config: Record<string, unknown> };

const TAG = `z74-${randomUUID().slice(0, 8)}`;

let app: FastifyInstance;
let session: Session;
let contactId: string;
const created: string[] = [];
const extraContacts: string[] = [];

const api = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
  const res = await app.inject({
    method,
    url,
    headers: { cookie: session.cookie },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
  return { statusCode: res.statusCode, body: res.body, json: () => res.json() };
};

/** Jobs already on the email queue — nothing on one names the run. */
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

/**
 * Fork a recipe and trim it to the trigger plus its first email, so the run
 * sends instead of parking on the wait that makes it an abandonment.
 */
async function forkTrimmed(slug: string) {
  const fork = await api('POST', `/api/v1/workflow-templates/${slug}/fork`, {
    name: `${TAG} ${slug} ${randomUUID().slice(0, 6)}`,
  });
  expect(fork.statusCode, fork.body).toBe(201);
  const workflowId = (fork.json() as { data: { id: string } }).data.id;
  created.push(workflowId);

  const [row] = await db
    .select({ nodes: workflows.nodes, triggerConfig: workflows.triggerConfig })
    .from(workflows)
    .where(eq(workflows.id, workflowId));
  const nodes = row!.nodes as Node[];
  const trigger = nodes.find((n) => n.type === 'trigger')!;
  const email = nodes.find((n) => n.type === 'send_email')!;
  await db
    .update(workflows)
    .set({
      nodes: [trigger, email] as never,
      edges: [{ id: 'e0', source: trigger.id, target: email.id }] as never,
      status: 'active',
    })
    .where(eq(workflows.id, workflowId));

  return {
    workflowId,
    emailNodeId: email.id,
    triggerConfig: row!.triggerConfig as Record<string, unknown>,
  };
}

const entered = async (workflowId: string, nodeId: string) => {
  const [stat] = await db
    .select({ entered: workflowNodeStats.entered })
    .from(workflowNodeStats)
    .where(and(eq(workflowNodeStats.workflowId, workflowId), eq(workflowNodeStats.nodeId, nodeId)));
  return stat?.entered ?? 0;
};

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  const [c] = await db
    .insert(contacts)
    .values({
      orgId: session.orgId,
      email: `${TAG}@example.invalid`,
      firstName: 'Jana',
      status: 'active',
    })
    .returning({ id: contacts.id });
  contactId = c!.id;
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
  if (contactId) {
    await db.delete(workflowEvents).where(eq(workflowEvents.contactId, contactId));
    await db.delete(contacts).where(eq(contacts.id, contactId));
  }
  if (extraContacts.length) {
    await db.delete(workflowEvents).where(inArray(workflowEvents.contactId, extraContacts));
    await db.delete(contacts).where(inArray(contacts.id, extraContacts));
  }
  await app?.close();
}, 120_000);

describe('the event the shop sends starts the recipe', () => {
  it('abandoned-cart-cs starts on checkout_started, and the mail carries the cart', async () => {
    const { workflowId, emailNodeId } = await forkTrimmed('abandoned-cart-cs');
    const before = await emailJobIds();

    const { onCheckoutStarted } = await import('../services/workflows/triggers.js');
    await onCheckoutStarted(session.orgId, contactId, {
      cart: { item_count: '3', total: '1 299 Kč' },
      checkout_url: 'https://shop.example.cz/kosik/abc',
    });

    expect(await entered(workflowId, emailNodeId), 'the run never reached the email').toBe(1);

    const jobs = await emailJobsAddedSince(before);
    const mine = jobs.filter((j) => j.orgId === session.orgId && j.contactId === contactId);
    expect(mine.length, 'nothing reached the email queue').toBe(1);
    // The event's own data travelled with it (#197).
    expect(JSON.stringify(mine[0]!.mergeData ?? {})).toContain('1 299 Kč');
  });

  it('a shop still posting the old name also starts it', async () => {
    const { workflowId, emailNodeId } = await forkTrimmed('abandoned-cart-cs');

    const { onApiEvent } = await import('../services/workflows/triggers.js');
    await onApiEvent(session.orgId, contactId, 'cart_abandoned', { cart: { item_count: '2' } });

    expect(
      await entered(workflowId, emailNodeId),
      'the alias for the documented old name does not start the recipe',
    ).toBe(1);
  });
});

describe('somebody who bought is not nagged', () => {
  it('the wait elapses, the purchase happened, and no nudge goes out', async () => {
    // The real sequence, not a shortcut: the recipe keeps its wait, so the run
    // parks; the purchase lands while it waits; only then does the send come
    // due. isSuppressedAtSendTime only counts a conversion that happened AFTER
    // the run started, which is exactly why the order has to be fired here and
    // not before.
    const fork = await api('POST', '/api/v1/workflow-templates/abandoned-cart-cs/fork', {
      name: `${TAG} suppress ${randomUUID().slice(0, 6)}`,
    });
    expect(fork.statusCode, fork.body).toBe(201);
    const workflowId = (fork.json() as { data: { id: string } }).data.id;
    created.push(workflowId);

    const [row] = await db
      .select({
        nodes: workflows.nodes,
        edges: workflows.edges,
        triggerConfig: workflows.triggerConfig,
      })
      .from(workflows)
      .where(eq(workflows.id, workflowId));
    expect(
      (row!.triggerConfig as { suppressOnEvent?: string }).suppressOnEvent,
      'the recipe declares no conversion event',
    ).toBe('order_placed');

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
      .where(eq(workflows.id, workflowId));

    const { onCheckoutStarted, onApiEvent } = await import('../services/workflows/triggers.js');
    const { processWorkflowRuns } = await import('../services/workflows/executor.js');

    await onCheckoutStarted(session.orgId, contactId, { cart: { item_count: '3' } });

    const [parked] = await db
      .select({ id: workflowRuns.id, status: workflowRuns.status })
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, workflowId));
    expect(parked?.status, 'the run did not park on the wait').toBe('waiting');

    // The shopper buys while the reminder is still queued.
    await onApiEvent(session.orgId, contactId, 'order_placed', { order: { number: 'OBJ-1' } });

    // The wait comes due.
    const before = await emailJobIds();
    await db
      .update(workflowRuns)
      .set({ nextExecutionAt: new Date(Date.now() - 60_000) })
      .where(eq(workflowRuns.id, parked!.id));
    await processWorkflowRuns();

    // The distinction that matters: the run DID reach the send step and chose
    // not to send, rather than never getting there.
    expect(await entered(workflowId, email.id), 'the run never reached the email step').toBe(1);
    const jobs = await emailJobsAddedSince(before);
    expect(
      jobs.filter((j) => j.orgId === session.orgId && j.contactId === contactId).length,
      'a customer who already bought was sent the cart nudge',
    ).toBe(0);
  });

  it('without the purchase the same flow does send', async () => {
    // The must-pass half: a suppression that refuses everyone is a deletion.
    const { workflowId, emailNodeId } = await forkTrimmed('abandoned-cart-cs');
    const fresh = await db
      .insert(contacts)
      .values({
        orgId: session.orgId,
        email: `${TAG}-nobuy-${randomUUID().slice(0, 6)}@example.invalid`,
        status: 'active',
      })
      .returning({ id: contacts.id });
    const otherContact = fresh[0]!.id;
    extraContacts.push(otherContact);

    const before = await emailJobIds();
    const { onCheckoutStarted } = await import('../services/workflows/triggers.js');
    await onCheckoutStarted(session.orgId, otherContact, { cart: { item_count: '1' } });

    expect(await entered(workflowId, emailNodeId)).toBe(1);
    const jobs = await emailJobsAddedSince(before);
    // At least one, not exactly one: the cases above left their own forks of
    // this recipe active in the same org, and every one of them legitimately
    // starts on this checkout. The claim here is that the suppression is a
    // guard and not a deletion — without a purchase, the mail goes out.
    expect(
      jobs.filter((j) => j.contactId === otherContact).length,
      'the flow sends nothing even without a purchase — that is a deletion, not a guard',
    ).toBeGreaterThanOrEqual(1);
  });
});

describe('what must not change', () => {
  it('a workflow configured for cart_abandoned still fires on exactly that', async () => {
    // Somebody's own flow, built before this change: it must keep its meaning.
    const wf = await api('POST', '/api/v1/workflows', {
      name: `${TAG} legacy`,
      triggerType: 'api_event',
      triggerConfig: { eventName: 'cart_abandoned' },
      nodes: [
        {
          id: 't',
          type: 'trigger',
          config: { triggerType: 'api_event', eventName: 'cart_abandoned' },
        },
        { id: 'e1', type: 'send_email', config: { subject: 'Košík', html: '<p>Ahoj</p>' } },
      ],
      edges: [{ id: 'e0', source: 't', target: 'e1' }],
    });
    expect(wf.statusCode, wf.body).toBe(200);
    const workflowId = (wf.json() as { data: { id: string } }).data.id;
    created.push(workflowId);
    await db.update(workflows).set({ status: 'active' }).where(eq(workflows.id, workflowId));

    const { onApiEvent, onCheckoutStarted } = await import('../services/workflows/triggers.js');

    await onApiEvent(session.orgId, contactId, 'cart_abandoned', {});
    expect(await entered(workflowId, 'e1'), 'the old name stopped working').toBe(1);

    // And the alias is one-directional: this flow must NOT start running on
    // every checkout just because the shipped recipes moved.
    await onCheckoutStarted(session.orgId, contactId, {});
    expect(
      await entered(workflowId, 'e1'),
      'a flow built for cart_abandoned started firing on checkout_started',
    ).toBe(1);
  });

  it('an unrelated recipe does not start on a cart event', async () => {
    const { workflowId, emailNodeId } = await forkTrimmed('post-purchase-cs');

    const { onCheckoutStarted } = await import('../services/workflows/triggers.js');
    await onCheckoutStarted(session.orgId, contactId, { cart: { item_count: '9' } });

    expect(
      await entered(workflowId, emailNodeId),
      'a post-purchase recipe ran on a checkout event',
    ).toBe(0);
  });
});
