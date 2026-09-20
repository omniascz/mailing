/**
 * A flow forked from a template sends the emails that template promises.
 *
 * Measured before this change, against this database: a `send_email` step of a
 * shipped template carried only a subject (or `templateId: null`), the queue
 * contract refused it — "campaignId, templateId or html required" — and the
 * run failed the moment a contact reached that step. 181 of 205 shipped email
 * steps, 86 of 103 graphs.
 *
 * Now each step names a built-in email (services/workflow-templates
 * /email-content.ts) and the fork clones that email into the organisation,
 * writing the new row's id into the step.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "the run completed" is also what a run that never reached the email looks
 * like, and a `templateId` that is a well-formed UUID satisfies the queue
 * contract whether or not it points at anything. So each case asserts three
 * things: the step's templateId is a row of THIS organisation with the name of
 * the built-in the template names, the run entered that step (its counter
 * moved), and the job that reached the queue carries that same id.
 *
 * WHAT THIS TEST CANNOT SEE
 * - No worker runs here. The job is read back off the `email` queue; whether
 *   the handler then renders and sends it is workflow-dispatch's own ground.
 * - The pairing itself (which email a category sends) is a judgement call and
 *   is asserted for existence and language, not for taste, in
 *   services/workflow-templates/email-content.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts, templates, workflows, workflowRuns } from '../db/schema/index.js';
import { workflowNodeStats } from '../db/schema/workflow-node-stats.js';
import { WORKFLOW_TEMPLATES } from '../services/workflow-templates/registry.js';
import { FLOW_TEMPLATES } from '../services/workflows/flow-templates.js';
import { SEED_DEFS, buildWorkflowGraph } from '../services/ticketing/seed-workflows.js';
import { BUILT_IN_EMAIL_KEY } from '../services/workflow-templates/email-content.js';
import { getTemplateById } from '../services/editor/templates/index.js';
import { emailQueue } from '../lib/queues.js';

type Node = { id: string; type: string; config: Record<string, unknown> };

const TAG = `wftpl-${randomUUID().slice(0, 8)}`;

let app: FastifyInstance;
let session: Session;
let contactId: string;
const createdWorkflows: string[] = [];

const api = async (method: 'POST' | 'PUT', url: string, payload?: unknown) => {
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

/** Every job now waiting on the email queue for this run. */
async function queuedEmailsFor(runId: string) {
  const jobs = await emailQueue.getJobs(['waiting', 'delayed', 'active', 'completed'], 0, 200);
  return jobs
    .filter((j) => (j?.data as { workflowRunId?: string } | undefined)?.workflowRunId === runId)
    .map((j) => j!.data as Record<string, unknown>);
}

async function runAndWait(workflowId: string) {
  const act = await api('POST', `/api/v1/workflows/${workflowId}/activate`, {});
  expect(act.statusCode, `activate: ${act.body}`).toBe(200);
  const trig = await api('POST', `/api/v1/workflows/${workflowId}/trigger`, { contactId });
  expect(trig.statusCode, `trigger: ${trig.body}`).toBe(200);
  const runId = idOf(trig);
  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
  return run!;
}

/** The first step a run reaches: these templates start with the email or a wait. */
async function entered(workflowId: string, nodeId: string): Promise<number> {
  const [row] = await db
    .select({ entered: workflowNodeStats.entered })
    .from(workflowNodeStats)
    .where(and(eq(workflowNodeStats.workflowId, workflowId), eq(workflowNodeStats.nodeId, nodeId)));
  return row?.entered ?? 0;
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
  const all = [...new Set([...ids, ...createdWorkflows])];
  if (all.length) {
    await db.delete(workflowRuns).where(inArray(workflowRuns.workflowId, all));
    await db.delete(workflowNodeStats).where(inArray(workflowNodeStats.workflowId, all));
    await db.delete(workflows).where(inArray(workflows.id, all));
  }
  if (contactId) await db.delete(contacts).where(eq(contacts.id, contactId));
  // The clones this test made in the demo org.
  await db.delete(templates).where(eq(templates.orgId, session.orgId));
  await app?.close();
}, 120_000);

/**
 * Three templates the gallery offers whose first step after the trigger is an
 * email. The ones this used to fork are no longer offered (#Z61: their emails
 * did not match their steps), and a fork of those now answers 404.
 */
const FORKABLE = ['cz-name-day-greeting', 'winback-60-day', 'reengagement-180-day'];

