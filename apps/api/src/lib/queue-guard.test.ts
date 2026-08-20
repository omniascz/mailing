/**
 * The contract is enforced by the queue, not by the caller remembering to ask.
 *
 * `enqueueValidated` only ever applied when a producer chose to call it. A
 * producer that reached the queue another way — the named export, a local
 * alias, `addBulk` instead of `add` — skipped the check, and the source scan
 * that was supposed to catch that only recognises the receiver shapes it was
 * written for. Both were measured to miss `const q = queues.email; q.add(…)`.
 *
 * These tests pin the replacement: the check lives on the queue object, so it
 * runs however the object is reached, and it is installed on the three
 * contracted queues only.
 *
 * `bullmq` is stubbed so this exercises the real wiring in lib/queues.ts — which
 * queues get guarded and which do not — without a Redis connection.
 */

import { describe, it, expect, vi } from 'vitest';

/** Minimal stand-in for BullMQ's Queue: add/addBulk live on the prototype, as they do in the real class. */
class FakeQueue {
  readonly added: Array<{ name: string; data: unknown }> = [];
  constructor(
    readonly name: string,
    readonly opts?: unknown,
  ) {}
  async add(name: string, data: unknown): Promise<unknown> {
    this.added.push({ name, data });
    return { id: '1' };
  }
  async addBulk(jobs: Array<{ name: string; data: unknown }>): Promise<unknown> {
    for (const j of jobs) this.added.push(j);
    return jobs.map(() => ({ id: '1' }));
  }
}
vi.mock('bullmq', () => ({ Queue: FakeQueue }));

const ORG = '11111111-1111-4111-8111-111111111111';
const CONTACT = '22222222-2222-4222-8222-222222222222';

/** Valid for `sms`; missing `message`, so invalid for the contract. */
const INCOMPLETE_SMS = { orgId: ORG, contactId: CONTACT, phone: '+420777123456' };

describe('the guard is on the queue object', () => {
  it('rejects the bypass that used to succeed: a locally aliased queue', async () => {
    const { queues } = await import('./queues.js');
    const { QueueContractError } = await import('./queue-contracts.js');

    // Verbatim the shape that passed both the old runtime check and the scan.
    const q = (
      queues as unknown as Record<string, { add: (n: string, d: unknown) => Promise<unknown> }>
    ).email!;

    await expect(q.add('probe-bypass', { orgId: ORG, contactId: CONTACT })).rejects.toBeInstanceOf(
      QueueContractError,
    );
  });

  it('rejects an aliased addBulk too — bulk was never covered at all', async () => {
    const { smsQueue } = await import('./queues.js');
    const { QueueContractError } = await import('./queue-contracts.js');

    const bulk = smsQueue as unknown as {
      addBulk: (jobs: Array<{ name: string; data: unknown }>) => Promise<unknown>;
      added: unknown[];
    };
    const before = bulk.added.length;

    await expect(
      bulk.addBulk([
        { name: 'ok', data: { ...INCOMPLETE_SMS, message: 'ahoj' } },
        { name: 'bad', data: INCOMPLETE_SMS },
      ]),
    ).rejects.toBeInstanceOf(QueueContractError);

    // Nothing from a half-valid batch reaches the queue.
    expect(bulk.added.length, 'a partly-valid batch was partly enqueued').toBe(before);
  });

  it('names the queue, the job and the missing field', async () => {
    const { queues } = await import('./queues.js');
    const q = (
      queues as unknown as Record<string, { add: (n: string, d: unknown) => Promise<unknown> }>
    ).sms!;
    const err = (await q.add('probe-bypass', INCOMPLETE_SMS).catch((e: Error) => e)) as Error;
    expect(err.message).toBe(
      'sms/probe-bypass: payload does not satisfy the consumer contract — message: Required',
    );
  });

  it('cannot be removed by reassigning add', async () => {
    const { emailQueue } = await import('./queues.js');
    const target = emailQueue as unknown as { add: unknown };
    expect(() => {
      target.add = async () => ({ id: 'x' });
    }).toThrow();
  });

  it('lets a valid payload through unchanged', async () => {
    const { smsQueue } = await import('./queues.js');
    const q = smsQueue as unknown as {
      add: (n: string, d: unknown) => Promise<unknown>;
      added: Array<{ name: string; data: unknown }>;
    };
    const payload = {
      ...INCOMPLETE_SMS,
      message: 'ahoj',
      workflowRunId: '33333333-3333-4333-8333-333333333333',
    };
    await q.add('workflow-sms', payload);
    // Enqueued as given: the correlation field the schema does not describe survives.
    expect(q.added.at(-1)).toEqual({ name: 'workflow-sms', data: payload });
  });
});

