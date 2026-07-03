import { describe, it, expect } from 'vitest';
import { summarizeSubaccountReputation } from './index.js';

describe('summarizeSubaccountReputation', () => {
  it('averages reputation + sums today-sent per subaccount', () => {
    const out = summarizeSubaccountReputation([
      { subaccountId: 'a', reputationScore: '90', todaySent: 100 },
      { subaccountId: 'a', reputationScore: '80', todaySent: 50 },
      { subaccountId: 'b', reputationScore: '70', todaySent: 10 },
    ]);
    expect(out).toEqual([
      { subaccountId: 'a', ipCount: 2, avgReputation: 85, totalSentToday: 150 },
      { subaccountId: 'b', ipCount: 1, avgReputation: 70, totalSentToday: 10 },
    ]);
  });

  it('excludes IPs not delegated to a subaccount (null)', () => {
    const out = summarizeSubaccountReputation([
      { subaccountId: null, reputationScore: '99', todaySent: 1000 },
      { subaccountId: 'a', reputationScore: '50', todaySent: 5 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.subaccountId).toBe('a');
  });

  it('handles null reputation as 0', () => {
    const out = summarizeSubaccountReputation([
      { subaccountId: 'a', reputationScore: null, todaySent: 0 },
    ]);
    expect(out[0]!.avgReputation).toBe(0);
  });
});
