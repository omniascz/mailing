/**
 * executeSendSms hands the frequency cap — and with it the organisation's quiet
 * hours — priority 'transactional' only when the flow's transactional exception
 * holds for the node (Z162 MIMO 4; Michal, 14. 10. 22:10, point 4; Z167).
 *
 * On master `priority: config.priority ?? 'marketing'` went to the cap as the
 * node said it, so a send_sms with priority 'transactional' on ANY trigger
 * skipped the quiet window (frequency-capping/index.ts exempts
 * 'transactional'), while the API treated the same SMS as marketing. The
 * exception is the one in transactional-exception.ts (stubbed here to say yes
 * or no); the cap is stubbed to answer quiet hours for anything but
 * 'transactional', as a configured quiet window does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  exception: false,
  capInputs: [] as { priority?: string }[],
  exceptionCalls: [] as unknown[][],
}));

const smsAdd = vi.fn().mockResolvedValue({});
vi.mock('../../lib/queues.js', () => ({
  queues: { sms: { add: smsAdd }, email: { add: vi.fn() }, viber: { add: vi.fn() } },
  sendTransactionalEmail: vi.fn(),
}));
vi.mock('../../db/client.js', () => {
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'from', 'where', 'orderBy', 'insert', 'update', 'set', 'delete'])
    chain[k] = () => chain;
  chain.limit = () => Promise.resolve([]);
  chain.values = () => Promise.resolve([]);
  chain.returning = () => Promise.resolve([]);
  return { db: chain };
});
vi.mock('@forgemsg/shared/redis', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), setex: vi.fn(), incr: vi.fn(), expire: vi.fn() },
}));
const WINDOW_END = new Date(Date.now() + 2 * 3600 * 1000);
vi.mock('../frequency-capping/index.js', () => ({
  checkFrequencyCap: vi.fn(async (input: { priority?: string }) => {
    state.capInputs.push(input);
    return input.priority === 'transactional'
      ? { allowed: true, blockedBy: null, currentCount: 0, reason: null }
      : {
          allowed: false,
          blockedBy: null,
          currentCount: 0,
          reason: 'quiet_hours',
          nextSendAt: WINDOW_END,
        };
  }),
}));
vi.mock('./transactional-exception.js', () => ({
  flowTransactionalException: vi.fn(async (...args: unknown[]) => {
    state.exceptionCalls.push(args);
    return state.exception;
  }),
}));

const ORG = '11111111-1111-4111-8111-111111111111';
const CONTACT = '22222222-2222-4222-8222-222222222222';
const RUN = '33333333-3333-4333-8333-333333333333';
const ctx = {
  orgId: ORG,
  contact: {
    id: CONTACT,
    email: 'jana@example.test',
    firstName: 'Jana',
    lastName: null,
    phone: '+420777123456',
    customFields: {},
    tags: [],
    listIds: [],
  },
} as never;
const run = () =>
  ({
    id: RUN,
    orgId: ORG,
    contactId: CONTACT,
    workflowId: '44444444-4444-4444-8444-444444444444',
    status: 'running',
    data: {},
    converted: false,
  }) as never;
const node = (priority?: string) =>
  ({
    id: 'sms1',
    type: 'send_sms',
    config: { message: 'Vstupenka', ...(priority ? { priority } : {}) },
  }) as never;

async function send(priority: string | undefined, exception: boolean) {
  state.exception = exception;
  const { executeAction } = await import('./actions.js');
  return executeAction(node(priority), run(), ctx);
}

beforeEach(() => {
  smsAdd.mockClear();
  state.capInputs = [];
  state.exceptionCalls = [];
});

describe("executeSendSms — 'transactional' passes the quiet hours only under the exception", () => {
  it("off the closed list: 'transactional' reaches the cap as 'marketing' and the run waits for the window", async () => {
    const res = await send('transactional', false);
    expect(state.capInputs.map((i) => i.priority)).toEqual(['marketing']);
    expect(res).toEqual({ type: 'wait', until: WINDOW_END });
    expect(smsAdd).not.toHaveBeenCalled();
  });

  it("on the closed list: 'transactional' stays transactional and the SMS is queued now (unchanged)", async () => {
    const res = await send('transactional', true);
    expect(state.capInputs.map((i) => i.priority)).toEqual(['transactional']);
    expect(res.type).toBe('next');
    expect(smsAdd).toHaveBeenCalledTimes(1);
  });

  it("no priority waits as 'marketing'; 'promotional' and 'marketing' keep theirs (unchanged)", async () => {
    expect(await send(undefined, true)).toMatchObject({ type: 'wait' });
    expect(await send('promotional', true)).toMatchObject({ type: 'wait' });
    expect(await send('marketing', true)).toMatchObject({ type: 'wait' });
    expect(state.capInputs.map((i) => i.priority)).toEqual([
      'marketing',
      'promotional',
      'marketing',
    ]);
    expect(smsAdd).not.toHaveBeenCalled();
  });
});
