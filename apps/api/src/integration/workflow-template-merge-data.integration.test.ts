/**
 * A templated workflow email renders the order it is about.
 *
 * Two send paths leave executeSendEmail. Inline `html` is substituted here, in
 * the API, with the run's own data. A template (`templateId`) is not: the
 * blocks and the subject go to the batch sender, which built its merge context
 * from the contact and the system values alone. So a shipped Czech template
 * addressed the order it was sent about and got its own default back —
 * measured before this change, with a real order in the event:
 * "Objednávka č. — přijata", "Zásilka — je na cestě", "Faktura — k objednávce —".
 *
 * The run's data now travels with the job (`mergeData` on the queue contract)
 * and is folded into the same context the renderer already uses.
 *
 * ─── What this test does ─────────────────────────────────────────────────────
 *
 * It runs the flow against the real database, takes the job the dispatch put on
 * the batch-sender queue, and renders it the way the worker does: the worker's
 * own buildMergeContext (apps/workers jobs/merge-context.ts, loaded by path —
 * the API package cannot import apps/workers statically, tsc rootDir) and the
 * renderer both packages share (@forgemsg/editor). So the assertions are about
 * rendered text, not about the payload.
 *
 * ─── Why the assertions are about the SUBJECT ────────────────────────────────
 *
 * The body of a templated workflow send does not render at all today, for two
 * reasons that predate this change and lie outside it — see the last case,
 * which pins them down. The subject is rendered by its own parseMergeTags call
 * (batch-sender.ts), so it is the part of the email this change can be proven
 * over end to end. The last case asserts the body's broken shape explicitly
 * rather than quietly rendering nothing and passing.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * A send that never happened would also contain no "č. —", so every case first
 * asserts the run entered the email step and the dispatch really enqueued a
 * send; each subject assertion pairs "the real value is here" with "the
 * placeholder is gone"; and one case asserts that a variable the event does
 * NOT carry still falls back to its default rather than leaking a raw {{tag}}.
 *
 * WHAT THIS TEST CANNOT SEE
 * - It does not run the worker process; it calls the two functions the worker
 *   calls, with the job the worker would receive.
 * - It does not send anything.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  contacts,
  sendingDomains,
  templates,
  workflows,
  workflowRuns,
} from '../db/schema/index.js';
import { workflowNodeStats } from '../db/schema/workflow-node-stats.js';
import { batchSenderTriggeredQueue } from '../lib/queues.js';
import { parseMergeTags, type MergeTagContext } from '@forgemsg/editor/render';
import { readCampaignContent } from '@forgemsg/editor/schema';

type Node = { id: string; type: string; config: Record<string, unknown> };

interface WorkerMergeContext {
  buildMergeContext: (
    contact: {
      email: string;
      firstName: string | null;
      lastName: string | null;
      customFields: Record<string, unknown>;
    },
    system?: Record<string, unknown>,
    tier?: string | null,
    mergeData?: Record<string, unknown>,
  ) => MergeTagContext;
}

const worker: WorkerMergeContext = (await import(
  pathToFileURL(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../workers/src/jobs/merge-context.ts',
    ),
  ).href
)) as unknown as WorkerMergeContext;

const TAG = `wfmerge-${randomUUID().slice(0, 8)}`;

let app: FastifyInstance;
let session: Session;
let contactId: string;
let sendingDomainId: string | undefined;
let templatesBefore: string[] = [];
const created: string[] = [];
const sendDomain = `${TAG}.example.invalid`;

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

type SendJob = {
  content: Record<string, unknown>;
  subject: string;
  mergeData?: Record<string, unknown>;
};

/** The job executeSendEmail put on the email queue for this run. */
async function queuedEmail(runId: string) {
  const { emailQueue } = await import('../lib/queues.js');
  const jobs = await emailQueue.getJobs(['waiting', 'delayed', 'active', 'completed'], 0, 300);
  return jobs
    .map((j) => j?.data as Record<string, unknown> | undefined)
    .filter((d) => d?.workflowRunId === runId)
    .at(-1);
}

/**
 * Job ids currently on the batch-sender queue.
 *
 * Nothing on a triggered send job identifies the run it came from — the
 * campaign id is the org id (workflow-dispatch.ts) — so the only way to tell
 * this case's job from the previous case's is to know which ids were already
 * there. Timestamps are not enough: several of these land inside one
 * millisecond, and then `.at(-1)` reads whichever the queue returns last.
 */
