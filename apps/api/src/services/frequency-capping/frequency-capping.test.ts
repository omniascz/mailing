import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { Redis } from 'ioredis';

// Stub transitive imports so the service module can load without real Redis/DB.
vi.mock('@forgemsg/shared/redis', () => ({ redis: {} }));
// `where()` is awaited directly by the rules query and `.limit(1)`-ed by the
// quiet-hours lookup, so the fake chain has to answer both. Before quiet hours
// moved to their own table this branch was never reached, and a `where` that
// is only awaitable made the whole check throw rather than return "no rules".
const emptyChain = () => {
  const result: Promise<never[]> & { limit: () => Promise<never[]> } = Object.assign(
    Promise.resolve([] as never[]),
    { limit: async () => [] as never[] },
  );
  return result;
};
vi.mock('../../db/client.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: emptyChain }) }),
  },
}));

// In-memory fake for the slice of Redis we actually use: zadd, zcount,
// zremrangebyscore, expire, multi, get, set, del. Just enough to keep the
// frequency-capping unit tests fast and hermetic.
interface SortedSetEntry {
  score: number;
  member: string;
}

function createFakeRedis() {
  const zsets = new Map<string, SortedSetEntry[]>();
  const kv = new Map<string, string>();

  const zadd = (key: string, score: number, member: string) => {
    const arr = zsets.get(key) ?? [];
    arr.push({ score, member });
    zsets.set(key, arr);
  };
  const zcount = (key: string, min: number, max: number) => {
    const arr = zsets.get(key) ?? [];
    return arr.filter((e) => e.score >= min && e.score <= max).length;
  };
  const zremrangebyscore = (key: string, min: number, max: number) => {
    const arr = zsets.get(key) ?? [];
    const next = arr.filter((e) => !(e.score >= min && e.score <= max));
    zsets.set(key, next);
  };

  const fake = {
    async zadd(key: string, score: number, member: string) {
      zadd(key, score, member);
      return 1;
    },
    async zcount(key: string, min: number, max: number) {
      return zcount(key, min, max);
    },
    async zremrangebyscore(key: string, min: number, max: number) {
      zremrangebyscore(key, min, max);
      return 0;
    },
    async expire() {
      return 1;
    },
    async get(key: string) {
      return kv.get(key) ?? null;
    },
    async set(key: string, value: string) {
      kv.set(key, value);
      return 'OK';
    },
    async del(key: string) {
      kv.delete(key);
      zsets.delete(key);
      return 1;
    },
    multi() {
      const ops: Array<() => void> = [];
      const builder = {
        zadd(key: string, score: number, member: string) {
          ops.push(() => zadd(key, score, member));
          return builder;
        },
        zremrangebyscore(key: string, min: number, max: number) {
          ops.push(() => zremrangebyscore(key, min, max));
          return builder;
        },
        expire() {
          return builder;
        },
        async exec() {
          for (const op of ops) op();
          return [];
        },
      };
      return builder;
    },
    _clear() {
      zsets.clear();
      kv.clear();
    },
    _setRules(orgId: string, rules: unknown) {
      kv.set(`freq_rules:${orgId}`, JSON.stringify(rules));
    },
  };
  return fake;
}

type FakeRedis = ReturnType<typeof createFakeRedis>;

async function loadModule(_fake: FakeRedis) {
  const mod = await import('./index.js');
  return mod;
}

const ORG = '00000000-0000-0000-0000-000000000001';
const CONTACT = '00000000-0000-0000-0000-000000000002';

describe('frequency capping', () => {
  let fake: FakeRedis;

  // Warm Vite's transform cache before the timed tests run. loadModule has to
  // stay a dynamic import — each test needs a fresh module instance, because
  // the service caches rules per org at module scope — but the FIRST import
  // also pays the transform, and on a loaded machine that measured 10 050 ms
  // against a 10 s per-test timeout. Paying it here with a generous hook
  // budget means a failure below is about frequency capping, not about how
  // busy the machine was.
  beforeAll(async () => {
    await import('./index.js');
  }, 60_000);

  beforeEach(() => {
    fake = createFakeRedis();
  });

  it('allows sends when no rules are configured', async () => {
    fake._setRules(ORG, []);
    const { checkFrequencyCap } = await loadModule(fake);
    const result = await checkFrequencyCap(
      { orgId: ORG, contactId: CONTACT, channel: 'email', now: 1_000_000 },
      fake as unknown as Redis,
    );
    expect(result.allowed).toBe(true);
  });

  it('blocks after reaching the channel-specific cap inside the window', async () => {
    fake._setRules(ORG, [
      {
        id: 'r1',
        orgId: ORG,
        channel: 'email',
        maxCount: 2,
        periodHours: 24,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const { checkFrequencyCap, recordSend } = await loadModule(fake);
    const base = 10_000_000;

    await recordSend(
      { orgId: ORG, contactId: CONTACT, channel: 'email', now: base },
      fake as unknown as Redis,
    );
    const afterOne = await checkFrequencyCap(
      { orgId: ORG, contactId: CONTACT, channel: 'email', now: base + 1 },
      fake as unknown as Redis,
    );
    expect(afterOne.allowed).toBe(true);

    await recordSend(
      { orgId: ORG, contactId: CONTACT, channel: 'email', now: base + 2 },
      fake as unknown as Redis,
    );
    const afterTwo = await checkFrequencyCap(
      { orgId: ORG, contactId: CONTACT, channel: 'email', now: base + 3 },
      fake as unknown as Redis,
    );
    expect(afterTwo.allowed).toBe(false);
    expect(afterTwo.blockedBy?.maxCount).toBe(2);
  });

  it('expires the window: sends outside the period do not count', async () => {
    fake._setRules(ORG, [
      {
        id: 'r1',
        orgId: ORG,
        channel: 'email',
        maxCount: 1,
        periodHours: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const { checkFrequencyCap, recordSend } = await loadModule(fake);
    const base = 20_000_000;

    await recordSend(
      { orgId: ORG, contactId: CONTACT, channel: 'email', now: base },
      fake as unknown as Redis,
    );
    // 2 hours later, outside a 1-hour window
    const later = base + 2 * 3600 * 1000;
    const result = await checkFrequencyCap(
      { orgId: ORG, contactId: CONTACT, channel: 'email', now: later },
      fake as unknown as Redis,
    );
    expect(result.allowed).toBe(true);
  });

  it('rule with channel "all" caps across any channel', async () => {
    fake._setRules(ORG, [
      {
        id: 'r1',
        orgId: ORG,
        channel: 'all',
        maxCount: 2,
        periodHours: 24,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const { checkFrequencyCap, recordSend } = await loadModule(fake);
    const base = 30_000_000;
    await recordSend(
      { orgId: ORG, contactId: CONTACT, channel: 'email', now: base },
      fake as unknown as Redis,
    );
    await recordSend(
      { orgId: ORG, contactId: CONTACT, channel: 'sms', now: base + 1 },
      fake as unknown as Redis,
    );

    const result = await checkFrequencyCap(
      { orgId: ORG, contactId: CONTACT, channel: 'push', now: base + 2 },
      fake as unknown as Redis,
    );
    expect(result.allowed).toBe(false);
  });
});
