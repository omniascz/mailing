/**
 * Quote templates routes (#327).
 *
 *  GET    /api/v1/commerce/quote-templates           — list templates
 *  POST   /api/v1/commerce/quote-templates           — create template
 *  GET    /api/v1/commerce/quote-templates/:id       — get template
 *  PUT    /api/v1/commerce/quote-templates/:id       — update template
 *  DELETE /api/v1/commerce/quote-templates/:id       — deactivate template
 *  POST   /api/v1/commerce/quotes/:quoteId/from-template/:templateId — apply template to quote
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { quoteTemplates, quotes, type QuoteLineItemTemplate } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/app-error.js';

const idParam = z.object({ id: z.string().uuid() });

const lineItemSchema = z.object({
  sku: z.string().optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  qty: z.number().int().min(1).default(1),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).max(100).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  defaultLineItems: z.array(lineItemSchema).default([]),
  defaultCurrency: z.string().length(3).default('CZK'),
  defaultNotes: z.string().optional(),
  defaultTerms: z.string().optional(),
  pdfHtmlTemplate: z.string().optional(),
  pdfCss: z.string().optional(),
});

export default async function quoteTemplateRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/api/v1/commerce/quote-templates', async (req) => {
    const orgId = req.user!.orgId;
    const rows = await db
      .select()
      .from(quoteTemplates)
      .where(and(eq(quoteTemplates.orgId, orgId), eq(quoteTemplates.active, true)))
      .orderBy(desc(quoteTemplates.createdAt));
    return { data: rows, total: rows.length };
  });

  app.post('/api/v1/commerce/quote-templates', async (req, reply) => {
    const orgId = req.user!.orgId;
    const body = createSchema.parse(req.body);
    const [row] = await db
      .insert(quoteTemplates)
      .values({
        orgId,
        name: body.name,
        description: body.description ?? null,
        defaultLineItems: body.defaultLineItems as QuoteLineItemTemplate[],
        defaultCurrency: body.defaultCurrency,
        defaultNotes: body.defaultNotes ?? null,
        defaultTerms: body.defaultTerms ?? null,
        pdfHtmlTemplate: body.pdfHtmlTemplate ?? null,
        pdfCss: body.pdfCss ?? null,
      })
      .returning();
    return reply.code(201).send({ data: row });
  });

  app.get('/api/v1/commerce/quote-templates/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const orgId = req.user!.orgId;
    const [row] = await db
      .select()
      .from(quoteTemplates)
      .where(and(eq(quoteTemplates.id, id), eq(quoteTemplates.orgId, orgId)))
      .limit(1);
    if (!row) throw AppError.notFound('QuoteTemplate');
    return { data: row };
  });

  app.put('/api/v1/commerce/quote-templates/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const orgId = req.user!.orgId;
    const body = createSchema.partial().parse(req.body);
    const [row] = await db
      .update(quoteTemplates)
      .set({
        ...body,
        defaultLineItems: body.defaultLineItems as QuoteLineItemTemplate[] | undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(quoteTemplates.id, id), eq(quoteTemplates.orgId, orgId)))
      .returning();
    if (!row) throw AppError.notFound('QuoteTemplate');
    return { data: row };
  });

  app.delete('/api/v1/commerce/quote-templates/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const orgId = req.user!.orgId;
    await db
      .update(quoteTemplates)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(quoteTemplates.id, id), eq(quoteTemplates.orgId, orgId)));
    return reply.code(204).send();
  });

  /**
   * POST /api/v1/commerce/quotes/:quoteId/from-template/:templateId
   * Applies a template's line items, notes, terms, and currency to an existing quote.
   */
  app.post(
    '/api/v1/commerce/quotes/:quoteId/from-template/:templateId',
    async (req) => {
      const { quoteId, templateId } = z
        .object({ quoteId: z.string().uuid(), templateId: z.string().uuid() })
        .parse(req.params);
      const orgId = req.user!.orgId;

      const [tmpl] = await db
        .select()
        .from(quoteTemplates)
        .where(and(eq(quoteTemplates.id, templateId), eq(quoteTemplates.orgId, orgId)))
        .limit(1);
      if (!tmpl) throw AppError.notFound('QuoteTemplate');

      // Compute totals from template line items
      const items = (tmpl.defaultLineItems as QuoteLineItemTemplate[]) ?? [];
      const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
      const discountTotal = items.reduce((s, i) => {
        const disc = ((i.discount ?? 0) / 100) * i.qty * i.unitPrice;
        return s + disc;
      }, 0);
      const total = subtotal - discountTotal;

      const [updated] = await db
        .update(quotes)
        .set({
          lineItems: tmpl.defaultLineItems,
          currency: tmpl.defaultCurrency,
          notes: tmpl.defaultNotes,
          terms: tmpl.defaultTerms,
          subtotal: subtotal.toFixed(2),
          discountTotal: discountTotal.toFixed(2),
          taxTotal: '0.00',
          total: total.toFixed(2),
          updatedAt: new Date(),
        })
        .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)))
        .returning();
      if (!updated) throw AppError.notFound('Quote');
      return { data: updated };
    },
  );
}
