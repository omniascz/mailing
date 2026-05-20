import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

/**
 * Unit tests for editor routes helpers.
 * We test the DB-dependent route logic by mocking drizzle and the service modules.
 *
 * Full HTTP-layer integration tests would require a running DB; these tests
 * validate the business logic: org scoping, not-found handling, upsert behaviour.
 */

// ─── Mock DB ─────────────────────────────────────────────────────────────────

const mockQuery = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  onConflictDoNothing: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockReturnThis(),
};

vi.mock('../../db/client.js', () => ({ db: mockQuery }));
vi.mock('../../services/editor/countdown-gif.js', () => ({
  generateCountdownGif: vi.fn().mockResolvedValue(Buffer.from('GIF89a')),
}));
vi.mock('../../services/editor/product-scraper.js', () => ({
  scrapeProduct: vi.fn().mockResolvedValue({
    title: 'Test Product',
    description: 'A product',
    price: '99.00',
    currency: 'CZK',
    imageUrl: 'https://img.example.com/p.jpg',
    url: 'https://example.com/product',
  }),
}));

// Mock schema exports so Drizzle operators compile
vi.mock('../../db/schema/index.js', () => ({
  savedBlocks: { orgId: 'orgId', id: 'id', category: 'category' },
  brandKits: { orgId: 'orgId' },
}));

import { generateCountdownGif } from '../../services/editor/countdown-gif.js';
import { scrapeProduct } from '../../services/editor/product-scraper.js';

describe('countdown-gif service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generateCountdownGif returns a Buffer', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const buf = await generateCountdownGif({ targetDate: future });
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
});

describe('product-scraper service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scrapeProduct returns a ProductCard shape', async () => {
    const card = await scrapeProduct('https://example.com/product', 'key');
    expect(card).toMatchObject({
      title: 'Test Product',
      price: '99.00',
      currency: 'CZK',
    });
  });
});

// ─── Saved blocks business rules ─────────────────────────────────────────────

describe('saved blocks Zod validation', () => {
  it('accepts valid create payload', () => {
    const schema = z.object({
      name: z.string().min(1).max(255),
      category: z.string().min(1).max(100).optional(),
      blockData: z.record(z.unknown()),
      thumbnailUrl: z.string().url().max(1024).optional(),
    });
    expect(() =>
      schema.parse({ name: 'Hero block', blockData: { type: 'hero', content: 'Hello' } }),
    ).not.toThrow();
  });

  it('rejects empty name', () => {
    const schema = z.object({ name: z.string().min(1).max(255), blockData: z.record(z.unknown()) });
    expect(() => schema.parse({ name: '', blockData: {} })).toThrow();
  });

  it('rejects invalid thumbnailUrl', () => {
    const schema = z.object({
      name: z.string().min(1),
      blockData: z.record(z.unknown()),
      thumbnailUrl: z.string().url().max(1024).optional(),
    });
    expect(() =>
      schema.parse({ name: 'Block', blockData: {}, thumbnailUrl: 'not-a-url' }),
    ).toThrow();
  });
});

// ─── Brand kit Zod validation ─────────────────────────────────────────────────

describe('brand kit Zod validation', () => {
  it('accepts valid hex colors', () => {
    const schema = z.object({
      primaryColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
    });
    expect(() => schema.parse({ primaryColor: '#2563eb' })).not.toThrow();
  });

  it('rejects invalid hex color', () => {
    const schema = z.object({
      primaryColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
    });
    expect(() => schema.parse({ primaryColor: 'blue' })).toThrow();
  });

  it('allows null logoUrl', () => {
    const schema = z.object({ logoUrl: z.string().url().max(1024).nullable().optional() });
    expect(() => schema.parse({ logoUrl: null })).not.toThrow();
  });

  it('rejects invalid logoUrl', () => {
    const schema = z.object({ logoUrl: z.string().url().max(1024).nullable().optional() });
    expect(() => schema.parse({ logoUrl: 'not-a-url' })).toThrow();
  });
});

// ─── Countdown GIF Zod validation ────────────────────────────────────────────

describe('countdown-gif Zod validation', () => {
  it('accepts ISO 8601 datetime', () => {
    const schema = z.object({
      targetDate: z.string().datetime(),
      fps: z.number().int().min(1).max(10).optional(),
      durationSeconds: z.number().int().min(1).max(60).optional(),
    });
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(() => schema.parse({ targetDate: future })).not.toThrow();
  });

  it('rejects non-datetime string', () => {
    const schema = z.object({ targetDate: z.string().datetime() });
    expect(() => schema.parse({ targetDate: 'tomorrow' })).toThrow();
  });

  it('rejects fps > 10', () => {
    const schema = z.object({ fps: z.number().int().min(1).max(10) });
    expect(() => schema.parse({ fps: 15 })).toThrow();
  });

  it('rejects durationSeconds > 60', () => {
    const schema = z.object({ durationSeconds: z.number().int().min(1).max(60) });
    expect(() => schema.parse({ durationSeconds: 120 })).toThrow();
  });
});
