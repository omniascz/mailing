/**
 * Email editor backend routes:
 *  - POST /api/v1/editor/countdown-gif       — generate animated countdown GIF
 *  - POST /api/v1/editor/scrape-product      — scrape product card from URL
 *  - POST /api/v1/editor/html-to-blocks      — convert HTML email to block JSON
 *  - POST /api/v1/editor/spam-check          — spam score analysis
 *  - POST /api/v1/editor/accessibility-check — WCAG accessibility audit
 *  - POST /api/v1/editor/dark-mode-check     — dark mode colour risk analysis
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
      bgColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      textColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      labelColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
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
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  secondaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
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
      const { html } = z.object({ html: z.string().min(10).max(80_000) }).parse(req.body);

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
      const { html } = z.object({ html: z.string().min(1).max(200_000) }).parse(req.body);

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

      const [row] = await db.select().from(brandKits).where(eq(brandKits.orgId, orgId)).limit(1);

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

  /**
   * POST /api/v1/editor/dark-mode-check
   * Analyse email schema for dark-mode colour risks.
   *
   * Returns a list of findings:
   *  - near-white text on white background (invisible in light → invisible in dark forced inversion)
   *  - near-black text on dark hero backgrounds (may wash out)
   *  - pure-white (#fff / #ffffff) background containers — dark clients may force-invert
   *  - missing dark-mode-safe image alternative (images without alt text)
   *  - hardcoded hex colours that are problematic in dark mode
   */
  app.post(
    '/api/v1/editor/dark-mode-check',
    { schema: { tags: ['Editor'], summary: 'Dark mode colour risk analysis' } },
    async (req) => {
      const body = z.object({ schema: z.record(z.unknown()) }).parse(req.body);
      const findings = analyzeDarkModeRisks(body.schema);
      return { data: { findings, safe: findings.length === 0 } };
    },
  );
}

// ─── Dark mode risk analyser (pure function) ──────────────────────────────────

interface DarkModeRisk {
  severity: 'high' | 'medium' | 'low';
  type: string;
  description: string;
  blockId?: string;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '');
  if (h.length !== 6 && h.length !== 3) return null;
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const sRGB = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

function contrastRatio(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  if (!c1 || !c2) return 21;
  const l1 = relativeLuminance(...c1);
  const l2 = relativeLuminance(...c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function analyzeDarkModeRisks(schema: Record<string, unknown>): DarkModeRisk[] {
  const findings: DarkModeRisk[] = [];
  const gs = (schema.globalStyles ?? {}) as Record<string, string>;
  const contentBg = gs.contentBackgroundColor ?? '#ffffff';
  const textColor = gs.textColor ?? '#1f2937';

  // 1. Body background is pure white — forced dark mode will make it very dark
  const contentRgb = hexToRgb(contentBg);
  if (contentRgb) {
    const lum = relativeLuminance(...contentRgb);
    if (lum > 0.9) {
      findings.push({
        severity: 'medium',
        type: 'white_background',
        description:
          `Content background ${contentBg} is near-white. Dark mode clients may force it to near-black, causing light-coloured text to disappear.`,
      });
    }
  }

  // 2. Low contrast between default text and content background
  const ratio = contrastRatio(textColor, contentBg);
  if (ratio < 4.5) {
    findings.push({
      severity: 'high',
      type: 'low_contrast',
      description: `Text colour ${textColor} on ${contentBg} has contrast ratio ${ratio.toFixed(1)}:1 — below WCAG AA (4.5:1). Will be unreadable in dark mode.`,
    });
  }

  // 3. Scan blocks for problematic inline colours
  const blocks = Array.isArray(schema.blocks) ? (schema.blocks as Record<string, unknown>[]) : [];

  for (const block of blocks) {
    const id = typeof block.id === 'string' ? block.id : undefined;
    const bg = typeof block.backgroundColor === 'string' ? block.backgroundColor : null;

    // Hero with very dark background AND dark text color set
    if (block.type === 'hero' && bg) {
      const bgRgb = hexToRgb(bg);
      if (bgRgb && relativeLuminance(...bgRgb) < 0.05) {
        const content = Array.isArray(block.content) ? (block.content as Record<string, unknown>[]) : [];
        for (const child of content) {
          const childColor = typeof child.color === 'string' ? child.color : null;
          if (childColor) {
            const childRgb = hexToRgb(childColor);
            if (childRgb && relativeLuminance(...childRgb) < 0.05) {
              findings.push({ severity: 'high', type: 'invisible_on_dark_hero', blockId: id, description: `Hero block ${id} has dark background ${bg} with dark text ${childColor}. Invisible in both light and dark mode.` });
            }
          }
        }
      }
    }

    // Button: check contrast
    if (block.type === 'button') {
      const btnBg = typeof block.backgroundColor === 'string' ? block.backgroundColor : '#2563eb';
      const btnText = typeof block.textColor === 'string' ? block.textColor : '#ffffff';
      const btnRatio = contrastRatio(btnText, btnBg);
      if (btnRatio < 3.0) {
        findings.push({ severity: 'medium', type: 'button_low_contrast', blockId: id, description: `Button ${id} has low contrast ${btnRatio.toFixed(1)}:1 (${btnText} on ${btnBg}). Consider darker bg or lighter text.` });
      }
    }

    // Images without alt text — dark mode may invert them and alt is needed for context
    if (block.type === 'image' && !block.alt) {
      findings.push({ severity: 'low', type: 'missing_alt', blockId: id, description: `Image block ${id} has no alt text. Dark mode forced-inversion may render the image unrecognisable.` });
    }
  }

  return findings;
}
