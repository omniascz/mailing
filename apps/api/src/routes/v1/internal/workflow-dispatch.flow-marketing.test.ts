/**
 * The workflow dispatch's two e-mail readers of Z166 — Michal, 14. 10. 22:10,
 * point 3: "non_subscribed: marketingové uzly flow ho vynechají jako kampaň;
 * transakční výjimka z bodu 1 platí."
 *
 * - The inline-HTML branch skips a non_subscribed contact for a flow's node
 *   (the job carries workflowRunId) without the exception, and only then.
 * - The template branch marks every job it does not mark flowTransactional
 *   with flowMarketing, which batch-sender reads.
 *
 * The database is a stub that answers each `.limit()` in turn; the queues, the
 * exception's database read and the opt-out footer are stand-ins. The route
 * itself is real, injected through Fastify.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  transactional: false,
}));

vi.mock('../../../db/client.js', () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(state.rows.shift() ?? []),
  };
  return { db: { select: () => chain } };
});
vi.mock('../../../lib/queues.js', () => ({
  batchSenderTriggeredQueue: { add: vi.fn(async () => ({})) },
  PRIORITY: { TRIGGERED: 2 },
  sendTransactionalEmail: vi.fn(async () => 'msg-1'),
}));
vi.mock('../../../services/workflows/executor.js', () => ({ processWorkflowRuns: vi.fn() }));
vi.mock('../../../services/sms/routing.js', () => ({ routedSmsSend: vi.fn() }));
vi.mock('../../../services/workflows/transactional-exception.js', () => ({
  flowTransactionalException: vi.fn(async () => state.transactional),
}));
vi.mock('../../../services/workflows/inline-optout.js', () => ({
  applyInlineOptOut: vi.fn(async (o: { html: string; text?: string }) => ({
    html: o.html,
    text: o.text,
    customHeaders: {},
  })),
  resolveOrgFooterIdentity: vi.fn(async () => ({ companyName: 'Obchod', companyAddress: 'Praha' })),
}));

import internalWorkflowDispatchRoutes from './workflow-dispatch.js';
import { batchSenderTriggeredQueue, sendTransactionalEmail } from '../../../lib/queues.js';

const ORG = '00000000-0000-4000-8000-000000000001';
const CONTACT = '00000000-0000-4000-8000-000000000002';
const RUN = '00000000-0000-4000-8000-000000000003';
const TEMPLATE = '00000000-0000-4000-8000-000000000004';
const DOMAIN = [{ domain: 'shop.example.test', sub: null }];

async function send(body: Record<string, unknown>) {
  const app = Fastify();
  await app.register(internalWorkflowDispatchRoutes);
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/internal/workflow/send-email',
    payload: { orgId: ORG, contactId: CONTACT, ...body },
  });
  await app.close();
  return { status: res.statusCode, body: res.json() as { data: Record<string, unknown> } };
}

/** The inline branch for a contact of `status`: the contact row, then the From. */
function inline(status: string, extra: Record<string, unknown>) {
  state.rows = [[{ email: 'petra@example.test', status }], DOMAIN];
  return send({ html: '<p>Ahoj</p>', subject: 'Ahoj', ...extra });
}

/** The template branch: the template row, then the From. */
function template(extra: Record<string, unknown>) {
  state.rows = [
    [{ subject: 'Ahoj', preheader: null, locale: 'cs', blocks: [], globalStyles: {} }],
    DOMAIN,
  ];
  return send({ templateId: TEMPLATE, ...extra });
}

const addedJob = () =>
  (vi.mocked(batchSenderTriggeredQueue.add).mock.calls[0] as unknown as [string, object])[1];

beforeEach(() => {
  state.rows = [];
  state.transactional = false;
  vi.mocked(batchSenderTriggeredQueue.add).mockClear();
  vi.mocked(sendTransactionalEmail).mockClear();
});

describe('inline branch — a flow node skips non_subscribed (Z166)', () => {
  it('a flow node (workflowRunId) without the exception: non_subscribed is skipped with 200', async () => {
    const r = await inline('non_subscribed', { workflowRunId: RUN, nodeId: 'send' });
    expect(r).toEqual({
      status: 200,
      body: { data: { skipped: true, reason: 'contact status non_subscribed' } },
    });
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('a personal e-mail or review request (a run, no nodeId) skips it too', async () => {
    const r = await inline('non_subscribed', { workflowRunId: RUN });
    expect(r.body.data).toEqual({ skipped: true, reason: 'contact status non_subscribed' });
  });

  it('active still goes, as workflow_marketing', async () => {
    const r = await inline('active', { workflowRunId: RUN, nodeId: 'send' });
    expect(r.body.data).toEqual({ queued: true, messageId: 'msg-1' });
    expect(vi.mocked(sendTransactionalEmail).mock.calls[0]![1]).toEqual({
      purpose: 'workflow_marketing',
    });
  });

  it.each(['unsubscribed', 'bounced', 'complained', 'pending', 'archived'])(
    '%s keeps its skip on a flow node',
    async (status) => {
      const r = await inline(status, { workflowRunId: RUN, nodeId: 'send' });
      expect(r.body.data).toEqual({ skipped: true, reason: `contact status ${status}` });
    },
  );

  it('under the exception non_subscribed goes, with the transactional purpose', async () => {
    state.transactional = true;
    const r = await inline('non_subscribed', { workflowRunId: RUN, nodeId: 'send' });
    expect(r.body.data).toEqual({ queued: true, messageId: 'msg-1' });
    expect(vi.mocked(sendTransactionalEmail).mock.calls[0]![1]).toBeUndefined();
  });

  it('a sequence step (no run) is unchanged: non_subscribed goes', async () => {
    const r = await inline('non_subscribed', {});
    expect(r.body.data).toEqual({ queued: true, messageId: 'msg-1' });
  });
});

describe('template branch — every job is flowTransactional or flowMarketing (Z166)', () => {
  it('without the exception the job says flowMarketing', async () => {
    const r = await template({ workflowRunId: RUN, nodeId: 'send' });
    expect(r.body.data).toEqual({ queued: true });
    const job = addedJob();
    expect(job).toMatchObject({ stream: 'triggered', flowMarketing: true });
    expect(job).not.toHaveProperty('flowTransactional');
  });

  it('with the exception the job says flowTransactional and not flowMarketing', async () => {
    state.transactional = true;
    await template({ workflowRunId: RUN, nodeId: 'send' });
    const job = addedJob();
    expect(job).toMatchObject({ stream: 'triggered', flowTransactional: true });
    expect(job).not.toHaveProperty('flowMarketing');
  });
});
