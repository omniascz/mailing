/**
 * Email editor backend routes:
 *  - POST /api/v1/editor/countdown-gif       — generate animated countdown GIF
 *  - POST /api/v1/editor/scrape-product      — scrape product card from URL
 *  - POST /api/v1/editor/html-to-blocks      — convert HTML email to block JSON
 *  - POST /api/v1/editor/spam-check          — spam score analysis
 *  - POST /api/v1/editor/accessibility-check — WCAG accessibility audit
 *  - GET/POST/PUT/DELETE /api/v1/saved-blocks — reusable block library
 *  - GET/PUT /api/v1/brand-kit               — org visual identity
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { savedBlocks, brandKits } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { generateCountdownGif } from '../../services/editor/countdown-gif.js';
import { scrapeProduct } from '../../services/editor/product-scraper.js';
import { htmlToBlocks } from '../../services/editor/html-to-blocks.js';
import { checkSpam } from '../../services/editor/spam-checker.js';
import { checkAccessibility } from '../../services/editor/accessibility-checker.js';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const countdownGifSchema = z.object({
  targetDate: z.string().datetime({ message: 'targetDate must be an ISO 8601 datetime string' }),
  style: z
    .object({
      bgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      labelColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      fontFamily: z.string().max(200).optional(),
      width: z.number().int().min(100).max(1200).optional(),
      height: z.number().int().min(40).max(400).optional(),
    })
    .optional(),
  fps: z.number().int().min(1).max(10).optional(),
  durationSeconds: z.number().int().min(1).max(60).optional(),
});

const scrapeProductSchema = z.object({
  url: z.string().url(),
});

const savedBlockCreateSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().min(1).max(100).optional(),
  blockData: z.record(z.unknown()),
  thumbnailUrl: z.string().url().max(1024).optional(),
});

const savedBlockUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  category: z.string().min(1).max(100).optional(),
  blockData: z.record(z.unknown()).optional(),
  thumbnailUrl: z.string().url().max(1024).nullable().optional(),
});

const savedBlockIdParam = z.object({ id: z.string().uuid() });

const brandKitUpdateSchema = z.object({
  logoUrl: z.string().url().max(1024).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fontHeading: z.string().max(100).optional(),
  fontBody: z.string().max(100).optional(),
  footerText: z.string().max(5000).nullable().optional(),
});

// ─── Route plugin ─────────────────────────────────────────────────────────────

export default async function editorRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // ─── Countdown GIF ──────────────────────────────────────────────────────────

  /**
   * POST /api/v1/editor/countdown-gif
   * Generate an animated GIF countdown timer.
   * Returns the raw GIF binary (image/gif).
   */
  app.post(
    '/api/v1/editor/countdown-gif',
    { schema: { tags: ['Editor'], summary: 'Generate animated countdown GIF' } },
    async (req, reply) => {
      const opts = countdownGifSchema.parse(req.body);

      const targetMs = new Date(opts.targetDate).getTime();
      if (targetMs <= Date.now()) {
        throw AppError.badRequest('targetDate must be in the future');
      }

      const buf = await generateCountdownGif(opts);

      return reply
        .header('Content-Type', 'image/gif')
        .header('Content-Disposition', 'inline; filename="countdown.gif"')
        .header('Cache-Control', 'no-store') // countdown is time-sensitive
        .send(buf);
    },
  );

  // ─── Product card scraper ────────────────────────────────────────────────────

  /**
   * POST /api/v1/editor/scrape-product
   * Scrape structured product data from a URL using Claude API.
   *
   * Body: { url: string }
   * Returns: { data: ProductCard }
   */
  app.post(
    '/api/v1/editor/scrape-product',
    { schema: { tags: ['Editor'], summary: 'Scrape product data from URL' } },
    async (req) => {
      const { url } = scrapeProductSchema.parse(req.body);

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw AppError.internal('Product scraping requires ANTHROPIC_API_KEY environment variable');
      }

      const product = await scrapeProduct(url, apiKey);
      return { data: product };
    },
  );

  // ─── HTML → blocks conversion ────────────────────────────────────────────────

  /**
   * POST /api/v1/editor/html-to-blocks
   * Convert a raw HTML email string to ForgeMsg EmailSchema block JSON via Claude Sonnet.
   *
   * Body: { html: string }
   * Returns: { data: { subject, preheader, globalStyles, blocks } }
   */
  app.post(
    '/api/v1/editor/html-to-blocks',
    { schema: { tags: ['Editor'], summary: 'Convert HTML email to block JSON' } },
    async (req) => {
      const { html } = z
        .object({ html: z.string().min(10).max(80_000) })
        .parse(req.body);

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw AppError.internal('HTML conversion requires ANTHROPIC_API_KEY environment variable');
      }

      const result = await htmlToBlocks(html, apiKey);
      return { data: result };
    },
  );

  // ─── Spam score checker ───────────────────────────────────────────────────────

  /**
   * POST /api/v1/editor/spam-check
   * Run spam heuristics on subject + HTML body.
   *
   * Body: { subject: string, html: string, hasPlainText?: boolean }
   * Returns: { data: { score, issues, verdict } }
   */
  app.post(
    '/api/v1/editor/spam-check',
    { schema: { tags: ['Editor'], summary: 'Check email spam score' } },
    async (req) => {
      const { subject, html, hasPlainText } = z
        .object({
          subject: z.string().max(500).default(''),
          html: z.string().min(1).max(200_000),
          hasPlainText: z.boolean().default(false),
        })
        .parse(req.body);

      const result = checkSpam(subject, html, hasPlainText);
      return { data: result };
    },
  );

  // ─── Accessibility checker ────────────────────────────────────────────────────

  /**
   * POST /api/v1/editor/accessibility-check
   * WCAG 2.1 AA accessibility audit using rule-based + Claude AI checks.
   *
   * Body: { html: string }
   * Returns: { data: { issues, score } }
   */
  app.post(
    '/api/v1/editor/accessibility-check',
    { schema: { tags: ['Editor'], summary: 'WCAG accessibility audit for HTML email' } },
    async (req) => {
      const { html } = z
        .object({ html: z.string().min(1).max(200_000) })
        .parse(req.body);

      const apiKey = process.env.ANTHROPIC_API_KEY;
      const result = await checkAccessibility(html, apiKey);
      return { data: result };
    },
  );

  // ─── Saved blocks ────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/saved-blocks
   * List reusable blocks for this org. Optionally filter by ?category=<category>.
   */
  app.get(
    '/api/v1/saved-blocks',
    { schema: { tags: ['Editor'], summary: 'List saved blocks' } },
    async (req) => {
      const { category } = z.object({ category: z.string().optional() }).parse(req.query);

      const whereClause = category
        ? and(eq(savedBlocks.orgId, req.user!.orgId), eq(savedBlocks.category, category))
        : eq(savedBlocks.orgId, req.user!.orgId);

      const rows = await db
        .select()
        .from(savedBlocks)
        .where(whereClause)
        .orderBy(asc(savedBlocks.category), desc(savedBlocks.updatedAt));

      return { data: rows };
    },
  );

  /**
   * POST /api/v1/saved-blocks
   * Save a new reusable block.
   */
  app.post(
    '/api/v1/saved-blocks',
    { schema: { tags: ['Editor'], summary: 'Create saved block' } },
    async (req, reply) => {
      const body = savedBlockCreateSchema.parse(req.body);

      const [row] = await db
        .insert(savedBlocks)
        .values({
          orgId: req.user!.orgId,
          createdBy: req.user!.userId,
          ...body,
        })
        .returning();

      return reply.code(201).send({ data: row });
    },
  );

  /**
   * GET /api/v1/saved-blocks/:id
   */
  app.get(
    '/api/v1/saved-blocks/:id',
    { schema: { tags: ['Editor'], summary: 'Get saved block' } },
    async (req) => {
      const { id } = savedBlockIdParam.parse(req.params);
      const [row] = await db
        .select()
        .from(savedBlocks)
        .where(and(eq(savedBlocks.id, id), eq(savedBlocks.orgId, req.user!.orgId)))
        .limit(1);
      if (!row) throw AppError.notFound('Saved block');
      return { data: row };
    },
  );

  /**
   * PUT /api/v1/saved-blocks/:id
   * Update name, category, blockData, or thumbnailUrl.
   */
  app.put(
    '/api/v1/saved-blocks/:id',
    { schema: { tags: ['Editor'], summary: 'Update saved block' } },
    async (req) => {
      const { id } = savedBlockIdParam.parse(req.params);
      const patch = savedBlockUpdateSchema.parse(req.body);

      const [row] = await db
        .update(savedBlocks)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(savedBlocks.id, id), eq(savedBlocks.orgId, req.user!.orgId)))
        .returning();
      if (!row) throw AppError.notFound('Saved block');
      return { data: row };
    },
  );

  /**
   * DELETE /api/v1/saved-blocks/:id
   */
  app.delete(
    '/api/v1/saved-blocks/:id',
    { schema: { tags: ['Editor'], summary: 'Delete saved block' } },
    async (req, reply) => {
      const { id } = savedBlockIdParam.parse(req.params);
      const [row] = await db
        .delete(savedBlocks)
        .where(and(eq(savedBlocks.id, id), eq(savedBlocks.orgId, req.user!.orgId)))
        .returning();
      if (!row) throw AppError.notFound('Saved block');
      return reply.code(204).send();
    },
  );

  // ─── Brand kit ───────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/brand-kit
   * Get the org's brand kit, creating a default one if it doesn't exist yet.
   */
  app.get(
    '/api/v1/brand-kit',
    { schema: { tags: ['Editor'], summary: 'Get brand kit' } },
    async (req) => {
      const orgId = req.user!.orgId;

      const [row] = await db
        .select()
        .from(brandKits)
        .where(eq(brandKits.orgId, orgId))
        .limit(1);

      if (row) return { data: row };

      // Auto-create with defaults on first access
      const [created] = await db
        .insert(brandKits)
        .values({ orgId })
        .onConflictDoNothing()
        .returning();

      return { data: created };
    },
  );

  /**
   * PUT /api/v1/brand-kit
   * Upsert the org's brand kit.
   */
  app.put(
    '/api/v1/brand-kit',
    { schema: { tags: ['Editor'], summary: 'Update brand kit' } },
    async (req) => {
      const orgId = req.user!.orgId;
      const patch = brandKitUpdateSchema.parse(req.body);

      const [row] = await db
        .insert(brandKits)
        .values({ orgId, ...patch })
        .onConflictDoUpdate({
          target: brandKits.orgId,
          set: { ...patch, updatedAt: new Date() },
        })
        .returning();

      return { data: row };
    },
  );
}