describe('the guard is only on the three contracted queues', () => {
  it('an uncontracted queue accepts a payload a contracted one rejects', async () => {
    const { queues } = await import('./queues.js');
    const map = queues as unknown as Record<
      string,
      { add: (n: string, d: unknown) => Promise<unknown>; added: unknown[] }
    >;

    // Same payload, both queues. The contracted one refuses it…
    await expect(map.sms!.add('probe', INCOMPLETE_SMS)).rejects.toThrow();
    // …the uncontracted one takes it, exactly as before this change.
    await expect(map.whatsapp!.add('probe', INCOMPLETE_SMS)).resolves.toBeDefined();
    await expect(map.push!.add('probe', INCOMPLETE_SMS)).resolves.toBeDefined();
    await expect(map.webhook!.add('probe', INCOMPLETE_SMS)).resolves.toBeDefined();
    await expect(map.mtaOther!.add('probe', INCOMPLETE_SMS)).resolves.toBeDefined();
  });

  it('leaves uncontracted queues structurally untouched', async () => {
    const mod = await import('./queues.js');
    const own = (q: object) => Object.getOwnPropertyDescriptor(q, 'add') !== undefined;

    // Guarded: `add` is an own, non-writable property shadowing the prototype.
    for (const q of [mod.emailQueue, mod.smsQueue, mod.viberQueue]) {
      expect(own(q)).toBe(true);
      expect(Object.getOwnPropertyDescriptor(q, 'add')!.writable).toBe(false);
    }
    // Untouched: `add` is still only the prototype method.
    for (const q of [
      mod.webhookQueue,
      mod.rcsQueue,
      mod.whatsappQueue,
      mod.pushQueue,
      mod.mobilePushQueue,
      mod.voiceQueue,
      mod.campaignSplitterQueue,
      mod.batchSenderTriggeredQueue,
      mod.mtaOtherQueue,
    ]) {
      expect(own(q)).toBe(false);
    }
  });
});

describe('enqueueValidated on a guarded queue', () => {
  it('validates twice without changing the outcome or the message', async () => {
    const { smsQueue } = await import('./queues.js');
    const { enqueueValidated, guardQueue } = await import('./queue-contracts.js');

    // Through the guarded queue: enqueueValidated checks, then the queue checks.
    const viaGuarded = (await enqueueValidated(
      smsQueue as never,
      'sms',
      'probe',
      INCOMPLETE_SMS,
    ).catch((e: Error) => e)) as Error;

    // Through an unguarded double: only enqueueValidated checks.
    const plain = { add: async () => ({ id: '1' }) };
    const viaPlain = (await enqueueValidated(plain, 'sms', 'probe', INCOMPLETE_SMS).catch(
      (e: Error) => e,
    )) as Error;

    expect(viaGuarded.message).toBe(viaPlain.message);
    expect(viaGuarded.name).toBe(viaPlain.name);

    // And the guard alone produces the same message as enqueueValidated alone.
    const guarded = guardQueue(new FakeQueue('sms'), 'sms') as unknown as {
      add: (n: string, d: unknown) => Promise<unknown>;
    };
    const guardOnly = (await guarded.add('probe', INCOMPLETE_SMS).catch((e: Error) => e)) as Error;
    expect(guardOnly.message).toBe(viaPlain.message);
  });
});
