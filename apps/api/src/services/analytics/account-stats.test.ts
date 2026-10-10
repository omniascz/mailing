import { describe, it, expect } from 'vitest';
import { computeSendRates } from './account-stats.js';

describe('computeSendRates', () => {
  it('computes delivery/bounce over delivery outcomes, complaint/open/click over delivered', () => {
    const r = computeSendRates({
      sent: 1000,
      delivered: 950,
      bounced: 50,
      failed: 0,
      complained: 3,
      opened: 380,
      clicked: 95,
      unsubscribed: 5,
    });
    expect(r.deliveryRate).toBe(95);
    expect(r.bounceRate).toBe(5);
    // 3 / 950, not 3 / 1000: a complaint can only follow a delivered message.
    expect(r.complaintRate).toBe(0.32);
    expect(r.openRate).toBe(40); // 380/950
    expect(r.clickRate).toBe(10); // 95/950
  });

  it('is zero-safe with no sends', () => {
    const r = computeSendRates({
      sent: 0,
      delivered: 0,
      bounced: 0,
      failed: 0,
      complained: 0,
      opened: 0,
      clicked: 0,
      unsubscribed: 0,
    });
    expect(r.deliveryRate).toBe(0);
    expect(r.openRate).toBe(0);
  });

  it('rates the mail mta-sender actually records: resets have no send row, a bounce has none either', () => {
    // An account sending only password resets: 85 delivered, 15 bounced, no
    // 'send' row. Over 'sent' this read 0 % delivered and 0 % bounced.
    const resets = computeSendRates({
      sent: 0,
      delivered: 85,
      bounced: 15,
      failed: 0,
      complained: 0,
      opened: 0,
      clicked: 0,
      unsubscribed: 0,
    });
    expect(resets.deliveryRate).toBe(85);
    expect(resets.bounceRate).toBe(15);

    // A campaign of two, one delivered and one bounced: one 'send' row. Over
    // 'sent' this read 100 % delivered and 100 % bounced at once.
    const oneOne = computeSendRates({
      sent: 1,
      delivered: 1,
      bounced: 1,
      failed: 0,
      complained: 0,
      opened: 0,
      clicked: 0,
      unsubscribed: 0,
    });
    expect(oneOne.deliveryRate).toBe(50);
    expect(oneOne.bounceRate).toBe(50);
  });

  it('a transport failure lowers the delivery rate and is not a bounce', () => {
    const r = computeSendRates({
      sent: 90,
      delivered: 90,
      bounced: 0,
      failed: 10,
      complained: 0,
      opened: 0,
      clicked: 0,
      unsubscribed: 0,
    });
    expect(r.deliveryRate).toBe(90);
    expect(r.bounceRate).toBe(0);
  });
});
