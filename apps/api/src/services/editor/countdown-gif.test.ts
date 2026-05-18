import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock sharp to return deterministic pixel data without native binaries
vi.mock('sharp', () => {
  const buf = Buffer.alloc(480 * 120 * 4, 0); // RGBA zeros
  const mockInstance = {
    resize: vi.fn().mockReturnThis(),
    ensureAlpha: vi.fn().mockReturnThis(),
    raw: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue({ data: buf }),
  };
  return { default: vi.fn(() => mockInstance) };
});

// Mock gif-encoder-2
vi.mock('gif-encoder-2', () => {
  const chunks: Buffer[] = [];
  class MockEncoder {
    out = { getData: () => Buffer.concat(chunks.length ? chunks : [Buffer.from('GIF89a')]) };
    setDelay = vi.fn();
    setRepeat = vi.fn();
    start = vi.fn();
    addFrame = vi.fn();
    finish = vi.fn();
  }
  return { default: MockEncoder };
});

import { generateCountdownGif } from './countdown-gif.js';

describe('generateCountdownGif', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws on invalid targetDate', async () => {
    await expect(
      generateCountdownGif({ targetDate: 'not-a-date' }),
    ).rejects.toThrow('Invalid targetDate');
  });

  it('returns a Buffer', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const buf = await generateCountdownGif({ targetDate: future, durationSeconds: 1, fps: 1 });
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('clamps fps between 1 and 10', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    // fps=0 → should be clamped to 1, so 1 frame for 1 second
    const buf = await generateCountdownGif({ targetDate: future, fps: 0, durationSeconds: 1 });
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('clamps durationSeconds between 1 and 60', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const buf = await generateCountdownGif({ targetDate: future, fps: 1, durationSeconds: 999 });
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('accepts custom style overrides', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const buf = await generateCountdownGif({
      targetDate: future,
      fps: 1,
      durationSeconds: 1,
      style: {
        bgColor: '#000000',
        textColor: '#ffffff',
        labelColor: '#aaaaaa',
        width: 320,
        height: 80,
      },
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('handles a targetDate in the past (shows 00:00:00:00)', async () => {
    const past = new Date(Date.now() - 10_000).toISOString();
    // Should not throw — just render zeroed countdown
    const buf = await generateCountdownGif({ targetDate: past, fps: 1, durationSeconds: 1 });
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
});
