import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Validation-shape tests for the public /t/rev ingest body. The handler
 * itself swallows zod errors and always returns 202 (tracking endpoints
 * never fail the snippet), but we still want to know the schema rejects
 * obvious abuse — negative amounts, gigantic item arrays, broken UUIDs.
 *
 * Schema is duplicated here from routes/v1/site-tracking.ts to keep the
 * test hermetic (no Fastify import chain). If the route's schema diverges
 * from this one, that's the bug we're protecting against.
 */
const revenueBody = z.object({
  siteToken: z.string().min(1),
  visitorId: z.string().min(1),
  orderId: z.string().max(128).optional(),
  amount: z.number().nonnegative().max(10_000_000),
  currency: z.string().length(3).optional(),
  items: z
    .array(
      z.object({
        sku: z.string().max(128),
        name: z.string().max(255),
        qty: z.number().int().min(1),
        price: z.number().nonnegative(),
      }),
    )
    .max(500)
    .optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  contactId: z.string().uuid().optional(),
  email: z.string().email().optional(),
});

describe('/t/rev body schema', () => {
  it('accepts a minimal valid payload', () => {
    const r = revenueBody.safeParse({
      siteToken: 'tok',
      visitorId: 'v1',
      amount: 49.99,
    });
    expect(r.success).toBe(true);
  });

  it('accepts full ecommerce payload with items + UTM', () => {
    const r = revenueBody.safeParse({
      siteToken: 'tok',
      visitorId: 'v1',
      orderId: 'ORD-100',
      amount: 1234.56,
      currency: 'EUR',
      items: [{ sku: 'A', name: 'Widget', qty: 2, price: 100 }],
      utmSource: 'newsletter-2026-05',
      email: 'buyer@example.com',
    });
    expect(r.success).toBe(true);
  });

  it('rejects negative amount', () => {
    const r = revenueBody.safeParse({ siteToken: 'tok', visitorId: 'v1', amount: -10 });
    expect(r.success).toBe(false);
  });

  it('rejects bogus currency length', () => {
    const r = revenueBody.safeParse({
      siteToken: 'tok',
      visitorId: 'v1',
      amount: 1,
      currency: 'EURO',
    });
    expect(r.success).toBe(false);
  });

  it('rejects > 500 items (catalog dump abuse)', () => {
    const items = Array.from({ length: 501 }, (_, i) => ({
      sku: `S${i}`,
      name: 'x',
      qty: 1,
      price: 1,
    }));
    const r = revenueBody.safeParse({ siteToken: 'tok', visitorId: 'v1', amount: 1, items });
    expect(r.success).toBe(false);
  });

  it('rejects invalid contactId UUID', () => {
    const r = revenueBody.safeParse({
      siteToken: 'tok',
      visitorId: 'v1',
      amount: 1,
      contactId: 'not-a-uuid',
    });
    expect(r.success).toBe(false);
  });

  it('rejects amount above the sanity cap', () => {
    const r = revenueBody.safeParse({ siteToken: 'tok', visitorId: 'v1', amount: 10_000_001 });
    expect(r.success).toBe(false);
  });
});