describe('forking a template brings its emails along', () => {
  it.each(FORKABLE)('%s', async (slug) => {
    const tpl = WORKFLOW_TEMPLATES.find((t) => t.slug === slug);
    expect(tpl, `template ${slug} is gone`).toBeTruthy();

    const fork = await api('POST', `/api/v1/workflow-templates/${slug}/fork`, {
      name: `${TAG} ${slug}`,
    });
    expect(fork.statusCode, fork.body).toBe(201);
    const workflowId = idOf(fork);
    createdWorkflows.push(workflowId);

    const emailNodes = (await nodesOf(workflowId)).filter((n) => n.type === 'send_email');
    expect(emailNodes.length, 'this template has no email step to check').toBeGreaterThan(0);

    for (const node of emailNodes) {
      const builtInId = node.config[BUILT_IN_EMAIL_KEY] as string;
      const templateId = node.config.templateId as string;
      expect(builtInId, `${node.id} names no built-in email`).toBeTruthy();
      expect(templateId, `${node.id} was not given a template row`).toBeTruthy();

      // Not a well-formed UUID out of nowhere: the row exists, in this org,
      // and it is a copy of the email the template names.
      const [row] = await db
        .select({ id: templates.id, name: templates.name, orgId: templates.orgId })
        .from(templates)
        .where(and(eq(templates.id, templateId), eq(templates.orgId, session.orgId)));
      expect(row, `templateId ${templateId} is not a row of this organisation`).toBeTruthy();
      expect(row!.name).toBe(getTemplateById(builtInId)!.name);
    }

    // And the run reaches the first email and queues it with that id.
    const run = await runAndWait(workflowId);
    expect(run.errorMessage, 'the run failed').toBeNull();

    // These three templates send before they wait, so the run must have gone
    // through the email — whether it then parked on a wait or finished is not
    // what is being checked, and neither is a branch that could skip this.
    const first = emailNodes[0]!;
    expect(await entered(workflowId, first.id), 'the email step was never entered').toBe(1);

    const jobs = await queuedEmailsFor(run.id);
    expect(jobs.length, 'nothing reached the email queue').toBeGreaterThan(0);
    expect(jobs[0]!.templateId).toBe(first.config.templateId);
    expect(jobs[0]!.orgId).toBe(session.orgId);
  });

  it('a second fork reuses the emails the first one made', async () => {
    const before = await db
      .select({ id: templates.id })
      .from(templates)
      .where(eq(templates.orgId, session.orgId));

    const fork = await api('POST', '/api/v1/workflow-templates/winback-60-day/fork', {
      name: `${TAG} second`,
    });
    expect(fork.statusCode, fork.body).toBe(201);
    createdWorkflows.push(idOf(fork));

    const after = await db
      .select({ id: templates.id })
      .from(templates)
      .where(eq(templates.orgId, session.orgId));
    expect(after.length, 'the second fork cloned the same emails again').toBe(before.length);

    // And it still points at real rows.
    const emails = (await nodesOf(idOf(fork))).filter((n) => n.type === 'send_email');
    for (const node of emails) {
      expect(before.map((r) => r.id)).toContain(node.config.templateId as string);
    }
  });
});

describe('what already worked keeps working', () => {
  it('the ticketing seeds still carry their own html and need no clone', () => {
    const seeded = SEED_DEFS.map((d) => buildWorkflowGraph(d))
      .flatMap((g) => g.nodes as unknown as Node[])
      .filter((n) => n.type === 'send_email');
    expect(seeded.length).toBeGreaterThan(0);
    for (const n of seeded) {
      expect(n.config.html, 'a seeded email lost its inline html').toBeTruthy();
      expect(n.config[BUILT_IN_EMAIL_KEY]).toBeUndefined();
    }
  });

  it('a template with no email step forks as before', async () => {
    const noEmail = WORKFLOW_TEMPLATES.find(
      (t) => !t.nodes.some((n) => n.type === 'send_email') && t.nodes.length > 1,
    );
    expect(noEmail, 'no template without an email step').toBeTruthy();
    const fork = await api('POST', `/api/v1/workflow-templates/${noEmail!.slug}/fork`, {
      name: `${TAG} no-email`,
    });
    expect(fork.statusCode, fork.body).toBe(201);
    createdWorkflows.push(idOf(fork));
  });

  it('the pre-built flows go through the same door: POST /workflows/templates/:id/use', async () => {
    const flow = FLOW_TEMPLATES.find((t) => t.id === 'welcome-series')!;
    const res = await api('POST', `/api/v1/workflows/templates/${flow.id}/use`, {
      name: `${TAG} use`,
    });
    expect(res.statusCode, res.body).toBe(201);
    createdWorkflows.push(idOf(res));

    const emails = (await nodesOf(idOf(res))).filter((n) => n.type === 'send_email');
    expect(emails.length).toBeGreaterThan(0);
    for (const node of emails) {
      expect('templateId' in node.config && node.config.templateId).toBeTruthy();
      expect(node.config.templateId).not.toBeNull();
    }
  });

  it('no shipped email step is left without content', () => {
    const steps = [
      ...WORKFLOW_TEMPLATES.flatMap((t) => t.nodes as Node[]),
      ...FLOW_TEMPLATES.flatMap((t) => t.nodes as unknown as Node[]),
    ].filter((n) => n.type === 'send_email');
    expect(steps.length).toBeGreaterThan(190);
    const contentless = steps.filter(
      (n) =>
        n.config.campaignId === undefined &&
        n.config.templateId === undefined &&
        n.config.html === undefined &&
        n.config[BUILT_IN_EMAIL_KEY] === undefined,
    );
    expect(contentless).toHaveLength(0);
  });
});
