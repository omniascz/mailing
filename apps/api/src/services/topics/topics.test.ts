import { describe, it, expect } from 'vitest';
import { effectiveTopicStatus } from './index.js';

describe('effectiveTopicStatus', () => {
  it('honours an explicit subscription over the default', () => {
    expect(effectiveTopicStatus('subscribed', 'opt_out')).toBe(true);
    expect(effectiveTopicStatus('unsubscribed', 'opt_in')).toBe(false);
  });

  it('falls back to the topic default when no explicit row', () => {
    expect(effectiveTopicStatus(undefined, 'opt_in')).toBe(true);
    expect(effectiveTopicStatus(undefined, 'opt_out')).toBe(false);
  });
});
