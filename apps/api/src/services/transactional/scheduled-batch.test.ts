import { describe, it, expect } from 'vitest';
import { dedupeRecipients, batchKey } from './scheduled-batch.js';

describe('dedupeRecipients', () => {
  it('removes case-insensitive duplicate emails, keeping first occurrence', () => {
    const { unique, removed } = dedupeRecipients([
      { to: 'a@x.com', mergeVars: { n: '1' } },
      { to: 'A@X.com', mergeVars: { n: '2' } },
      { to: 'b@x.com' },
    ]);
    expect(unique.map((r) => r.to)).toEqual(['a@x.com', 'b@x.com']);
    expect(unique[0]!.mergeVars).toEqual({ n: '1' });
    expect(removed).toBe(1);
  });

  it('returns 0 removed when all unique', () => {
    const { removed } = dedupeRecipients([{ to: 'a@x.com' }, { to: 'b@x.com' }]);
    expect(removed).toBe(0);
  });
});

describe('batchKey', () => {
  it('namespaces by org + batch', () => {
    expect(batchKey('org1', 'b1')).toBe('batch:txn:org1:b1');
  });
});