async function sendJobIds(): Promise<Set<string>> {
  const jobs = await batchSenderTriggeredQueue.getJobs(
    ['waiting', 'delayed', 'active', 'completed'],
    0,
    500,
  );
  return new Set(jobs.map((j) => String(j?.id)));
}

/** The one job the dispatch added since `before` was taken. */
async function queuedSend(before: Set<string>) {
  const jobs = await batchSenderTriggeredQueue.getJobs(
    ['waiting', 'delayed', 'active', 'completed'],
    0,
    500,
  );
  const added = jobs.filter((j) => j && !before.has(String(j.id)));
  expect(added.length, 'the dispatch added more than one send job').toBeLessThanOrEqual(1);
  return added[0]?.data as SendJob | undefined;
}

/** The merge context the worker builds for this job. */
function contextFor(job: SendJob): MergeTagContext {
  return worker.buildMergeContext(
    { email: `${TAG}@example.invalid`, firstName: 'Jana', lastName: 'Nováková', customFields: {} },
    {
      unsubscribeUrl: 'https://example.test/u/abc',
      preferenceCenterUrl: 'https://example.test/p/abc',
      currentDate: '2026-09-20',
      currentYear: '2026',
    },
    null,
    job.mergeData,
  );
}

/** The subject the recipient sees — the same call the worker makes. */
const renderSubject = (job: SendJob) => parseMergeTags(job.subject, contextFor(job));

/**
 * Start a workflow with an event payload and return the job it produced.
 *
 * The graph is trimmed to the trigger and one email step, so the run sends
 * immediately instead of parking on the wait in front of it. `pickSubject`
 * names which step: the text its configured subject must contain.
 */
async function runWithEvent(
  slug: string,
  eventData: Record<string, unknown>,
  pickSubject?: string,
) {
  const fork = await api('POST', `/api/v1/workflow-templates/${slug}/fork`, {
    name: `${TAG} ${slug} ${randomUUID().slice(0, 6)}`,
  });
  expect(fork.statusCode, fork.body).toBe(201);
  const workflowId = idOf(fork);
  created.push(workflowId);

  const [row] = await db
    .select({ nodes: workflows.nodes, edges: workflows.edges })
    .from(workflows)
    .where(eq(workflows.id, workflowId));
  const nodes = row!.nodes as Node[];
  const trigger = nodes.find((n) => n.type === 'trigger')!;
  const emails = nodes.filter((n) => n.type === 'send_email');
  const email = pickSubject
    ? emails.find((n) => String(n.config.subject ?? '').includes(pickSubject))
    : emails[0];
  expect(
    email,
    `template ${slug} has no email step whose subject has "${pickSubject}"`,
  ).toBeTruthy();
  await db
    .update(workflows)
    .set({
      nodes: [trigger, email!] as never,
      edges: [{ id: 'e0', source: trigger.id, target: email!.id }] as never,
      status: 'active',
    })
    .where(eq(workflows.id, workflowId));

  const before = await sendJobIds();
  const { startWorkflowRun } = await import('../services/workflows/executor.js');
  const run = await startWorkflowRun(workflowId, session.orgId, contactId, eventData);
  const [stored] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, run.id));
  expect(stored!.errorMessage, 'the run failed').toBeNull();

  // The run really went through the email step, rather than the assertions
  // below being about a send that never happened.
  const [stat] = await db
    .select({ entered: workflowNodeStats.entered })
    .from(workflowNodeStats)
    .where(
      and(eq(workflowNodeStats.workflowId, workflowId), eq(workflowNodeStats.nodeId, email!.id)),
    );
  expect(stat?.entered, 'the run never reached the email').toBe(1);

  // What the workflow-email worker does with the job it picks up: post it to
  // the internal dispatch, which resolves the template and enqueues the send.
  // No worker runs in this suite, so the hop is made here.
  const emailJob = await queuedEmail(run.id);
  expect(emailJob, 'nothing reached the email queue').toBeTruthy();
  const dispatched = await app.inject({
    method: 'POST',
    url: '/api/v1/internal/workflow/send-email',
    headers: { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' },
    payload: emailJob as Record<string, unknown>,
  });
  expect(dispatched.statusCode, dispatched.body).toBe(200);
  // The handler answers 200 for "skipped" too (no verified sending domain, no
  // contact email). Without this the queue read below would find nothing and
  // every assertion about rendered text would silently never run.
  expect(dispatched.json(), 'the dispatch did not enqueue a send').toEqual({
    data: { queued: true },
  });

  const job = await queuedSend(before);
  expect(job, 'nothing reached the batch-sender queue').toBeTruthy();
  return { workflowId, nodeId: email!.id, emailJob: emailJob!, job: job! };
}

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
      lastName: 'Nováková',
    })
    .returning({ id: contacts.id });
  contactId = c!.id;

  // The template path resolves its From address from the org's sending domains
  // (resolveOrgFrom in routes/v1/internal/workflow-dispatch.ts). Without one
  // the dispatch answers 200 with { skipped: 'no verified sending domain' }.
  const [dom] = await db
    .insert(sendingDomains)
    .values({
      orgId: session.orgId,
      domain: sendDomain,
      isVerified: true,
      dkimVerified: true,
      spfVerified: true,
    })
    .returning({ id: sendingDomains.id });
  sendingDomainId = dom!.id;

  // Templates the forks clone; only the ones this suite adds get removed.
  templatesBefore = (
    await db.select({ id: templates.id }).from(templates).where(eq(templates.orgId, session.orgId))
  ).map((r) => r.id);
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
  if (sendingDomainId)
    await db.delete(sendingDomains).where(eq(sendingDomains.id, sendingDomainId));
  // Only the clones the forks made here — the seed org's own templates belong
  // to whatever else runs in this database.
  const mine = (
    await db.select({ id: templates.id }).from(templates).where(eq(templates.orgId, session.orgId))
  )
    .map((r) => r.id)
    .filter((id) => !templatesBefore.includes(id));
  if (mine.length) await db.delete(templates).where(inArray(templates.id, mine));
  await app?.close();
}, 120_000);

