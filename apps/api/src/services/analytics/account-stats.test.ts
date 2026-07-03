import { describe, it, expect } from 'vitest';
import { computeSendRates } from './account-stats.js';

describe('computeSendRates', () => {
  it('computes delivery/bounce/complaint over sent, open/click over delivered', () => {
    const r = computeSendRates({
      sent: 1000,
      delivered: 950,
      bounced: 50,
      complained: 3,
      opened: 380,
      clicked: 95,
      unsubscribed: 5,
    });
    expect(r.deliveryRate).toBe(95);
    expect(r.bounceRate).toBe(5);
    expect(r.complaintRate).toBe(0.3);
    expect(r.openRate).toBe(40); // 380/950
    expect(r.clickRate).toBe(10); // 95/950
  });

  it('is zero-safe with no sends', () => {
    const r = computeSendRates({
      sent: 0,
      delivered: 0,
      bounced: 0,
      complained: 0,
      opened: 0,
      clicked: 0,
      unsubscribed: 0,
    });
    expect(r.deliveryRate).toBe(0);
    expect(r.openRate).toBe(0);
  });
});
