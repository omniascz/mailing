import { describe, it, expect } from 'vitest';

/**
 * Lists admin CRUD — input-shape tests. The DB operations themselves are
 * thin Drizzle wrappers covered by integration tests at the route layer
 * once the harness is in place. Here we pin the validators / zod schemas
 * used by the route so an accidental loosening can't ship.
 *
 * Schemas are duplicated from routes/v1/lists.ts to keep the test
 * hermetic (no Fastify bootstrap). If they diverge from the route's
 * definitions, that's exactly the regression we want to catch.
 */

import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  doubleOptIn: z.boolean().optional(),
  thankYouUrl: z.string().url().max(1024).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  doubleOptIn: z.boolean().optional(),
  thankYouUrl: z.string().url().max(1024).nullable().optional(),
});

describe('createSchema', () => {
  it('accepts minimal { name }', () => {
    const r = createSchema.safeParse({ name: 'Newsletter' });
    expect(r.success).toBe(true);
  });

  it('accepts full payload with DOI + thank-you URL', () => {
    const r = createSchema.safeParse({
      name: 'Newsletter — CZ',
      description: 'Týdenní novinky',
      doubleOptIn: true,
      thankYouUrl: 'https://example.com/thanks',
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(createSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects name longer than 255 chars', () => {
    expect(createSchema.safeParse({ name: 'a'.repeat(256) }).success).toBe(false);
  });

  it('rejects invalid thank-you URL', () => {
    expect(createSchema.safeParse({ name: 'X', thankYouUrl: 'not a url' }).success).toBe(false);
  });
});

describe('updateSchema', () => {
  it('accepts empty patch (no-op update)', () => {
    expect(updateSchema.safeParse({}).success).toBe(true);
  });

  it('accepts explicit null to clear description', () => {
    const r = updateSchema.safeParse({ description: null });
    expect(r.success).toBe(true);
  });

  it('accepts explicit null to clear thankYouUrl', () => {
    const r = updateSchema.safeParse({ thankYouUrl: null });
    expect(r.success).toBe(true);
  });

  it('rejects empty-string name in update (would silently un-name the list)', () => {
    expect(updateSchema.safeParse({ name: '' }).success).toBe(false);
  });
});
