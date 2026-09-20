/**
 * The gallery offers only the templates whose emails match their steps.
 *
 * Each shipped email step names an email from the catalogue, paired by
 * category (#194). Read step by step, 63 of the 87 gallery templates and 2 of
 * the 5 pre-built flows have at least one step whose email is about something
 * else — "Refund confirmed" paired with "Your order has shipped", a GDPR
 * deletion notice with "Big news from us", a Czech Mother's Day tip with a
 * name-day greeting. The recipient sees the step's subject and the email's
 * body, so the mismatch reaches the inbox.
 *
 * Those templates stay in the code with their tests and are not offered: gone
 * from the listing and the category counts, 404 from detail, fork and "use".
 * A workflow forked before this is a copy of its own and is unaffected — the
 * last case here proves that by running one.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * An empty gallery would satisfy "does not offer the bad ones" perfectly, so
 * every case that asserts an absence also asserts what is present, with a
 * count: the listing has more than fifteen templates, the categories add up to
 * the same number, and the three named good templates are in it.
 *
 * WHAT THIS TEST CANNOT SEE
 * - Whether the pairing judgement is right. That is a reading of 181 steps,
 *   recorded in hidden-templates.ts with a reason each.
 * - The web gallery page; it renders whatever this API returns.
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
  HIDDEN_FLOW_TEMPLATES,
  HIDDEN_WORKFLOW_TEMPLATES,
} from '../services/workflow-templates/hidden-templates.js';

const TAG = `wfgal-${randomUUID().slice(0, 8)}`;

/** Named in the brief: two that must disappear, one that must stay. */
const HIDDEN_ONE = 'ecom-post-refund-recovery';
const HIDDEN_TWO = 'gdpr-account-deletion-confirm';
const OFFERED = 'abandoned-cart-3-touch';

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

const slugsOf = (res: { json: () => unknown }) =>
  (res.json() as { data: Array<{ slug?: string; id?: string }> }).data.map((t) => t.slug ?? t.id);

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

describe('GET /api/v1/workflow-templates', () => {
  it('lists what we offer and none of what we do not', async () => {
    const res = await api('GET', '/api/v1/workflow-templates');
    expect(res.statusCode, res.body).toBe(200);
    const slugs = slugsOf(res);

    // Present, with a count — an empty gallery would pass the absences below.
    expect(slugs.length, 'the gallery is empty').toBeGreaterThan(15);
    expect(slugs).toContain(OFFERED);
    expect(slugs).not.toContain(HIDDEN_ONE);
    expect(slugs).not.toContain(HIDDEN_TWO);
    expect(slugs.filter((s) => Object.hasOwn(HIDDEN_WORKFLOW_TEMPLATES, s!))).toEqual([]);
  });

  it('the category counts add up to the templates it lists', async () => {
    const list = await api('GET', '/api/v1/workflow-templates');
    const cats = await api('GET', '/api/v1/workflow-templates/categories');
    expect(cats.statusCode, cats.body).toBe(200);
    const counts = (cats.json() as { data: Array<{ category: string; count: number }> }).data;
    const total = counts.reduce((n, c) => n + c.count, 0);
    expect(total).toBe(slugsOf(list).length);
    expect(counts.length).toBeGreaterThan(0);
  });

  it('a hidden template has no detail page and cannot be forked', async () => {
    for (const slug of [HIDDEN_ONE, HIDDEN_TWO]) {
      const detail = await api('GET', `/api/v1/workflow-templates/${slug}`);
      expect(detail.statusCode, `${slug} detail: ${detail.body}`).toBe(404);

      const fork = await api('POST', `/api/v1/workflow-templates/${slug}/fork`, {
        name: `${TAG} ${slug}`,
      });
      expect(fork.statusCode, `${slug} fork: ${fork.body}`).toBe(404);
      expect(
        await db
          .select({ id: workflows.id })
          .from(workflows)
          .where(and(eq(workflows.orgId, session.orgId), eq(workflows.name, `${TAG} ${slug}`))),
        'a hidden template was forked anyway',
      ).toEqual([]);
    }
  });

  it('an offered template still has its detail page and still forks', async () => {
    const detail = await api('GET', `/api/v1/workflow-templates/${OFFERED}`);
    expect(detail.statusCode, detail.body).toBe(200);

    const fork = await api('POST', `/api/v1/workflow-templates/${OFFERED}/fork`, {
      name: `${TAG} offered`,
    });
    expect(fork.statusCode, fork.body).toBe(201);
    const id = (fork.json() as { data: { id: string } }).data.id;
    created.push(id);

    const [row] = await db
      .select({ nodes: workflows.nodes })
      .from(workflows)
      .where(eq(workflows.id, id));
    const emails = (row!.nodes as Array<{ type: string; config: Record<string, unknown> }>).filter(
      (n) => n.type === 'send_email',
    );
    expect(emails.length).toBeGreaterThan(0);
    for (const n of emails) expect(n.config.templateId, 'the fork lost its emails').toBeTruthy();
  });
});

describe('GET /api/v1/workflows/templates (the pre-built flows)', () => {
  it('lists the offered ones only', async () => {
    const res = await api('GET', '/api/v1/workflows/templates');
    expect(res.statusCode, res.body).toBe(200);
    const ids = slugsOf(res);
    expect(ids.length, 'no pre-built flow is offered at all').toBeGreaterThan(0);
    expect(ids).toContain('abandoned-cart');
    for (const hidden of Object.keys(HIDDEN_FLOW_TEMPLATES)) expect(ids).not.toContain(hidden);
  });

  it('a hidden pre-built flow is 404 on detail and on use, and an offered one still works', async () => {
    const hidden = Object.keys(HIDDEN_FLOW_TEMPLATES)[0]!;
    expect((await api('GET', `/api/v1/workflows/templates/${hidden}`)).statusCode).toBe(404);
    const used = await api('POST', `/api/v1/workflows/templates/${hidden}/use`, {
      name: `${TAG} hidden-use`,
    });
    expect(used.statusCode, used.body).toBe(404);

    const ok = await api('POST', '/api/v1/workflows/templates/abandoned-cart/use', {
      name: `${TAG} use`,
    });
    expect(ok.statusCode, ok.body).toBe(201);
    created.push((ok.json() as { data: { id: string } }).data.id);
  });
});

describe('a workflow forked before its template was hidden', () => {
  it('still runs', async () => {
    // Built here the way a fork built it then: the graph of a now-hidden
    // template, with an email that has content.
    const clone = await api('POST', '/api/v1/templates/ecom-001/use', { name: `${TAG} mail` });
    expect(clone.statusCode, clone.body).toBe(201);
    const templateId = (clone.json() as { data: { id: string } }).data.id;

    const wf = await api('POST', '/api/v1/workflows', {
      name: `${TAG} old fork`,
      triggerType: 'manual',
      nodes: [
        { id: 't', type: 'trigger', config: {} },
        { id: 'e1', type: 'send_email', config: { subject: 'Refund confirmed', templateId } },
      ],
      edges: [{ id: 'e0', source: 't', target: 'e1' }],
    });
    expect(wf.statusCode, wf.body).toBe(200);
    const id = (wf.json() as { data: { id: string } }).data.id;
    created.push(id);

    expect((await api('POST', `/api/v1/workflows/${id}/activate`, {})).statusCode).toBe(200);
    const trig = await api('POST', `/api/v1/workflows/${id}/trigger`, { contactId });
    expect(trig.statusCode, trig.body).toBe(200);

    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, (trig.json() as { data: { id: string } }).data.id));
    expect(run!.errorMessage).toBeNull();
    expect(run!.status).toBe('completed');
  });
});
