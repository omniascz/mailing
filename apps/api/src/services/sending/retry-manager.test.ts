import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/redis.js', () => {
  const store: Record<string, string> = {};
  const mockPipeline = {
    set: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };
  return {
    redis: {
      get: vi.fn(async (key: string) => store[key] ?? null),
      set: vi.fn(async (key: string, val: string) => { store[key] = val; return 'OK'; }),
      del: vi.fn(async (...keys: string[]) => { keys.forEach((k) => delete store[k]); return keys.length; }),
      exists: vi.fn().mockResolvedValue(0),
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      pipeline: vi.fn(() => mockPipeline),
    },
  };
});

import {
  scheduleRetry,
  calculateRetryDelay,
  MAX_RETRY_ATTEMPTS,
  permanentlyFail,
  isReadyForRetry,
} from './retry-manager.js';
import { redis } from '../../lib/redis.js';

describe('calculateRetryDelay', () => {
  it('returns 60s for attempt 1', () => {
    expect(calculateRetryDelay(1)).toBe(60);
  });

  it('returns 300s for attempt 2', () => {
    expect(calculateRetryDelay(2)).toBe(300);
  });

  it('returns 86400s for attempt 6', () => {
    expect(calculateRetryDelay(6)).toBe(86_400);
  });

  it('multiplies by 3 for Gmail', () => {
    expect(calculateRetryDelay(1, 'gmail')).toBe(180);
    expect(calculateRetryDelay(2, 'gmail')).toBe(900);
  });

  it('returns null beyond max attempts', () => {
    expect(calculateRetryDelay(MAX_RETRY_ATTEMPTS + 1)).toBeNull();
  });
});

describe('scheduleRetry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a valid retry state for first retry', async () => {
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce('0'); // count
    const state = await scheduleRetry('msg-001', 'other');
    expect(state.isPermanentlyFailed).toBe(false);
    expect(state.attemptNumber).toBe(1);
    expect(state.nextRetryAt).toBeInstanceOf(Date);
    expect(state.nextRetryDelaySeconds).toBe(60);
  });

  it('marks as permanently failed after max retries', async () => {
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(String(MAX_RETRY_ATTEMPTS));
    const state = await scheduleRetry('msg-exhausted', 'other');
    expect(state.isPermanentlyFailed).toBe(true);
    expect(state.nextRetryAt).toBeNull();
  });

  it('uses Gmail multiplier for Gmail ISP', async () => {
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce('0');
    const state = await scheduleRetry('msg-gmail', 'gmail');
    expect(state.nextRetryDelaySeconds).toBe(180); // 60 * 3
    expect(state.isp).toBe('gmail');
  });

  it('uses longer delay for later attempts', async () => {
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce('4'); // attempt 5
    const state = await scheduleRetry('msg-late', 'other');
    expect(state.nextRetryDelaySeconds).toBe(28_800); // 8h
  });
});

describe('permanentlyFail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls redis.set with fail key', async () => {
    await permanentlyFail('msg-hardbounce');
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('failed'),
      '1',
      'EX',
      expect.any(Number),
    );
  });
});

describe('isReadyForRetry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns false when permanently failed', async () => {
    (redis.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(String(Math.floor(Date.now() / 1000) - 100)) // next_at (past)
      .mockResolvedValueOnce('1'); // failed flag
    const ready = await isReadyForRetry('msg-failed');
    expect(ready).toBe(false);
  });

  it('returns false when next_at is in the future', async () => {
    (redis.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(String(Math.floor(Date.now() / 1000) + 3600)) // future
      .mockResolvedValueOnce(null); // not failed
    const ready = await isReadyForRetry('msg-future');
    expect(ready).toBe(false);
  });

  it('returns true when next_at is in the past and not failed', async () => {
    (redis.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(String(Math.floor(Date.now() / 1000) - 10)) // past
      .mockResolvedValueOnce(null); // not failed
    const ready = await isReadyForRetry('msg-ready');
    expect(ready).toBe(true);
  });
});
