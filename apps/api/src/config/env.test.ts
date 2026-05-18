import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('env loader', () => {
  it('accepts dev defaults when nothing is set', async () => {
    process.env = { NODE_ENV: 'development' };
    const mod = await import('./env.js');
    expect(mod.env.PORT).toBe(3001);
    expect(mod.env.DATABASE_URL).toContain('postgresql://');
    expect(mod.env.REDIS_URL).toContain('redis://');
    expect(mod.env.NODE_ENV).toBe('development');
  });

  it('coerces PORT from string', async () => {
    process.env = { NODE_ENV: 'development', PORT: '4000' };
    const mod = await import('./env.js');
    expect(mod.env.PORT).toBe(4000);
  });

  it('rejects an invalid URL in DATABASE_URL', async () => {
    process.env = { NODE_ENV: 'development', DATABASE_URL: 'not-a-url' };
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('rejects an invalid LOG_LEVEL', async () => {
    process.env = { NODE_ENV: 'development', LOG_LEVEL: 'verbose' };
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('rejects out-of-range PORT', async () => {
    process.env = { NODE_ENV: 'development', PORT: '99999' };
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('coerces MINIO_USE_SSL boolean from string', async () => {
    process.env = { NODE_ENV: 'development', MINIO_USE_SSL: 'true' };
    const mod = await import('./env.js');
    expect(mod.env.MINIO_USE_SSL).toBe(true);
  });
});
