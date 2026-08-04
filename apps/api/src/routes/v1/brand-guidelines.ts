import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { brandGuidelines } from '../../db/schema/brand-guidelines.js';
import { checkBrandConsistency } from '../../services/ai/brand-consistency.js';
import { scrapeBrandFromUrl } from '../../services/brand/brand-scraper.js';
import { AppError } from '../../lib/app-error.js';

export default async function brandGuidelinesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/api/v1/brand-guidelines', async (req) => {
    const rows = await db
      .select()
      .from(brandGuidelines)
      .where(eq(brandGuidelines.orgId, req.user!.orgId))
      .orderBy(desc(brandGuidelines.createdAt));
    return { data: rows };
  });

  const guidelineSchema = z.object({
    name: z.string().min(1).max(100).default('Default'),
    guidelines: z.object({
      toneDescriptors: z.array(z.string()).default([]),
      forbiddenPhrases: z.array(z.string()).default([]),
      requiredPhrases: z.array(z.string()).default([]),
      primaryColors: z.array(z.string()).default([]),
      approvedFonts: z.array(z.string()).default([]),
      maxExclamationMarks: z.number().int().min(0).max(20).default(3),
      emojisAllowed: z.boolean().default(true),
      readingLevel: z.enum(['basic', 'intermediate', 'advanced']).default('intermediate'),
      voiceDescription: z.string().default(''),
      approvedExamples: z.array(z.string()).default([]),
    }),
  });

  app.post('/api/v1/brand-guidelines', async (req, reply) => {
    const body = guidelineSchema.parse(req.body);
    // Deactivate others if this is the first
    const existing = await db
      .select({ id: brandGuidelines.id })
      .from(brandGuidelines)
      .where(eq(brandGuidelines.orgId, req.user!.orgId));
    const [row] = await db
      .insert(brandGuidelines)
      .values({
        orgId: req.user!.orgId,
        name: body.name,
        guidelines: body.guidelines,
        active: existing.length === 0,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.put('/api/v1/brand-guidelines/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = guidelineSchema.partial().parse(req.body);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) patch['name'] = body.name;
    if (body.guidelines !== undefined) patch['guidelines'] = body.guidelines;
    const [row] = await db
      .update(brandGuidelines)
      .set(patch as never)
      .where(and(eq(brandGuidelines.id, id), eq(brandGuidelines.orgId, req.user!.orgId)))
      .returning();
    return { data: row };
  });

  app.post('/api/v1/brand-guidelines/:id/activate', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db
      .update(brandGuidelines)
      .set({ active: false })
      .where(eq(brandGuidelines.orgId, req.user!.orgId));
    const [row] = await db
      .update(brandGuidelines)
      .set({ active: true, updatedAt: new Date() })
      .where(and(eq(brandGuidelines.id, id), eq(brandGuidelines.orgId, req.user!.orgId)))
      .returning();
    if (!row) throw AppError.notFound('Brand guideline not found');
    return { data: row };
  });

  app.delete('/api/v1/brand-guidelines/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db
      .delete(brandGuidelines)
      .where(and(eq(brandGuidelines.id, id), eq(brandGuidelines.orgId, req.user!.orgId)));
    return reply.status(204).send();
  });

  /**
   * POST /api/v1/brand-guidelines/scrape-url — scan a website and extract a
   * brand kit (logo, colours, fonts). Optionally persist it as a new guideline.
   */
  app.post('/api/v1/brand-guidelines/scrape-url', async (req, reply) => {
    const body = z
      .object({
        url: z.string().url(),
        save: z.boolean().default(false),
        name: z.string().min(1).max(100).optional(),
      })
      .parse(req.body);

    const kit = await scrapeBrandFromUrl(body.url);

    if (!body.save) {
      return { data: { kit } };
    }

    const existing = await db
      .select({ id: brandGuidelines.id })
      .from(brandGuidelines)
      .where(eq(brandGuidelines.orgId, req.user!.orgId));
    const [row] = await db
      .insert(brandGuidelines)
      .values({
        orgId: req.user!.orgId,
        name: body.name ?? kit.siteName ?? 'Imported brand',
        guidelines: {
          toneDescriptors: [],
          forbiddenPhrases: [],
          requiredPhrases: [],
          primaryColors: kit.colors,
          approvedFonts: kit.fonts,
          maxExclamationMarks: 3,
          emojisAllowed: true,
          readingLevel: 'intermediate',
          voiceDescription: '',
          approvedExamples: [],
          logoUrl: kit.logoUrl,
        },
        active: existing.length === 0,
      })
      .returning();
    return reply.status(201).send({ data: { kit, guideline: row } });
  });

  /** POST /api/v1/brand-guidelines/check — check email against active guidelines */
  app.post('/api/v1/brand-guidelines/check', async (req) => {
    const body = z
      .object({
        subject: z.string().min(1).max(300),
        html: z.string().min(1),
        guidelineId: z.string().uuid().optional(),
      })
      .parse(req.body);

    const report = await checkBrandConsistency(
      req.user!.orgId,
      body.subject,
      body.html,
      body.guidelineId,
    );
    return { data: report };
  });
}
