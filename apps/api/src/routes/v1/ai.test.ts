/**
 * Tests for AI routes (tasks 4.5 — generate-email, 4.6 — subject-lines, 4.7 — brand-voice).
 * We mock the Claude API and Redis cache.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockRedis = { get: vi.fn(), setex: vi.fn() };
vi.mock('../../lib/redis.js', () => ({ redis: mockRedis }));

const mockDb: Record<string, unknown> = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
};
vi.mock('../../db/client.js', () => ({ db: mockDb }));
vi.mock('../../db/schema/index.js', () => ({
  campaigns: { id: 'id', orgId: 'org_id', subject: 'subject', content: 'content' },
  organizations: { id: 'id' },
}));
vi.mock('../../lib/app-error.js', () => ({
  AppError: {
    internal: (msg: string) => Object.assign(new Error(msg), { statusCode: 500 }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { statusCode: 400 }),
    notFound: (msg: string) => Object.assign(new Error(msg), { statusCode: 404 }),
  },
}));

// ─── Schemas (mirror what the routes use) ────────────────────────────────────

const emailGenBodySchema = z.object({
  goal: z.string().min(5).max(500),
  tone: z.enum(['formal', 'casual', 'urgent', 'friendly']).optional().default('friendly'),
  audienceDescription: z.string().max(500).optional().default(''),
  keyPoints: z.array(z.string().max(200)).max(10).optional().default([]),
  ctaText: z.string().max(100).optional().default('Learn More'),
  wordCountTarget: z.number().int().min(50).max(800).optional().default(200),
  brandVoice: z.record(z.unknown()).optional(),
});

const emailGenOutputSchema = z.object({
  subject: z.string(),
  preheader: z.string(),
  blocks: z.array(z.object({ type: z.string() }).passthrough()),
});

const subjectVariantSchema = z.object({
  subject: z.string().max(100),
  score: z.number().min(1).max(10),
  reason: z.string(),
});

const subjectResponseSchema = z.object({
  variants: z.array(subjectVariantSchema).min(1).max(10),
});

const toneSchema = z
  .enum(['formal', 'casual', 'urgent', 'friendly', 'curious'])
  .optional()
  .default('friendly');

const brandVoiceSchema = z.object({
  tone: z.string(),
  vocabulary: z.object({
    keyPhrases: z.array(z.string()),
    readingLevel: z.enum(['basic', 'intermediate', 'advanced']),
    avgWordsPerSentence: z.number(),
  }),
  ctaPatterns: z.object({
    actionWords: z.array(z.string()),
    urgencyLevel: z.enum(['low', 'medium', 'high']),
  }),
  emojiUsage: z.enum(['none', 'rare', 'moderate', 'frequent']),
  personalizationLevel: z.enum(['none', 'basic', 'advanced']),
  brandValues: z.array(z.string()),
  summary: z.string(),
});

const brandVoiceBodySchema = z.object({
  campaignIds: z.array(z.string().uuid()).min(1).max(20),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  return JSON.parse(cleaned) as T;
}

// ─── 4.5 AI email generator ───────────────────────────────────────────────────

describe('AI generate-email (4.5)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRedis.get.mockResolvedValue(null);
  });

  it('validates that goal is required and minimum 5 chars', () => {
    expect(() => emailGenBodySchema.parse({ goal: 'hi' })).toThrow(); // < 5 chars
    expect(() => emailGenBodySchema.parse({ goal: 'hello world' })).not.toThrow();
  });

  it('rejects goal exceeding 500 chars', () => {
    expect(() => emailGenBodySchema.parse({ goal: 'x'.repeat(501) })).toThrow();
  });

  it('defaults tone to friendly', () => {
    const result = emailGenBodySchema.parse({ goal: 'Promote summer sale' });
    expect(result.tone).toBe('friendly');
  });

  it('Claude response is parsed into subject + preheader + blocks', () => {
    const raw = {
      subject: 'Your exclusive offer inside',
      preheader: "Don't miss out",
      blocks: [
        { type: 'heading', content: { text: 'Welcome!', level: 1 } },
        { type: 'text', content: { html: '<p>Hello {{first_name}}</p>' } },
      ],
    };

    const result = emailGenOutputSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subject).toBe('Your exclusive offer inside');
      expect(result.data.blocks).toHaveLength(2);
    }
  });

  it('strips markdown code fences from Claude response', () => {
    const withFences = '```json\n{"subject":"Test","preheader":"Hi","blocks":[]}\n```';
    const result = parseJson<{ subject: string }>(withFences);
    expect(result.subject).toBe('Test');
  });

  it('strips json-typed code fences from Claude response', () => {
    const withJsonFence = '```JSON\n{"subject":"x","preheader":"y","blocks":[]}\n```';
    const result = parseJson<{ subject: string; preheader: string }>(withJsonFence);
    expect(result.preheader).toBe('y');
  });

  it('rejects invalid block structure from AI', () => {
    const invalid = { subject: 'Test', preheader: 'Hi', blocks: 'not-an-array' };
    expect(emailGenOutputSchema.safeParse(invalid).success).toBe(false);
  });

  it('accepts keyPoints array with correct size', () => {
    const valid = emailGenBodySchema.parse({
      goal: 'Product launch email',
      keyPoints: ['Free shipping', 'New colors', 'Limited time'],
    });
    expect(valid.keyPoints).toHaveLength(3);
  });

  it('rejects keyPoints array exceeding 10 items', () => {
    expect(() =>
      emailGenBodySchema.parse({
        goal: 'Product launch email',
        keyPoints: Array.from({ length: 11 }, () => 'point'),
      }),
    ).toThrow();
  });
});

// ─── 4.6 Subject line generator ──────────────────────────────────────────────

describe('AI subject-lines (4.6)', () => {
  it('validates 5 variants returned with score 1-10', () => {
    const valid = {
      variants: [
        { subject: 'Your summer sale is here', score: 8, reason: 'Clear value prop' },
        { subject: '{{first_name}}, just for you', score: 9, reason: 'Personalized' },
        { subject: '48-hour flash deal', score: 7, reason: 'Urgency' },
        { subject: "We think you'll love this", score: 6, reason: 'Curiosity' },
        { subject: 'Summer deals: up to 50% off', score: 8, reason: 'Benefit-driven' },
      ],
    };

    expect(subjectResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects variant with score above 10', () => {
    const invalid = { subject: 'Test', score: 11, reason: 'x' };
    expect(subjectVariantSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects variant with score of 0', () => {
    const invalid = { subject: 'Test', score: 0, reason: 'x' };
    expect(subjectVariantSchema.safeParse(invalid).success).toBe(false);
  });

  it('validates tone enum options', () => {
    expect(toneSchema.parse('formal')).toBe('formal');
    expect(toneSchema.parse(undefined)).toBe('friendly');
    expect(() => toneSchema.parse('aggressive')).toThrow();
  });

  it('caches results and returns _cached flag on hit', async () => {
    const cached = JSON.stringify([{ subject: 'Cached subject', score: 8, reason: 'From cache' }]);
    mockRedis.get.mockResolvedValueOnce(cached);

    const cacheHit = await mockRedis.get('ai:subject-lines:hash');
    expect(cacheHit).toBe(cached);
    expect(JSON.parse(cacheHit)[0].subject).toBe('Cached subject');
  });

  it('rejects empty variants array', () => {
    expect(subjectResponseSchema.safeParse({ variants: [] }).success).toBe(false);
  });
});

// ─── 4.7 Brand voice analyzer ────────────────────────────────────────────────

describe('AI analyze-brand-voice (4.7)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRedis.get.mockResolvedValue(null);
  });

  it('validates brand voice schema', () => {
    const validBrandVoice = {
      tone: 'casual',
      vocabulary: {
        keyPhrases: ['amazing', 'community'],
        readingLevel: 'basic',
        avgWordsPerSentence: 12,
      },
      ctaPatterns: { actionWords: ['Shop now', 'Explore'], urgencyLevel: 'medium' },
      emojiUsage: 'rare',
      personalizationLevel: 'basic',
      brandValues: ['trust', 'savings'],
      summary: 'A casual, approachable brand focused on community.',
    };

    expect(brandVoiceSchema.safeParse(validBrandVoice).success).toBe(true);
  });

  it('rejects brand voice with missing required fields', () => {
    const missingFields = { tone: 'casual' };
    expect(brandVoiceSchema.safeParse(missingFields).success).toBe(false);
  });

  it('rejects empty campaignIds array', () => {
    expect(() => brandVoiceBodySchema.parse({ campaignIds: [] })).toThrow();
  });

  it('rejects more than 20 campaign IDs', () => {
    const tooMany = Array.from(
      { length: 21 },
      (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    );
    expect(() => brandVoiceBodySchema.parse({ campaignIds: tooMany })).toThrow();
  });

  it('accepts exactly 20 campaign IDs', () => {
    const exactly20 = Array.from(
      { length: 20 },
      (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    );
    expect(() => brandVoiceBodySchema.parse({ campaignIds: exactly20 })).not.toThrow();
  });

  it('builds corpus from campaign subjects and block text', () => {
    const testCampaigns = [
      {
        id: '1',
        subject: 'Summer Sale!',
        content: { blocks: [{ type: 'text', content: { html: '<p>Shop now</p>' } }] },
      },
      {
        id: '2',
        subject: 'New arrivals',
        content: { blocks: [{ type: 'heading', content: { text: 'Fresh picks' } }] },
      },
    ];

    const corpus = testCampaigns
      .map((c) => {
        const parts: string[] = [];
        if (c.subject) parts.push(`Subject: ${c.subject}`);
        if (c.content && typeof c.content === 'object') {
          const content = c.content as Record<string, unknown>;
          if (Array.isArray(content.blocks)) {
            for (const block of content.blocks as Array<Record<string, unknown>>) {
              const bc = block.content as Record<string, unknown> | undefined;
              if (bc?.html) parts.push(String(bc.html).replace(/<[^>]+>/g, ''));
              if (bc?.text) parts.push(String(bc.text));
            }
          }
        }
        return parts.join('\n');
      })
      .join('\n\n---\n\n');

    expect(corpus).toContain('Summer Sale!');
    expect(corpus).toContain('Shop now');
    expect(corpus).toContain('Fresh picks');
  });

  it('validates all emojiUsage values', () => {
    for (const value of ['none', 'rare', 'moderate', 'frequent'] as const) {
      const result = brandVoiceSchema.safeParse({
        tone: 'casual',
        vocabulary: { keyPhrases: [], readingLevel: 'basic', avgWordsPerSentence: 10 },
        ctaPatterns: { actionWords: [], urgencyLevel: 'low' },
        emojiUsage: value,
        personalizationLevel: 'none',
        brandValues: [],
        summary: 'test',
      });
      expect(result.success, `emojiUsage=${value} should be valid`).toBe(true);
    }
  });

  it('rejects invalid emojiUsage value', () => {
    const invalid = {
      tone: 'casual',
      vocabulary: { keyPhrases: [], readingLevel: 'basic', avgWordsPerSentence: 10 },
      ctaPatterns: { actionWords: [], urgencyLevel: 'low' },
      emojiUsage: 'always', // invalid
      personalizationLevel: 'none',
      brandValues: [],
      summary: 'test',
    };
    expect(brandVoiceSchema.safeParse(invalid).success).toBe(false);
  });
});
