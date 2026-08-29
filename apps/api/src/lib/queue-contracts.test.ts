/**
 * Queue payload contracts — the test that closes the class.
 *
 * ── If this test just failed on your new producer ───────────────────────────
 *
 * You added something that puts a job on the `email`, `sms` or `viber-send`
 * queue. Those queues are consumed by a different process, so their payload is
 * an API, and the consumer's schema in ./queue-contracts.ts is that API's
 * definition. To make this test pass:
 *
 *   1. Enqueue through `enqueueValidated(queue, queueName, jobName, payload)`
 *      instead of calling `queue.add(...)` yourself. The "no producer bypasses
 *      the contract" test below scans for the bypass and is what fails first.
 *   2. Make the payload satisfy the schema. If a required field has no source
 *      in your caller, that is the finding — do not invent a default to get
 *      green. An empty body or a stand-in template turns a broken send into a
 *      silent wrong send, which is worse and is exactly what this file exists
 *      to prevent. Fail loudly and raise the missing input instead.
 *   3. If the payload genuinely cannot fit the consumer, you are on the wrong
 *      queue: that consumer cannot process your job. Route it somewhere that
 *      can (see `executeInternalNotification`, which was moved off this queue
 *      for exactly that reason) rather than relaxing the schema.
 *
 * Do NOT restate a schema in this file. The point of the test is to compare a
 * producer against the definition the consumer actually parses with; a copy
 * here would be a record of what the contract used to be and would agree with
 * itself forever.
 *
 * ── What is and is not covered ──────────────────────────────────────────────
 *
 * The first group drives the real producers and parses what they emit, so it
 * checks the payloads end to end. The sequence producers are driven through
 * `processDueSequenceSteps`, which swallows step errors — the assertion there
 * is that the step reports as processed AND the captured payload parses, so a
 * contract failure cannot hide in that catch.
 *
 * The scan test is what covers producers nobody has written yet: it is
 * pattern-based (it knows the three receiver shapes this repo uses), so it
 * catches a copy-pasted bypass, not an arbitrarily disguised one. Runtime
 * validation in `enqueueValidated` is the backstop for everything else.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { QUEUE_CONTRACTS, enqueueValidated, QueueContractError } from './queue-contracts.js';
import { SCAN_TIMEOUT_MS } from '../test-support/scan-budget.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const emailAdd = vi.fn().mockResolvedValue({});
const smsAdd = vi.fn().mockResolvedValue({});
const viberAdd = vi.fn().mockResolvedValue({});
const sendTransactionalEmail = vi.fn().mockResolvedValue('msg-1');

vi.mock('./queues.js', () => ({
  queues: {
    email: { add: emailAdd },
    sms: { add: smsAdd },
    viber: { add: viberAdd },
  },
  sendTransactionalEmail,
}));

const mockDb: Record<string, unknown> = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue([]),
  returning: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  execute: vi.fn().mockResolvedValue({ rows: [] }),
};
vi.mock('../db/client.js', () => ({ db: mockDb }));

vi.mock('@forgemsg/shared/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn(),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn(),
  },
}));

/** Column stand-ins: drizzle helpers tolerate strings, the query never runs. */
const columns = new Proxy(
  {},
  { get: (_t, p) => (typeof p === 'symbol' ? undefined : String(p)) },
) as Record<string, string>;
vi.mock(
  '../db/schema/index.js',
  () =>
    new Proxy(
      {},
      {
        get: (_t, p) => (p === 'then' || typeof p === 'symbol' ? undefined : columns),
        // Vitest verifies that a named import exists on the mock, so the proxy
        // has to answer `in` and property-descriptor lookups too, not just get.
        has: () => true,
        getOwnPropertyDescriptor: () => ({
          configurable: true,
          enumerable: true,
          value: columns,
        }),
      },
    ),
);

