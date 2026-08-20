/**
 * Payload contracts for the BullMQ queues whose consumer lives in another
 * process (apps/workers).
 *
 * Why this file exists
 * ────────────────────
 * A queue is an API between two processes, but until now only one side wrote
 * the contract down. The consumers validated (or merely *typed*) their input;
 * the producers hand-built object literals and `.add()`-ed them. Nothing
 * compared the two, so a producer could ship a payload the consumer rejects
 * and the only symptom was a job failing in a worker log — after the workflow
 * run had already reported success. Six such mismatches were live at once
 * (docs/audit/UNWIRED-2026-08-19.md, průchod 1).
 *
 * The rule this file enforces: **the consumer's schema is the contract, and
 * every producer is validated against it before the job is enqueued.**
 * A mismatch now fails at `.add()` time, in the producer's own call stack,
 * with the offending field named — instead of silently in a worker.
 *
 * These schemas are the ONE definition. `routes/v1/internal/workflow-dispatch.ts`
 * parses request bodies with them, `apps/workers/src/jobs/viber-sender.ts`
 * parses job data with them, and `queue-contracts.test.ts` drives the real
 * producers and parses what they emit with them. There is deliberately no copy
 * anywhere — a copy is a record of what the contract *was*.
 *
 * ── Adding a producer to one of these queues ────────────────────────────────
 * Build the payload, then enqueue it through `enqueueValidated()`. Do not call
 * `queue.add()` directly for `email`, `sms` or `viber-send`; the contract test
 * scans the source for that and fails.
 *
 * ── Changing a contract ─────────────────────────────────────────────────────
 * Change the schema here and fix every producer the test then reports. Do not
 * relax a schema to make a producer fit: the consumer is what actually has to
 * process the job, and a field it cannot use is not made usable by `.optional()`.
 */

import { z } from 'zod';

/**
 * `email` queue → apps/workers `workflow-email-sender` → POST
 * /api/v1/internal/workflow/send-email.
 *
 * The consumer resolves the recipient from `contactId` (it is a single-contact
 * triggered send), then needs somewhere to get content from: a campaign, a
 * template, or inline html. The `refine` states that last requirement, which
 * the handler has always enforced at runtime — expressing it in the schema is
 * what lets a producer be checked without booting Fastify and a database.
 */
export const workflowEmailJobSchema = z
  .object({
    orgId: z.string().uuid(),
    contactId: z.string().uuid(),
    campaignId: z.string().uuid().optional(),
    templateId: z.string().uuid().optional(),
    subject: z.string().optional(),
    html: z.string().optional(),
    text: z.string().optional(),
  })
  .refine((b) => Boolean(b.campaignId || b.templateId || b.html), {
    message: 'campaignId, templateId or html required — the send has no content otherwise',
  });

/**
 * `sms` queue → apps/workers `workflow-sms-sender` → POST
 * /api/v1/internal/workflow/send-sms.
 */
export const workflowSmsJobSchema = z.object({
  orgId: z.string().uuid(),
  contactId: z.string().uuid(),
  phone: z.string().min(3),
  message: z.string().min(1),
  // Set for bulk SMS campaigns — flags the send as marketing (consent +
  // quiet-hours gate) and attributes the delivery to the campaign.
  campaignId: z.string().uuid().optional(),
  workflowId: z.string().uuid().optional(),
});

/**
 * `viber-send` queue → apps/workers `viber-sender`.
 *
 * `phone` is the recipient the adapter sends to and `type` is the content
 * discriminator it switches on; a job without either reaches the provider as
 * a message to nobody. Both were previously only expressed as a TypeScript
 * interface, which is erased at runtime and so validated nothing.
 *
 * `body` may be empty (a template send carries its text provider-side), but it
 * must be present — the adapter reads it unconditionally.
 */
export const viberSendJobSchema = z.object({
  orgId: z.string().uuid(),
  contactId: z.string().uuid(),
  phone: z.string().min(3),
  body: z.string(),
  type: z.enum(['text', 'picture', 'video', 'file', 'action']),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  mediaUrl: z.string().optional(),
  actionUrl: z.string().optional(),
  actionText: z.string().optional(),
  sender: z.string().optional(),
  ttl: z.number().optional(),
  campaignId: z.string().uuid().optional(),
  workflowRunId: z.string().uuid().optional(),
  templateId: z.string().optional(),
  provider: z.enum(['infobip', 'rakuten', 'messagebird']).optional(),
});

/**
 * Every cross-process queue that has a payload contract, keyed by the queue
 * name as it exists in Redis. The contract test iterates this map; adding a
 * queue here is what puts it under the guard.
 */
export const QUEUE_CONTRACTS = {
  email: workflowEmailJobSchema,
  sms: workflowSmsJobSchema,
  'viber-send': viberSendJobSchema,
} as const;

export type ContractedQueue = keyof typeof QUEUE_CONTRACTS;

