/**
 * The six Czech recipes built on the Czech catalogue.
 *
 * After #195 the gallery offered two Czech templates, because the rest were
 * paired with emails about something else. These six need no new email: the
 * catalogue already ships Czech order confirmations, shipping and delivery
 * notices, review requests, payment instructions, pickup notices, invoices,
 * cross-sell and loyalty summaries. Each step names its email outright
 * (`emailFrom` in registry.ts) rather than taking whatever the category series
 * hands it — the guesswork that made 64 templates unpublishable.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * A fork that answers 201 proves nothing on its own, and a well-formed UUID in
 * `templateId` satisfies the queue whether or not it points anywhere. So each
 * template is checked three ways: the row behind every step's templateId
 * belongs to this organisation and carries the name of the Czech email the
 * template names; the run reaches the first email (its counter moves); and the
 * job on the email queue for that run carries the same id.
 *
 * WHAT THIS TEST CANNOT SEE
 * - Whether the recipes are good marketing. It checks that each step sends the
 *   email it says it sends, in Czech.
 * - The triggers themselves. purchase_event, api_event and
 *   loyalty_points_earned have their own coverage in
 *   workflow-triggers.integration.test.ts; here the runs are started manually.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts, templates, workflows, workflowRuns } from '../db/schema/index.js';
import { workflowNodeStats } from '../db/schema/workflow-node-stats.js';
import {
  PUBLISHED_WORKFLOW_TEMPLATES,
  WORKFLOW_TEMPLATES,
} from '../services/workflow-templates/registry.js';
import { BUILT_IN_EMAIL_KEY } from '../services/workflow-templates/email-content.js';
import { getTemplateById, localeOf } from '../services/editor/templates/index.js';
import { emailQueue } from '../lib/queues.js';

type Node = { id: string; type: string; config: Record<string, unknown> };

const TAG = `czflow-${randomUUID().slice(0, 8)}`;

/** The six, with the Czech emails each one promises to send. */
const SIX: Array<[slug: string, emails: string[]]> = [
  [
    'post-purchase-cs',
    ['cs-order-confirm', 'cs-shipping-tracking', 'cs-delivered', 'cs-review-request'],
  ],
  ['payment-pending-cs', ['cs-payment-pending']],
  ['back-in-stock-cs', ['cs-back-in-stock']],
  ['cross-sell-cs', ['cs-crosssell']],
  ['loyalty-points-cs', ['cs-loyalty-points']],
  ['pickup-invoice-cs', ['cs-pickup-ready', 'cs-invoice']],
];

let app: FastifyInstance;
let session: Session;
let contactId: string;
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

const idOf = (res: { json: () => unknown }) => (res.json() as { data: { id: string } }).data.id;

async function nodesOf(workflowId: string): Promise<Node[]> {
  const [row] = await db
    .select({ nodes: workflows.nodes })
    .from(workflows)
    .where(eq(workflows.id, workflowId));
  return row!.nodes as Node[];
}

async function entered(workflowId: string, nodeId: string): Promise<number> {
  const [row] = await db
    .select({ entered: workflowNodeStats.entered })
    .from(workflowNodeStats)
    .where(and(eq(workflowNodeStats.workflowId, workflowId), eq(workflowNodeStats.nodeId, nodeId)));
  return row?.entered ?? 0;
}

async function queuedFor(runId: string) {
  const jobs = await emailQueue.getJobs(['waiting', 'delayed', 'active', 'completed'], 0, 300);
  return jobs
    .filter((j) => (j?.data as { workflowRunId?: string } | undefined)?.workflowRunId === runId)
    .map((j) => j!.data as Record<string, unknown>);
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  const [c] = await db
    .insert(contacts)
    .values({ orgId: session.orgId, email: `${TAG}@example.invalid` })
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
  if (contactId) await db.delete(contacts).where(eq(contacts.id, contactId));
  await db.delete(templates).where(eq(templates.orgId, session.orgId));
  await app?.close();
}, 120_000);

