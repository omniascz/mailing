/**
 * The organisation's per-second send rate, taken when a message is sent (Z134).
 *
 * Real Redis. The end-to-end pacing — messages accepted at once and delivered
 * one per second, with `deferred` events of reason `org_rate` — was measured
 * against a running API, engine and workers delivering to a local SMTP sink
 * (Z134 report); this pins the scheduler those deliveries rest on.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { redis } from '@forgemsg/shared/redis';
import { orgSendRateKey, reserveOrgSendSlot } from '../lib/org-send-rate.js';

const orgs: string[] = [];
const org = () => {
  const id = randomUUID();
  orgs.push(id);
  return id;
};

afterAll(async () => {
  for (const id of orgs) await redis.del(orgSendRateKey(id));
});

describe('send slots on an organisation timeline', () => {
  it('at 1 per second: the first slot is now, each next one a second later', async () => {
    const id = org();
    const now = Date.now();
    const slots: number[] = [];
    for (let i = 0; i < 5; i++) slots.push(await reserveOrgSendSlot(id, 1, now));
    expect(slots.map((s) => s - now)).toEqual([0, 1000, 2000, 3000, 4000]);
  });

  it('never more than the rate in any second, however many ask at once', async () => {
    const id = org();
    const now = Date.now();
    const slots = await Promise.all(
      Array.from({ length: 50 }, () => reserveOrgSendSlot(id, 14, now)),
    );
    const sorted = [...slots].sort((a, b) => a - b);
    expect(new Set(slots).size).toBe(50);
    // ceil(1000 / 14) = 72 ms apart: the 15th slot is never within a second of the 1st.
    for (let i = 14; i < sorted.length; i++)
      expect(sorted[i]! - sorted[i - 14]!).toBeGreaterThanOrEqual(1000);
  });

  it('a free timeline starts at now again: idle time is not banked', async () => {
    const id = org();
    const t0 = Date.now();
    await reserveOrgSendSlot(id, 1, t0);
    // Ten seconds later the next message goes at once — not ten in a burst.
    const later = t0 + 10_000;
    expect(await reserveOrgSendSlot(id, 1, later)).toBe(later);
    expect(await reserveOrgSendSlot(id, 1, later)).toBe(later + 1000);
  });

  it('organisations do not share a timeline', async () => {
    const a = org();
    const b = org();
    const now = Date.now();
    await reserveOrgSendSlot(a, 1, now);
    expect(await reserveOrgSendSlot(b, 1, now)).toBe(now);
  });
});
