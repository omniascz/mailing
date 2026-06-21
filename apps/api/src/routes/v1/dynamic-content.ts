import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { dynamicContentBlocks } from '../../db/schema/dynamic-content.js';
import { resolveDynamicContent, resolveBlock } from '../../services/campaigns/dynamic-content.js';

export default async function dynamicContentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/api/v1/dynamic-content', async (req) => {
    const rows = await db.select().from(dynamicContentBlocks)
      .where(eq(dynamicContentBlocks.orgId, req.user!.orgId));
    return { data: rows };
  });

  const variantSchema = z.object({
    id: z.string(),
    label: z.string(),
    conditions: z.array(z.object({
      triggerType: z.string(),
      operator: z.enum(['eq','neq','gt','lt','in','contains']),
      value: z.unknown().default(null),
    })),
    contentHtml: z.string(),
    priority: z.number().int().default(0),
  });

  const blockSchema = z.object({
    name: z.string().min(1).max(100),
    placeholderTag: z.string().regex(/^[\w-]+$/).max(50),
    variants: z.array(variantSchema).max(20),
    fallbackHtml: z.string(),
    dataSourceUrl: z.string().url().optional(),
    dataSourceHeaders: z.record(z.string()).optional(),
    cacheTtlSeconds: z.number().int().min(0).max(86400).default(300),
  });

  app.post('/api/v1/dynamic-content', async (req, reply) => {
    const body = blockSchema.parse(req.body);
    const [row] = await db.insert(dynamicContentBlocks).values({
      orgId: req.user!.orgId,
      name: body.name,
      placeholderTag: body.placeholderTag,
      variants: body.variants as never,
      fallbackHtml: body.fallbackHtml,
      dataSourceUrl: body.dataSourceUrl,
      dataSourceHeaders: body.dataSourceHeaders,
      cacheTtlSeconds: body.cacheTtlSeconds,
    }).returning();
    return reply.status(201).send({ data: row });
  });

  app.put('/api/v1/dynamic-content/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = blockSchema.partial().parse(req.body);
    const [row] = await db.update(dynamicContentBlocks)
      .set({ ...body, updatedAt: new Date() } as never)
      .where(and(eq(dynamicContentBlocks.id, id), eq(dynamicContentBlocks.orgId, req.user!.orgId)))
      .returning();
    return { data: row };
  });

  app.delete('/api/v1/dynamic-content/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.delete(dynamicContentBlocks)
      .where(and(eq(dynamicContentBlocks.id, id), eq(dynamicContentBlocks.orgId, req.user!.orgId)));
    return reply.status(204).send();
  });

  /** Preview — resolve a block for given context (for UI preview). */
  app.post('/api/v1/dynamic-content/:id/preview', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [block] = await db.select({ placeholderTag: dynamicContentBlocks.placeholderTag })
      .from(dynamicContentBlocks)
      .where(and(eq(dynamicContentBlocks.id, id), eq(dynamicContentBlocks.orgId, req.user!.orgId)))
      .limit(1);
    if (!block) return { data: { html: '' } };

    const body = z.object({
      openedAt: z.string().datetime().optional(),
      geoCountry: z.string().optional(),
      contactProps: z.record(z.unknown()).optional(),
    }).optional().parse(req.body);

    const html = await resolveBlock(req.user!.orgId, block.placeholderTag, {
      openedAt: body?.openedAt ? new Date(body.openedAt) : undefined,
      geoCountry: body?.geoCountry,
      contactProps: body?.contactProps,
    });
    return { data: { html } };
  });

  /** Resolve endpoint — called from email open tracking proxy to swap content. */
  app.post('/api/v1/dynamic-content/resolve', async (req) => {
    const body = z.object({
      orgId: z.string().uuid(),
      emailHtml: z.string().max(5_000_000),
      geoCountry: z.string().optional(),
      contactProps: z.record(z.unknown()).optional(),
    }).parse(req.body);
    const resolved = await resolveDynamicContent(body.orgId, body.emailHtml, {
      openedAt: new Date(),
      geoCountry: body.geoCountry,
      contactProps: body.contactProps,
    });
    return { data: { html: resolved } };
  });
}