describe('a templated workflow email renders the event it is about', () => {
  it('transactional-order-confirmation: order.id reaches the subject', async () => {
    const { job } = await runWithEvent(
      'transactional-order-confirmation',
      { order: { id: 'ORD-2026-0042', total: '1 299 Kč' } },
      '{{order.id}}',
    );

    // Step subject: "Order #{{order.id}} — receipt + delivery ETA"
    expect(renderSubject(job)).toBe('Order #ORD-2026-0042 — receipt + delivery ETA');
    // Before this change the tag resolved to nothing at all.
    expect(renderSubject(job), 'the gap is still there').not.toContain('Order # ');
  });

  it('ecom-price-drop-alert: two product.* variables reach one subject', async () => {
    const { job } = await runWithEvent(
      'ecom-price-drop-alert',
      { product: { name: 'Bialetti Moka Express', price: '899 Kč', id: 'SKU-77' } },
      '{{product.name}}',
    );

    // Step subject: "Price drop! {{product.name}} is now {{product.price}}"
    expect(renderSubject(job)).toBe('Price drop! Bialetti Moka Express is now 899 Kč');
  });

  it('cross-sell-category-affinity: a nested path (order.firstItem.category) resolves', async () => {
    const { job } = await runWithEvent(
      'cross-sell-category-affinity',
      { order: { firstItem: { category: 'Kávovary' } } },
      '{{order.firstItem.category}}',
    );

    // Step subject: "Customers who bought {{order.firstItem.category}} also love…"
    expect(renderSubject(job)).toBe('Customers who bought Kávovary also love…');
  });

  it('a variable the event does not carry does not leak a raw tag, and a default still wins', async () => {
    // The event names the product but not its price.
    const { job } = await runWithEvent(
      'ecom-price-drop-alert',
      { product: { name: 'Bialetti Moka Express' } },
      '{{product.name}}',
    );
    const subject = renderSubject(job);
    expect(subject).toBe('Price drop! Bialetti Moka Express is now ');
    expect(subject, 'a raw tag leaked into the subject').not.toMatch(/\{\{/);

    // The shipped Czech emails write their tags with a default. Same context,
    // same renderer — this is the text that reaches the recipient where the
    // event is silent. (Their bodies are a separate, older defect; see below.)
    const ctx = contextFor(job);
    expect(parseMergeTags('Objednávka {{order.number|default:"č. —"}} přijata', ctx)).toBe(
      'Objednávka č. — přijata',
    );
  });

  it('the system values are not overwritten by an event that names them', async () => {
    const { job } = await runWithEvent(
      'transactional-order-confirmation',
      {
        order: { id: 'ORD-2026-0045' },
        current_year: '1999',
        unsubscribe_url: 'https://evil.test/take-over',
        first_name: 'Podvodník',
      },
      '{{order.id}}',
    );
    const ctx = contextFor(job);
    // Rendered through the same function, so this is about output, not shape.
    expect(parseMergeTags('{{current_year}}', ctx)).toBe('2026');
    expect(parseMergeTags('{{unsubscribe_url}}', ctx)).toBe('https://example.test/u/abc');
    expect(parseMergeTags('{{first_name}}', ctx)).toBe('Jana');
    // And the event's own value still arrives where nothing else claims it.
    expect(renderSubject(job)).toBe('Order #ORD-2026-0045 — receipt + delivery ETA');
  });
});

describe('what already worked keeps working', () => {
  it('an inline-html step still substitutes in the API and carries no mergeData', async () => {
    const wf = await api('POST', '/api/v1/workflows', {
      name: `${TAG} inline`,
      triggerType: 'manual',
      nodes: [
        { id: 't', type: 'trigger', config: {} },
        {
          id: 'e1',
          type: 'send_email',
          config: { subject: 'Ahoj', html: '<p>Objednávka {{order_id}} pro {{first_name}}</p>' },
        },
      ],
      edges: [{ id: 'e0', source: 't', target: 'e1' }],
    });
    expect(wf.statusCode, wf.body).toBe(200);
    const workflowId = idOf(wf);
    created.push(workflowId);
    await db.update(workflows).set({ status: 'active' }).where(eq(workflows.id, workflowId));

    const { startWorkflowRun } = await import('../services/workflows/executor.js');
    const run = await startWorkflowRun(workflowId, session.orgId, contactId, {
      order: { orderId: 'OBJ-INLINE' },
    });
    const [stored] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, run.id));
    expect(stored!.errorMessage).toBeNull();

    const { emailQueue } = await import('../lib/queues.js');
    const jobs = await emailQueue.getJobs(['waiting', 'delayed', 'active', 'completed'], 0, 300);
    const mine = jobs
      .map((j) => j?.data as Record<string, unknown> | undefined)
      .filter((d) => d?.workflowRunId === run.id);
    expect(mine.length, 'the inline send did not reach the email queue').toBeGreaterThan(0);
    const job = mine.at(-1)!;
    // Already substituted here, and no merge data tags along.
    expect(String(job.html)).toContain('OBJ-INLINE');
    expect(String(job.html)).toContain('Jana');
    expect(job.mergeData).toBeUndefined();
  });

  it('a run with no event data at all still sends, and leaks no raw tag', async () => {
    const { job } = await runWithEvent('transactional-order-confirmation', {}, '{{order.id}}');
    expect(job.mergeData).toBeDefined();
    const subject = renderSubject(job);
    // Exactly what it rendered before this change — the run does not fail and
    // nothing new appears.
    expect(subject).toBe('Order # — receipt + delivery ETA');
    expect(subject).not.toMatch(/\{\{/);
  });
});

/**
 * The body is a separate, older defect — MEASURED, not assumed.
 *
 * batch-sender renderEmail() resolves the job's content through
 * readCampaignContent and renders blocks only when it parses as an EmailSchema.
 * For a templated workflow send it never does, for two reasons:
 *
 *  1. routes/v1/internal/workflow-dispatch.ts builds `{ blocks, globalStyles }`
 *     and leaves the subject out, while emailSchema requires `subject` (min 1).
 *  2. 20 of the 29 built-in emails the published workflow templates reference —
 *     every Czech one — carry a button whose url is a merge tag
 *     (`{{order.status_url|default:"#"}}`), and the block schema validates urls
 *     with z.string().url(), which rejects it.
 *
 * So renderEmail falls past the blocks path, finds no `html` either, and
 * returns JSON.stringify(content): the recipient's body is the raw block JSON
 * with the tags unsubstituted. Verified by running the worker's own renderEmail
 * over the content the dispatch produces.
 *
 * Neither cause is in this change's scope and neither is made worse by it, so
 * this case pins the shape down instead of pretending to render a body. When
 * the body is fixed, this case fails and says what to assert instead.
 */
describe('the body of a templated send does not render yet (pre-existing)', () => {
  it('the job content does not parse as an EmailSchema, and says why', async () => {
    const { job } = await runWithEvent('post-purchase-cs', {
      order: { number: 'OBJ-2026-0046' },
    });

    const parsed = readCampaignContent(job.content);
    expect(parsed.shape).toBe('blocks');
    expect(
      parsed.schema,
      'the body renders now — remove this case and assert the rendered html instead',
    ).toBeNull();
    expect(parsed.error).toContain('subject');
    expect(parsed.error).toContain('Invalid url');
    // And this is why the Czech templates cannot be the proof: their steps
    // carry a fixed subject with no tag in it, so the only variable text they
    // have is in the body that does not render.
    expect(job.subject).toBe('Objednávka přijata');
    expect(renderSubject(job)).toBe('Objednávka přijata');
  });
});