describe.each(SIX)('%s', (slug, expectedEmails) => {
  it('is in the gallery, forks with its Czech emails, and runs', async () => {
    const listed = await api('GET', '/api/v1/workflow-templates?locale=cs');
    expect(listed.statusCode, listed.body).toBe(200);
    const csSlugs = (listed.json() as { data: Array<{ slug: string }> }).data.map((t) => t.slug);
    expect(csSlugs, 'the gallery does not offer it').toContain(slug);

    const fork = await api('POST', `/api/v1/workflow-templates/${slug}/fork`, {
      name: `${TAG} ${slug}`,
    });
    expect(fork.statusCode, fork.body).toBe(201);
    const workflowId = idOf(fork);
    created.push(workflowId);

    const emailNodes = (await nodesOf(workflowId)).filter((n) => n.type === 'send_email');
    expect(emailNodes.map((n) => n.config[BUILT_IN_EMAIL_KEY])).toEqual(expectedEmails);

    // Each step's templateId is a row of THIS organisation, and it is a copy of
    // the Czech email the template names — not a well-formed UUID from nowhere.
    for (const [i, node] of emailNodes.entries()) {
      const builtIn = getTemplateById(expectedEmails[i]!)!;
      expect(localeOf(builtIn), `${expectedEmails[i]} is not a Czech email`).toBe('cs');
      const [row] = await db
        .select({ name: templates.name })
        .from(templates)
        .where(
          and(
            eq(templates.id, node.config.templateId as string),
            eq(templates.orgId, session.orgId),
          ),
        );
      expect(row, `${node.id}: templateId is not a row of this organisation`).toBeTruthy();
      expect(row!.name).toBe(builtIn.name);
    }

    // And it runs: the first email goes out, with that id on the queue.
    expect((await api('POST', `/api/v1/workflows/${workflowId}/activate`, {})).statusCode).toBe(
      200,
    );
    const trig = await api('POST', `/api/v1/workflows/${workflowId}/trigger`, { contactId });
    expect(trig.statusCode, trig.body).toBe(200);
    const runId = idOf(trig);
    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    expect(run!.errorMessage, 'the run failed').toBeNull();

    const first = emailNodes[0]!;
    const startsWithWait = slug === 'cross-sell-cs';
    if (startsWithWait) {
      // This one waits a week before it sends; the run parks on the wait.
      expect(run!.status).toBe('waiting');
      expect(await entered(workflowId, first.id)).toBe(0);
    } else {
      expect(await entered(workflowId, first.id), 'the run never reached the email').toBe(1);
      const jobs = await queuedFor(runId);
      expect(jobs.length, 'nothing reached the email queue').toBeGreaterThan(0);
      expect(jobs[0]!.templateId).toBe(first.config.templateId);
      expect(jobs[0]!.orgId).toBe(session.orgId);
    }
  });
});

describe('the rest of the gallery', () => {
  it('offers eight Czech templates, the two from before among them', () => {
    const czech = PUBLISHED_WORKFLOW_TEMPLATES.filter((t) => t.locale === 'cs').map((t) => t.slug);
    expect(czech).toHaveLength(8);
    expect(czech).toContain('cz-name-day-greeting');
    expect(czech).toContain('abandoned-cart-cs');
    for (const [slug] of SIX) expect(czech).toContain(slug);
  });

  it('every step of the six names a Czech email that exists', () => {
    for (const [slug, emails] of SIX) {
      const tpl = WORKFLOW_TEMPLATES.find((t) => t.slug === slug)!;
      const named = (tpl.nodes as Node[])
        .filter((n) => n.type === 'send_email')
        .map((n) => n.config[BUILT_IN_EMAIL_KEY] as string);
      expect(named).toEqual(emails);
      for (const id of named) {
        const builtIn = getTemplateById(id);
        expect(builtIn, `${slug} names ${id}, which is not in the catalogue`).toBeTruthy();
        expect(localeOf(builtIn!)).toBe('cs');
      }
    }
  });

  it('the templates hidden in #195 are still hidden', async () => {
    const res = await api('GET', '/api/v1/workflow-templates');
    const slugs = (res.json() as { data: Array<{ slug: string }> }).data.map((t) => t.slug);
    expect(slugs.length).toBeGreaterThan(20);
    for (const hidden of [
      'ecom-post-refund-recovery',
      'gdpr-account-deletion-confirm',
      'birthday-cs',
    ]) {
      expect(slugs).not.toContain(hidden);
    }
  });

  it('the two Czech templates from before still fork and still send Czech', async () => {
    for (const slug of ['abandoned-cart-cs', 'cz-name-day-greeting']) {
      const fork = await api('POST', `/api/v1/workflow-templates/${slug}/fork`, {
        name: `${TAG} old ${slug}`,
      });
      expect(fork.statusCode, `${slug}: ${fork.body}`).toBe(201);
      created.push(idOf(fork));

      const emails = (await nodesOf(idOf(fork))).filter((n) => n.type === 'send_email');
      expect(emails.length).toBeGreaterThan(0);
      for (const n of emails) {
        expect(n.config.templateId).toBeTruthy();
        expect(localeOf(getTemplateById(n.config[BUILT_IN_EMAIL_KEY] as string)!)).toBe('cs');
      }
    }
  });
});