/** Channel key in `lib/queues.ts`'s `queues` map → queue name in Redis. */
export const CHANNEL_TO_QUEUE = {
  email: 'email',
  sms: 'sms',
  viber: 'viber-send',
} as const satisfies Record<string, ContractedQueue>;

export type ContractedChannel = keyof typeof CHANNEL_TO_QUEUE;

/** Thrown by `enqueueValidated` when a payload does not satisfy its contract. */
export class QueueContractError extends Error {
  constructor(
    readonly queue: ContractedQueue,
    readonly jobName: string,
    readonly issues: string,
  ) {
    super(`${queue}/${jobName}: payload does not satisfy the consumer contract — ${issues}`);
    this.name = 'QueueContractError';
  }
}

/** Render zod issues as one line, so the message is useful in a log. */
export function formatIssues(err: z.ZodError): string {
  return err.issues
    .map((i) => {
      const path = i.path.join('.');
      return path ? `${path}: ${i.message}` : i.message;
    })
    .join('; ');
}

/**
 * Validate a payload against its consumer's contract and enqueue it.
 *
 * Throws `QueueContractError` on mismatch rather than enqueuing — an invalid
 * job is not worth the round trip through Redis to fail in a worker, and the
 * producer's stack is where the bug actually is.
 */
export function assertContract(
  queueName: ContractedQueue,
  jobName: string,
  payload: unknown,
): void {
  const parsed = QUEUE_CONTRACTS[queueName].safeParse(payload);
  if (!parsed.success) {
    throw new QueueContractError(queueName, jobName, formatIssues(parsed.error));
  }
}

export async function enqueueValidated(
  queue: { add: (name: string, data: unknown) => Promise<unknown> },
  queueName: ContractedQueue,
  jobName: string,
  payload: unknown,
): Promise<void> {
  // Still validates here rather than leaning on the guarded queue below. The
  // guard covers the real queues; this covers the case where `queue` is
  // something else — a test double, a hand-rolled object — where dropping the
  // check would quietly make this function a plain `.add`. When the queue IS
  // guarded the same pure check runs twice on the same payload, which costs a
  // parse and cannot change the outcome or the message.
  assertContract(queueName, jobName, payload);
  // Enqueue the payload as given, not `parsed.data`: zod strips unknown keys,
  // and producers legitimately carry correlation fields (workflowRunId,
  // sequenceEnrollmentId) that the contract does not describe but that are
  // worth having in the job when reading a worker log.
  await queue.add(jobName, payload);
}

/** The shape of a BullMQ `addBulk` job, narrowed to what the guard reads. */
interface BulkJobLike {
  name: string;
  data: unknown;
}

/**
 * Make a queue enforce its own contract.
 *
 * Validation used to live in `enqueueValidated`, which meant it applied only
 * when a producer chose to call it. A producer that got hold of the queue by
 * any other route — the named export, a local alias, `addBulk` instead of
 * `add` — skipped both the check and the source scan that was supposed to
 * notice. Measured: `const q = queues.email; await q.add(...)` passed both.
 *
 * So the check moves into the object. `add` and `addBulk` are replaced on the
 * instance itself, non-writable and non-configurable, so the only way to reach
 * the unguarded implementation is to go through the prototype deliberately.
 * There is no unguarded reference to hold: the raw `new Queue(...)` is passed
 * straight in here and never bound to a name.
 *
 * Only the three contracted queues are wrapped. Every other queue in this
 * module is the plain BullMQ object it always was — no validation, no changed
 * types, no added call cost.
 */
export function guardQueue<Q extends object>(queue: Q, queueName: ContractedQueue): Q {
  // Returned as `Q`, so callers keep the exact BullMQ Queue type they had —
  // this changes what the object does, never what it is. The narrowing below is
  // local: pinning add/addBulk in the signature instead would fight BullMQ's
  // own JobsOptions on the way in.
  const q = queue as unknown as {
    add: (name: string, data: unknown, opts?: unknown) => Promise<unknown>;
    addBulk?: (jobs: BulkJobLike[]) => Promise<unknown>;
  };
  const rawAdd = q.add.bind(q);
  const rawAddBulk = typeof q.addBulk === 'function' ? q.addBulk.bind(q) : undefined;

  Object.defineProperty(queue, 'add', {
    value: async (name: string, data: unknown, opts?: unknown): Promise<unknown> => {
      assertContract(queueName, name, data);
      return rawAdd(name, data, opts);
    },
    writable: false,
    configurable: false,
    enumerable: false,
  });

  if (rawAddBulk) {
    Object.defineProperty(queue, 'addBulk', {
      value: async (jobs: BulkJobLike[]): Promise<unknown> => {
        // Every job, not just the first: a bulk enqueue that is half-valid is
        // the same bug as a single invalid one, and it fails before any of the
        // batch reaches Redis rather than partway through.
        for (const job of jobs) assertContract(queueName, job.name, job.data);
        return rawAddBulk(jobs);
      },
      writable: false,
      configurable: false,
      enumerable: false,
    });
  }

  return queue;
}