vi.mock('../services/frequency-capping/index.js', () => ({
  checkFrequencyCap: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock('../services/sending/from-domain.js', () => ({
  assertFromDomainOwned: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/reviews-v2/index.js', () => ({
  createReviewRequest: async () => ({ token: 'tok-123' }),
}));
vi.mock('../services/crm/one-to-one-email.js', () => ({
  buildMergeVars: () => ({}),
  substitutePersonalMergeTags: (s: string) => s,
  buildPersonalHtml: (s: string) => `<p>${s}</p>`,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG = '11111111-1111-4111-8111-111111111111';
const CONTACT = '22222222-2222-4222-8222-222222222222';
const RUN = '33333333-3333-4333-8333-333333333333';

const contact = {
  id: CONTACT,
  orgId: ORG,
  firstName: 'Jana',
  lastName: 'Nováková',
  email: 'jana@example.test',
  phone: '+420777123456',
  tags: [] as string[],
  customFields: {},
};

function makeRun() {
  return {
    id: RUN,
    orgId: ORG,
    contactId: CONTACT,
    workflowId: '44444444-4444-4444-8444-444444444444',
    status: 'running',
    data: {},
    converted: false,
  } as never;
}

const ctx = { orgId: ORG, contact } as never;

beforeEach(() => {
  emailAdd.mockClear();
  smsAdd.mockClear();
  viberAdd.mockClear();
  sendTransactionalEmail.mockClear();
});

// ─── 1. Real producers, real payloads ─────────────────────────────────────────

describe('workflow send actions satisfy their consumer contract', () => {
  /**
   * Each case names the queue the action produces into and a node config that
   * a workflow author could legitimately save. The assertion is deliberately
   * not "the action returned next" — an action can report success and still
   * have enqueued a payload its consumer rejects, which is the whole bug class.
   */
  const cases = [
    {
      name: 'send_email → email',
      queue: 'email' as const,
      spy: () => emailAdd,
      node: {
        id: 'n1',
        type: 'send_email',
        config: { subject: 'Ahoj {{first_name}}', html: '<p>Dobrý den</p>' },
      },
    },
    {
      name: 'send_personal_email → email',
      queue: 'email' as const,
      spy: () => emailAdd,
      node: {
        id: 'n2',
        type: 'send_personal_email',
        config: { fromEmail: 'rep@example.test', subject: 'Krátký dotaz', body: 'Dobrý den,' },
      },
    },
    {
      name: 'send_sms → sms',
      queue: 'sms' as const,
      spy: () => smsAdd,
      node: { id: 'n3', type: 'send_sms', config: { message: 'Zpráva' } },
    },
    {
      name: 'send_viber → viber-send',
      queue: 'viber-send' as const,
      spy: () => viberAdd,
      node: { id: 'n4', type: 'send_viber', config: { body: 'Zpráva' } },
    },
  ];

  it.each(cases)('$name', async ({ queue, spy, node }) => {
    const { executeAction } = await import('../services/workflows/actions.js');
    const result = await executeAction(node as never, makeRun(), ctx);

    expect(result.type, `action errored: ${JSON.stringify(result)}`).not.toBe('error');
    expect(spy(), 'producer enqueued nothing').toHaveBeenCalledTimes(1);

    const [, payload] = spy().mock.calls[0]!;
    const parsed = QUEUE_CONTRACTS[queue].safeParse(payload);
    expect(
      parsed.success ? '' : JSON.stringify(parsed.error.issues),
      `payload for ${queue} does not satisfy the consumer contract`,
    ).toBe('');
  });
});

// ─── 1b. A producer that had to leave the queue ───────────────────────────────

describe('internal_notification', () => {
  /**
   * This one could not be made to fit. It emails a colleague at an arbitrary
   * address; the 'email' queue's consumer is a single-contact send that
   * resolves its recipient from contactId. Forcing the run's contactId in
   * would have delivered an internal alert to the customer. The fix was to
   * take it off the queue, not to bend either side.
   */
  const node = {
    id: 'n5',
    type: 'internal_notification',
    config: { to: 'ops@example.test', subject: 'Lead {{first_name}}', body: 'Ozvi se.' },
  };

  it('does not enqueue onto the email queue at all', async () => {
    const { executeAction } = await import('../services/workflows/actions.js');
    const { env } = await import('../config/env.js');
    const result = await executeAction(node as never, makeRun(), ctx);

    expect(result.type).toBe('next');
    expect(
      emailAdd,
      'internal notifications belong on the transactional path',
    ).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail.mock.calls[0]![0]).toMatchObject({
      to: 'ops@example.test',
      from: env.SYSTEM_EMAIL_FROM,
    });
  });

  /**
   * This used to read `process.env.SYSTEM_EMAIL_FROM ?? process.env.DOI_FROM_EMAIL`
   * and return an error result when both were absent — a runtime check, on one
   * of thirteen call sites, for a condition the other twelve answered with a
   * committed fallback instead.
   *
   * The sender is now a required field in config/env.ts, so "no sender
   * configured" cannot be reached at run time: the process does not start. The
   * old branch was deleted rather than left as unreachable code, and what
   * remains to pin is that the action takes the sender from the validated
   * config and from nowhere else.
   */
  it('takes its sender from validated config, not from a raw env read', async () => {
    const { executeAction } = await import('../services/workflows/actions.js');
    const { env } = await import('../config/env.js');
    await executeAction(node as never, makeRun(), ctx);

    const sent = sendTransactionalEmail.mock.calls[0]![0] as { from: string; fromName: string };
    expect(sent.from).toBe(env.SYSTEM_EMAIL_FROM);
    expect(sent.fromName).toBe(env.SYSTEM_EMAIL_FROM_NAME);
    expect(sent.from, 'an empty From is what the old ?? produced on a set-but-empty var').not.toBe(
      '',
    );
  });
});

// ─── 1c. The producer that used to swallow its own failure ───────────────────

describe('send_review_request reports an enqueue failure', () => {
  /**
   * This action reached the queue through a local alias and ended both branches
   * in `.catch(() => {})`, so a refused enqueue returned `next` and the run
   * recorded a message the contact never got. The swallow is gone — it goes
   * through enqueueOrFail like every other send — but nothing pinned that, so
   * putting it back would have been silent. This is that pin.
   *
   * The payload this action builds is valid today (the email branch always
   * fills `html` from a default), so the failure has to come from the queue
   * refusing, which is what a contract violation would look like at run time.
   */
  const node = {
    id: 'n6',
    type: 'send_review_request',
    config: { channel: 'email', subject: 'How was your order?' },
  };

  it('surfaces the failure instead of returning next', async () => {
    emailAdd.mockRejectedValueOnce(new Error('queue refused the job'));

    const { executeAction } = await import('../services/workflows/actions.js');
    const result = await executeAction(node as never, makeRun(), ctx);

    expect(result.type, 'a refused enqueue was reported as success').toBe('error');
    expect((result as { message: string }).message).toContain('queue refused the job');
  });

  it('still returns next when the enqueue succeeds', async () => {
    const { executeAction } = await import('../services/workflows/actions.js');
    const result = await executeAction(node as never, makeRun(), ctx);

    expect(result.type).toBe('next');
    expect(emailAdd).toHaveBeenCalledTimes(1);
  });
});

// ─── 2. Sequence producers ────────────────────────────────────────────────────

describe('sales sequence steps satisfy their consumer contract', () => {
  function primeDbForStep(stepType: 'email' | 'sms') {
    const enrollment = {
      id: '55555555-5555-4555-8555-555555555555',
      orgId: ORG,
      contactId: CONTACT,
      sequenceId: '66666666-6666-4666-8666-666666666666',
      currentStepIndex: 0,
      senderEmail: 'rep@example.test',
      senderName: 'Rep',
      status: 'active',
    };
    const sequence = {
      id: enrollment.sequenceId,
      active: true,
      steps: [
        stepType === 'email'
          ? { type: 'email', config: { subject: 'Předmět', body: 'Text' }, delayDays: 1 }
          : { type: 'sms', config: { message: 'Zpráva' }, delayDays: 1 },
      ],
    };
    (mockDb.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([enrollment]) // due enrollments
      .mockResolvedValueOnce([sequence]) // sequence lookup
      .mockResolvedValueOnce([contact]); // contact lookup
  }

  it('sequence email step → email', async () => {
    primeDbForStep('email');
    const { processDueSequenceSteps } = await import('../services/crm/sales-sequences.js');
    const res = await processDueSequenceSteps({ limit: 1 });

    // processDueSequenceSteps catches step errors; a contract failure would
    // throw inside the step and leave processed at 0.
    expect(res.processed, 'the step threw — most likely a contract violation').toBe(1);
    expect(emailAdd).toHaveBeenCalledTimes(1);

    const [, payload] = emailAdd.mock.calls[0]!;
    const parsed = QUEUE_CONTRACTS.email.safeParse(payload);
    expect(parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe('');
  });

  it('sequence sms step → sms', async () => {
    primeDbForStep('sms');
    const { processDueSequenceSteps } = await import('../services/crm/sales-sequences.js');
    const res = await processDueSequenceSteps({ limit: 1 });

    expect(res.processed, 'the step threw — most likely a contract violation').toBe(1);
    expect(smsAdd).toHaveBeenCalledTimes(1);

    const [, payload] = smsAdd.mock.calls[0]!;
    const parsed = QUEUE_CONTRACTS.sms.safeParse(payload);
    expect(parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe('');
  });
});

// ─── 3. The gate itself ───────────────────────────────────────────────────────

describe('enqueueValidated', () => {
  it('refuses a payload the consumer would reject, and does not enqueue it', async () => {
    const add = vi.fn();
    await expect(
      // An email job with a contact but no campaign, template or html — the
      // exact shape cascade-email used to produce.
      enqueueValidated({ add }, 'email', 'probe', { orgId: ORG, contactId: CONTACT }),
    ).rejects.toBeInstanceOf(QueueContractError);
    expect(add, 'an invalid job reached Redis').not.toHaveBeenCalled();
  });

  it('names the offending field', async () => {
    const add = vi.fn();
    const err = await enqueueValidated({ add }, 'sms', 'probe', {
      orgId: ORG,
      contactId: CONTACT,
      phone: '+420777123456',
    }).catch((e: Error) => e);
    expect((err as Error).message).toContain('message');
  });

  it('enqueues a valid payload unchanged, keeping correlation fields', async () => {
    const add = vi.fn().mockResolvedValue({});
    await enqueueValidated({ add }, 'sms', 'probe', {
      orgId: ORG,
      contactId: CONTACT,
      phone: '+420777123456',
      message: 'Zpráva',
      workflowRunId: RUN,
    });
    expect(add).toHaveBeenCalledWith(
      'probe',
      expect.objectContaining({ message: 'Zpráva', workflowRunId: RUN }),
    );
  });
});

// ─── 4. Producers reach the queue the usual way ───────────────────────────────
//
// ── What this is NOT ────────────────────────────────────────────────────────
//
// This is not the barrier. It cannot be: it matches four receiver shapes with
// regexes, and a producer that names its variable something else walks past it.
// That is not hypothetical — all four patterns were run against
// `const q = queues.email; await q.add(…)` and none of them matched, which is
// why the enforcement moved into the queue object (guardQueue in
// ./queue-contracts.ts). A payload that does not satisfy its consumer's schema
// now throws at `.add()` however the queue was reached, and that is what
// actually holds the line.
//
// The fourth pattern (`alias.email?.add(`) came in separately and does widen
// the net — it catches an aliased *map*, `const q = queues; q.email?.add(…)`.
// It does not catch an aliased *queue*, which is the case above. Widening it
// further is the losing half of this: see the last paragraph.
//
// ── Why it stays anyway ─────────────────────────────────────────────────────
//
// The guard fails when the producer runs. Some producers run rarely — a
// cascade step, a sequence that nobody has enrolled anyone into this week — so
// "it throws in production eventually" is a slower feedback loop than "CI is
// red on the pull request". This scan catches the ordinary case, which is
// somebody copying an existing producer, before it ships.
//
// Treat a green run here as "nothing obvious was copied", never as "no
// producer can bypass the contract". Do not try to close the gap by making the
// regexes cleverer; that race is not winnable and the queue object already
// wins it.

describe('producers reach the queue the usual way', () => {
  /**
   * The three receiver shapes this repo uses to reach a contracted queue.
   * A new producer copy-pasting any of them, instead of calling
   * enqueueValidated, fails here — anything else is the guard's job.
   */
  const BYPASS_PATTERNS: Array<{ label: string; re: RegExp }> = [
    {
      label: 'emailQueue.add( / smsQueue.add( / viberQueue.add(',
      re: /\b(email|sms|viber)Queue\s*\??\.\s*add\s*\(/,
    },
    {
      label: 'queues.email.add( / queues.sms.add( / queues.viber.add(',
      re: /queues\s*\.\s*(email|sms|viber)\s*\??\.\s*add\s*\(/,
    },
    {
      label: ').email ?.add( — the cast-then-index shape',
      re: /\)\s*\.\s*(email|sms|viber)\s*\r?\n?\s*\??\.\s*add\s*\(/,
    },
    {
      // A queue reached through a local alias — `const q = queues as ...; q.email?.add(`.
      // The plain identifier receiver slips past the `queues.`-anchored shape above,
      // which is exactly how the review-request node bypassed the gate.
      label: 'alias.email ?.add( — any identifier receiver',
      re: /\b\w+\s*\.\s*(email|sms|viber)\s*\??\.\s*add\s*\(/,
    },
  ];

  /** Comments describe the bug; they are not the bug. */
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  }

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        walk(full, out);
      } else if (entry.endsWith('.ts') && !entry.includes('.test.')) {
        out.push(full);
      }
    }
    return out;
  }

  /**
   * Same wall-clock exposure as the AST scan in unsubscribe-single-writer:
   * this reads the same 967-file, 5.4 MB corpus (measured: walk 18 ms, read
   * 570 ms, regex 28 ms). Cheap on its own at 1.9 s inside the suite, but it
   * reached 5.5 s on a loaded machine against a 10 s global limit, so it is
   * on the same trajectory and gets the same explicit budget rather than
   * waiting to become flaky as the repo grows.
   */
  it(
    'every enqueue onto email/sms/viber-send goes through enqueueValidated',
    () => {
      const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
      const offenders: string[] = [];

      for (const file of walk(root)) {
        // The helper itself is the one place allowed to call queue.add for a
        // contracted queue — that call IS the gate.
        if (file.endsWith('queue-contracts.ts')) continue;
        const src = stripComments(readFileSync(file, 'utf8'));
        for (const { label, re } of BYPASS_PATTERNS) {
          if (re.test(src)) {
            offenders.push(`${file.slice(root.length)} — ${label}`);
          }
        }
      }

      expect(
        offenders,
        'These producers reach a contracted queue directly. Route them through ' +
          'enqueueValidated() so their payload is checked against the consumer schema.',
      ).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );
});
