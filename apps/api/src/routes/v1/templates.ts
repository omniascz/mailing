/**
 * Template library routes:
 *  - GET  /api/v1/templates              — list all templates (optional ?category=)
 *  - GET  /api/v1/templates/:id          — get single template with full schema
 *  - POST /api/v1/templates/:id/use      — clone template schema into a new campaign draft
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { templates as campaignTemplates } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

import {
  TEMPLATES,
  getTemplateById,
  getTemplatesByCategory,
  type TemplateCategory,
} from '../../services/editor/templates/index.js';

const VALID_CATEGORIES = [
  'newsletter',
  'promo',
  'transactional',
  'event',
  'onboarding',
  'seasonal',
  'ecommerce',
] as const;

export default async function templateRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * GET /api/v1/templates
   * List built-in templates. Returns metadata only (no full schema) for performance.
   * Query params: ?category=newsletter (optional)
   */
  app.get(
    '/api/v1/templates',
    { schema: { tags: ['Templates'], summary: 'List built-in email templates' } },
    async (req) => {
      const { category } = z
        .object({ category: z.enum(VALID_CATEGORIES).optional() })
        .parse(req.query);

      const list = category ? getTemplatesByCategory(category as TemplateCategory) : TEMPLATES;

      // Return metadata only — omit the full schema for the list view
      const data = list.map(({ id, name, category: cat, description, thumbnailUrl }) => ({
        id,
        name,
        category: cat,
        description,
        thumbnailUrl,
      }));

      return { data, total: data.length };
    },
  );

  /**
   * GET /api/v1/templates/:id
   * Get a single template including the full block schema.
   */
  app.get(
    '/api/v1/templates/:id',
    { schema: { tags: ['Templates'], summary: 'Get template with full schema' } },
    async (req) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const tpl = getTemplateById(id);
      if (!tpl) throw AppError.notFound('Template');
      return { data: tpl };
    },
  );

  /**
   * POST /api/v1/templates/:id/use
   * Clone a built-in template into a new saved template record for this org.
   *
   * Body: { name?: string }  — optional override for the saved template name
   * Returns: { data: { id, name, schema } }  — the new org-owned template record
   */
  app.post(
    '/api/v1/templates/:id/use',
    { schema: { tags: ['Templates'], summary: 'Clone built-in template into org templates' } },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const { name } = z
        .object({ name: z.string().min(1).max(255).optional() })
        .parse(req.body ?? {});

      const tpl = getTemplateById(id);
      if (!tpl) throw AppError.notFound('Template');

      const schema = tpl.schema as {
        subject?: string;
        preheader?: string;
        blocks?: unknown[];
        globalStyles?: Record<string, unknown>;
      };

      const [row] = await db
        .insert(campaignTemplates)
        .values({
          orgId: req.user!.orgId,
          name: name ?? tpl.name,
          description: tpl.description,
          subject: schema.subject ?? '',
          preheader: schema.preheader ?? '',
          blocks: schema.blocks ?? [],
          globalStyles: schema.globalStyles ?? {},
        })
        .returning();

      return reply.code(201).send({ data: row });
    },
  );

  // ─── Org-owned saved templates (CRUD) ──────────────────────────────────────
  // Separate /saved-templates prefix to avoid clashing with the built-in
  // static IDs (gallery_foo) vs UUID-based saved records.

  const savedIdParam = z.object({ id: z.string().uuid() });

  const updateSavedSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(1000).nullable().optional(),
    subject: z.string().max(255).optional(),
    preheader: z.string().max(255).optional(),
    blocks: z.array(z.unknown()).optional(),
    globalStyles: z.record(z.unknown()).optional(),
  });

  const createSavedSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    subject: z.string().max(255).optional(),
    preheader: z.string().max(255).optional(),
    blocks: z.array(z.unknown()).optional(),
    globalStyles: z.record(z.unknown()).optional(),
  });

  /** List saved (org-owned) templates */
  app.get(
    '/api/v1/saved-templates',
    { schema: { tags: ['Templates'], summary: 'List org-owned saved templates' } },
    async (req) => {
      const rows = await db
        .select()
        .from(campaignTemplates)
        .where(
          and(eq(campaignTemplates.orgId, req.user!.orgId), isNull(campaignTemplates.deletedAt)),
        )
        .orderBy(desc(campaignTemplates.updatedAt));
      return { data: rows };
    },
  );

  /** Create a saved template from scratch */
  app.post(
    '/api/v1/saved-templates',
    { schema: { tags: ['Templates'], summary: 'Create org-owned template' } },
    async (req, reply) => {
      const body = createSavedSchema.parse(req.body);
      const [row] = await db
        .insert(campaignTemplates)
        .values({
          orgId: req.user!.orgId,
          name: body.name,
          description: body.description,
          subject: body.subject ?? '',
          preheader: body.preheader ?? '',
          blocks: body.blocks ?? [],
          globalStyles: body.globalStyles ?? {},
        })
        .returning();
      return reply.code(201).send({ data: row });
    },
  );

  /** Get one saved template */
  app.get(
    '/api/v1/saved-templates/:id',
    { schema: { tags: ['Templates'], summary: 'Get org-owned template' } },
    async (req) => {
      const { id } = savedIdParam.parse(req.params);
      const [row] = await db
        .select()
        .from(campaignTemplates)
        .where(
          and(
            eq(campaignTemplates.id, id),
            eq(campaignTemplates.orgId, req.user!.orgId),
            isNull(campaignTemplates.deletedAt),
          ),
        )
        .limit(1);
      if (!row) throw AppError.notFound('Template');
      return { data: row };
    },
  );

  /** Update a saved template */
  app.put(
    '/api/v1/saved-templates/:id',
    { schema: { tags: ['Templates'], summary: 'Update org-owned template' } },
    async (req) => {
      const { id } = savedIdParam.parse(req.params);
      const patch = updateSavedSchema.parse(req.body);
      const [row] = await db
        .update(campaignTemplates)
        .set({ ...patch, updatedAt: new Date() })
        .where(
          and(
            eq(campaignTemplates.id, id),
            eq(campaignTemplates.orgId, req.user!.orgId),
            isNull(campaignTemplates.deletedAt),
          ),
        )
        .returning();
      if (!row) throw AppError.notFound('Template');
      return { data: row };
    },
  );

  /** Soft-delete a saved template (deletedAt) */
  app.delete(
    '/api/v1/saved-templates/:id',
    { schema: { tags: ['Templates'], summary: 'Soft-delete org-owned template' } },
    async (req, reply) => {
      const { id } = savedIdParam.parse(req.params);
      const [row] = await db
        .update(campaignTemplates)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(campaignTemplates.id, id),
            eq(campaignTemplates.orgId, req.user!.orgId),
            isNull(campaignTemplates.deletedAt),
          ),
        )
        .returning();
      if (!row) throw AppError.notFound('Template');
      return reply.code(204).send();
    },
  );
}
