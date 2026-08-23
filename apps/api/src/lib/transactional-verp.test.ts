import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import { decodeVerp } from '@forgemsg/shared/sending/verp';

/**
 * Pay for the module graph in a hook, not in the first test.
 *
 * These files import the module under test lazily — after vi.mock and after the
 * env for the case is in place — so the whole graph (queues, bullmq, the db
 * client, …) is transformed and executed inside whichever test ran first, and
 * charged to its 10s budget. Measured on an idle machine this file needed
 * 8-22s in the full suite while taking under 2s alone: the cost is contention
 * during that first load, not the assertions.
 *
 * Loading it once here moves that to setup, where it belongs. vitest caches the
 * transform, so the per-test vi.resetModules() re-executes a warm graph
 * (measured: 1719ms cold, 309ms after a reset) and the tests time what they
 * are actually about.
 *
 * The explicit budget is on this hook alone. Loading a module graph under
 * contention is setup and needs room; the tests keep the suite's strict 10s,
 * because a test that needs longer than that is telling you something.
 */
beforeAll(async () => {
  await import('./queues.js');
}, 60_000);

/**
 * VERP on the transactional path.
 *
 * batch-sender sets a per-message Return-Path so an out-of-band DSN can be
 * matched back to the send. `sendTransactionalEmail` built its MTA payload by
 * hand and simply had no `returnPath` field — and the consumer declares it
 * optional, so nothing complained. After PR #40 configured the bounce domain,
 * campaign mail got VERP and DOI confirmations, password resets and every other
 * system mail still did not.
 *
 * With the Return-Path empty the engine falls back to the header From
 * (engine/internal/smtp/sender.go:169), so the DSN goes to the customer's
 * mailbox. The bounce is never recorded, the address is never suppressed, and
 * the next campaign mails it again — which on a shared IP pool is the loop that
 * burns the pool.
 *
 * The assertion is a round trip through the real codec, not "the field is set":
 * a Return-Path that decodes to the wrong Message-ID would attribute the bounce
 * to the wrong send, which is worse than having none.
 */

const { queueAdd } = vi.hoisted(() => ({ queueAdd: vi.fn() }));

vi.mock('bullmq', () => ({
  Queue: class {
    name: string;
    opts: unknown;
    add = queueAdd;
    addBulk = vi.fn();
    constructor(name: string, opts?: unknown) {
      this.name = name;
      this.opts = opts;
    }
    getJob = vi.fn();
  },
  Worker: class {},
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  queueAdd.mockReset();
  queueAdd.mockResolvedValue({ id: '1' });
  vi.resetModules();
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function send(): Promise<{ messageId: string; payload: Record<string, unknown> }> {
  const { sendTransactionalEmail } = await import('./queues.js');
  const messageId = await sendTransactionalEmail({
    to: 'subscriber@example.test',
    from: 'no-reply@ops.test',
    subject: 'Confirm your subscription',
    html: '<p>x</p>',
    orgId: '00000000-0000-0000-0000-0000000000ff',
  });
  expect(queueAdd, 'nothing was enqueued').toHaveBeenCalledTimes(1);
  return { messageId, payload: queueAdd.mock.calls[0]![1] as Record<string, unknown> };
}

describe('sendTransactionalEmail — VERP return path', () => {
  it('sets a Return-Path that decodes back to this exact message', async () => {
    process.env.VERP_BOUNCE_DOMAIN = 'bounce.ops.test';
    const { messageId, payload } = await send();

    const returnPath = payload.returnPath as string;
    expect(
      typeof returnPath,
      'the field was absent entirely, not empty — the consumer declares it optional',
    ).toBe('string');
    expect(returnPath, 'no Return-Path means the engine falls back to From').not.toBe('');
    expect(returnPath.endsWith('@bounce.ops.test'), returnPath).toBe(true);
    expect(
      decodeVerp(returnPath),
      'a Return-Path that decodes to the wrong id attributes the bounce to the wrong send',
    ).toBe(messageId);
  });

  it('uses the same codec as the campaign path, not a second encoding', async () => {
    process.env.VERP_BOUNCE_DOMAIN = 'bounce.ops.test';
    const { messageId, payload } = await send();
    const { encodeVerp } = await import('@forgemsg/shared/sending/verp');
    expect(payload.returnPath).toBe(encodeVerp(messageId, 'bounce.ops.test'));
  });

  it('leaves it empty when no bounce domain is configured, as batch-sender does', async () => {
    delete process.env.VERP_BOUNCE_DOMAIN;
    const { payload } = await send();
    expect(payload.returnPath).toBe('');
  });

  it('carries the MTA retry window, not the 15-second one', async () => {
    // Same Redis queue as the campaign path, so it has to be the same window:
    // 6 attempts from 60 s ≈ 31 minutes, which outlasts greylisting. The old
    // 3 from 5 s gave up in fifteen seconds.
    const { mtaOtherQueue } = await import('./queues.js');
    const opts = (
      mtaOtherQueue as unknown as { opts: { defaultJobOptions: Record<string, unknown> } }
    ).opts.defaultJobOptions;
    expect(opts).toMatchObject({
      attempts: 6,
      backoff: { type: 'exponential', delay: 60_000 },
    });
  });
});
