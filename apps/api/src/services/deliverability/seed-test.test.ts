import { describe, it, expect } from 'vitest';
import { aggregateSeedResults } from './seed-test.js';

// Minimal shape the aggregator reads.
const r = (provider: string, placement: string | null) => ({ provider, placement }) as never;

describe('aggregateSeedResults', () => {
  it('computes per-provider placement + inbox rate over reported seeds', () => {
    const agg = aggregateSeedResults([
      r('gmail', 'inbox'),
      r('gmail', 'promotions'),
      r('gmail', 'spam'),
      r('gmail', null), // pending — excluded from reported
      r('outlook', 'inbox'),
      r('outlook', 'inbox'),
    ]);
    const gmail = agg.byProvider.find((p) => p.provider === 'gmail')!;
    expect(gmail).toMatchObject({ total: 4, reported: 3, inbox: 1, tabs: 1, spam: 1 });
    expect(gmail.inboxRate).toBe(0.33);
    const outlook = agg.byProvider.find((p) => p.provider === 'outlook')!;
    expect(outlook.inboxRate).toBe(1);
  });

  it('computes overall inbox rate over reported seeds only', () => {
    const agg = aggregateSeedResults([r('gmail', 'inbox'), r('gmail', 'spam'), r('gmail', null)]);
    expect(agg.overall).toEqual({ total: 3, reported: 2, inbox: 1, inboxRate: 0.5 });
  });

  it('counts missing separately and never divides by zero', () => {
    const agg = aggregateSeedResults([r('yahoo', null), r('yahoo', 'missing')]);
    const yahoo = agg.byProvider[0]!;
    expect(yahoo.missing).toBe(1);
    expect(yahoo.inboxRate).toBe(0);
    expect(agg.overall.inboxRate).toBe(0);
  });

  it('sorts providers alphabetically', () => {
    const agg = aggregateSeedResults([r('outlook', 'inbox'), r('gmail', 'inbox'), r('seznam', 'inbox')]);
    expect(agg.byProvider.map((p) => p.provider)).toEqual(['gmail', 'outlook', 'seznam']);
  });
});
