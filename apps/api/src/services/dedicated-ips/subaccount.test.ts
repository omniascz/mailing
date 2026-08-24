import { describe, it, expect } from 'vitest';
import { summarizeSubaccountReputation } from './index.js';

/**
 * Rows now carry reputationUpdatedAt, and a score without one is not counted.
 *
 * The old assertions here pinned the behaviour this change removes: an
 * untouched reputation_score was read as a measured 0 and averaged in. Nothing
 * writes that column — updateReputation is its only writer and has no caller —
 * so every subaccount reported a confident 0.00, which reads as "measured, and
 * terrible" rather than "never measured". "handles null reputation as 0" is
 * replaced by its opposite for the same reason.
 */
describe('summarizeSubaccountReputation', () => {
  const measured = new Date('2026-08-24T00:00:00Z');

  it('averages measured reputation + sums today-sent per subaccount', () => {
    const out = summarizeSubaccountReputation([
      { subaccountId: 'a', reputationScore: '90', reputationUpdatedAt: measured, todaySent: 100 },
      { subaccountId: 'a', reputationScore: '80', reputationUpdatedAt: measured, todaySent: 50 },
      { subaccountId: 'b', reputationScore: '70', reputationUpdatedAt: measured, todaySent: 10 },
    ]);
    expect(out).toEqual([
      { subaccountId: 'a', ipCount: 2, measuredIpCount: 2, avgReputation: 85, totalSentToday: 150 },
      { subaccountId: 'b', ipCount: 1, measuredIpCount: 1, avgReputation: 70, totalSentToday: 10 },
    ]);
  });

  it('excludes IPs not delegated to a subaccount (null)', () => {
    const out = summarizeSubaccountReputation([
      { subaccountId: null, reputationScore: '99', reputationUpdatedAt: measured, todaySent: 1000 },
      { subaccountId: 'a', reputationScore: '50', reputationUpdatedAt: measured, todaySent: 5 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.subaccountId).toBe('a');
  });

  it('reports a null average rather than 0 when nothing has been measured', () => {
    const out = summarizeSubaccountReputation([
      { subaccountId: 'a', reputationScore: null, reputationUpdatedAt: null, todaySent: 0 },
    ]);
    expect(out[0]!.avgReputation).toBeNull();
    expect(out[0]!.measuredIpCount).toBe(0);
    expect(out[0]!.ipCount).toBe(1);
  });

  it('still counts the IP even when its reputation is unknown', () => {
    const out = summarizeSubaccountReputation([
      { subaccountId: 'a', reputationScore: '95', reputationUpdatedAt: measured, todaySent: 3 },
      { subaccountId: 'a', reputationScore: '0', reputationUpdatedAt: null, todaySent: 7 },
    ]);
    expect(out[0]!.ipCount).toBe(2);
    expect(out[0]!.measuredIpCount).toBe(1);
    expect(out[0]!.avgReputation).toBe(95);
    expect(out[0]!.totalSentToday).toBe(10);
  });
});
