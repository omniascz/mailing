import { describe, it, expect } from 'vitest';
import { scheduledEmailJobIds } from './queues.js';

describe('scheduledEmailJobIds', () => {
  it('produces one deterministic jobId per recipient', () => {
    expect(scheduledEmailJobIds('abc-123', 3)).toEqual([
      'sched-email:abc-123:0',
      'sched-email:abc-123:1',
      'sched-email:abc-123:2',
    ]);
  });

  it('sanitises non-alphanumeric characters from the message id', () => {
    // The bare id may still carry stray chars; jobId must stay Redis-safe.
    expect(scheduledEmailJobIds('a@b.com', 1)).toEqual(['sched-email:abcom:0']);
  });

  it('returns an empty list for zero recipients', () => {
    expect(scheduledEmailJobIds('abc', 0)).toEqual([]);
  });

  it('is stable — same inputs yield the same ids (so PATCH/cancel can find them)', () => {
    expect(scheduledEmailJobIds('x', 2)).toEqual(scheduledEmailJobIds('x', 2));
  });
});
