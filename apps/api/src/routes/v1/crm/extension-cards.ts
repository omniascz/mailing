/**
 * CRM Extension Cards SDK routes (#348).
 *
 *  GET  /api/v1/app-studio/apps/:appId/cards          — list cards for an app
 *  POST /api/v1/app-studio/apps/:appId/cards          — register a card
 *  PUT  /api/v1/app-studio/apps/:appId/cards/:cardId  — update card
 *  DELETE /api/v1/app-studio/apps/:appId/cards/:cardId — remove card
 *
 *  GET  /api/v1/crm/:entityType/:entityId/extension-cards         — get cards for a CRM record
 *  POST /api/v1/crm/:entityType/:entityId/extension-cards/:cardId/invoke — invoke a card action
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { crmExtensionCards, appStudioApps } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/app-error.js';

const entityTypeEnum = z.enum(['contact', 'deal', 'account', 'ticket']);
const positionEnum = z.enum(['sidebar', 'top', 'bottom']);

const cardSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  iconUrl: z.string().url().optional(),
  entityTypes: z.array(entityTypeEnum).min(1).default(['contact']),
  position: positionEnum.default('sidebar'),
  dataUrl: z.string().url().max(2048),
  actionUrl: z.string().url().max(2048).optional(),
  iframeSandbox: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

export default async function extensionCardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // ─── Card Registration (App Studio) ─────────────────────────────────────

  app.get('/api/v1/app-studio/apps/:appId/cards', async (req) => {
    const { appId } = z.object({ appId: z.string().uuid() }).parse(req.params);
    const orgId = req.user!.orgId;

    // Verify app belongs to org
    const [app_] = await db
      .select({ id: appStudioApps.id })
      .from(appStudioApps)
      .where(and(eq(appStudioApps.id, appId), eq(appStudioApps.orgId, orgId)))
      .limit(1);
    if (!app_) throw AppError.notFound('App');

    const rows = await db
      .select()
      .from(crmExtensionCards)
      .where(and(eq(crmExtensionCards.appId, appId), eq(crmExtensionCards.orgId, orgId)));
    return { data: rows };
  });

  app.post('/api/v1/app-studio/apps/:appId/cards', async (req, reply) => {
    const { appId } = z.object({ appId: z.string().uuid() }).parse(req.params);
    const orgId = req.user!.orgId;
    const body = cardSchema.parse(req.body);

    const [app_] = await db
      .select({ id: appStudioApps.id })
      .from(appStudioApps)
      .where(and(eq(appStudioApps.id, appId), eq(appStudioApps.orgId, orgId)))
      .limit(1);
    if (!app_) throw AppError.notFound('App');

    const [row] = await db
      .insert(crmExtensionCards)
      .values({
        orgId,
        appId,
        key: body.key,
        name: body.name,
        description: body.description ?? null,
        iconUrl: body.iconUrl ?? null,
        entityTypes: body.entityTypes,
        position: body.position,
        dataUrl: body.dataUrl,
        actionUrl: body.actionUrl ?? null,
        iframeSandbox: body.iframeSandbox,
        enabled: body.enabled,
      })
      .returning();
    return reply.code(201).send({ data: row });
  });

  app.put('/api/v1/app-studio/apps/:appId/cards/:cardId', async (req) => {
    const { appId, cardId } = z
      .object({ appId: z.string().uuid(), cardId: z.string().uuid() })
      .parse(req.params);
    const orgId = req.user!.orgId;
    const body = cardSchema.partial().parse(req.body);

    const [row] = await db
      .update(crmExtensionCards)
      .set({ ...body, updatedAt: new Date() })
      .where(
        and(
          eq(crmExtensionCards.id, cardId),
          eq(crmExtensionCards.appId, appId),
          eq(crmExtensionCards.orgId, orgId),
        ),
      )
      .returning();
    if (!row) throw AppError.notFound('ExtensionCard');
    return { data: row };
  });

  app.delete('/api/v1/app-studio/apps/:appId/cards/:cardId', async (req, reply) => {
    const { appId, cardId } = z
      .object({ appId: z.string().uuid(), cardId: z.string().uuid() })
      .parse(req.params);
    const orgId = req.user!.orgId;
    await db
      .delete(crmExtensionCards)
      .where(
        and(
          eq(crmExtensionCards.id, cardId),
          eq(crmExtensionCards.appId, appId),
          eq(crmExtensionCards.orgId, orgId),
        ),
      );
    return reply.code(204).send();
  });

  // ─── CRM Record Page Integration ─────────────────────────────────────────

  /**
   * GET /api/v1/crm/:entityType/:entityId/extension-cards
   * Returns all enabled cards for this entity type, with data fetched from
   * each card's dataUrl (proxied by the platform to avoid CORS issues).
   */
  app.get('/api/v1/crm/:entityType/:entityId/extension-cards', async (req) => {
    const { entityType, entityId } = z
      .object({ entityType: entityTypeEnum, entityId: z.string().uuid() })
      .parse(req.params);
    const orgId = req.user!.orgId;

    const cards = await db
      .select()
      .from(crmExtensionCards)
      .where(and(eq(crmExtensionCards.orgId, orgId), eq(crmExtensionCards.enabled, true)));

    // Filter by entityType
    const applicable = cards.filter((c) => (c.entityTypes as string[]).includes(entityType));

    // Fetch data from each card's dataUrl in parallel (with timeout)
    const results = await Promise.allSettled(
      applicable.map(async (card) => {
        const url = new URL(card.dataUrl);
        url.searchParams.set('entity_type', entityType);
        url.searchParams.set('entity_id', entityId);
        url.searchParams.set('org_id', orgId);

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        try {
          const resp = await fetch(url.toString(), { signal: ctrl.signal });
          const data = resp.ok ? await resp.json() : { error: `HTTP ${resp.status}` };
          return { cardId: card.id, key: card.key, name: card.name, position: card.position, data };
        } catch {
          return {
            cardId: card.id,
            key: card.key,
            name: card.name,
            position: card.position,
            data: { error: 'Timeout or network error' },
          };
        } finally {
          clearTimeout(timer);
        }
      }),
    );

    const data = results.map((r) => (r.status === 'fulfilled' ? r.value : null)).filter(Boolean);
    return { data };
  });

  /**
   * POST /api/v1/crm/:entityType/:entityId/extension-cards/:cardId/invoke
   * Invokes a card action by POSTing to the card's actionUrl.
   */
  app.post('/api/v1/crm/:entityType/:entityId/extension-cards/:cardId/invoke', async (req) => {
    const { entityType, entityId, cardId } = z
      .object({
        entityType: entityTypeEnum,
        entityId: z.string().uuid(),
        cardId: z.string().uuid(),
      })
      .parse(req.params);
    const { actionKey } = z.object({ actionKey: z.string().min(1) }).parse(req.body);
    const orgId = req.user!.orgId;

    const [card] = await db
      .select()
      .from(crmExtensionCards)
      .where(and(eq(crmExtensionCards.id, cardId), eq(crmExtensionCards.orgId, orgId)))
      .limit(1);
    if (!card) throw AppError.notFound('ExtensionCard');
    if (!card.actionUrl) throw AppError.badRequest('Card has no actionUrl');

    const resp = await fetch(card.actionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_key: actionKey,
        entity_type: entityType,
        entity_id: entityId,
        org_id: orgId,
      }),
    });

    const result = resp.ok ? await resp.json() : { error: `HTTP ${resp.status}` };
    return { data: result };
  });
}
