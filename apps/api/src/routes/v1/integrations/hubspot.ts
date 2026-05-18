/**
 * HubSpot integration routes (#226)
 *
 *  GET  /api/v1/integrations/hubspot/connect      — start OAuth flow
 *  GET  /api/v1/integrations/hubspot/callback     — OAuth callback
 *  GET  /api/v1/integrations/hubspot              — connection status
 *  DELETE /api/v1/integrations/hubspot            — disconnect
 *  POST /api/v1/integrations/hubspot/sync/contacts — pull contacts from HubSpot
 *  POST /api/v1/integrations/hubspot/sync/deals    — pull deals from HubSpot
 *  POST /api/v1/integrations/hubspot/push/contact/:contactId — push contact to HubSpot
 *  POST /api/v1/integrations/hubspot/push/deal/:dealId       — push deal to HubSpot
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { hubspotConnections } from '../../../db/schema/hubspot.js';
import { authorizeUrl, exchangeCode } from '../../../integrations/hubspot/client.js';
import { pullContactsFromHubSpot, pullDealsFromHubSpot, pushContactToHubSpot, pushDealToHubSpot } from '../../../integrations/hubspot/sync.js';
import { AppError } from '../../../lib/app-error.js';

const hubspotRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/integrations/hubspot/connect', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['HubSpot'] },
  }, async (req, reply) => {
    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const redirectUri = process.env.HUBSPOT_REDIRECT_URI;
    if (!clientId || !redirectUri) throw AppError.badRequest('HubSpot OAuth not configured');
    const state = Buffer.from(JSON.stringify({ orgId: req.user!.orgId })).toString('base64url');
    return reply.redirect(authorizeUrl({ clientId, redirectUri, state }));
  });

  app.get('/api/v1/integrations/hubspot/callback', {
    schema: { tags: ['HubSpot'] },
  }, async (req, reply) => {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
    if (error) throw AppError.badRequest(`HubSpot OAuth error: ${error}`);
    if (!code || !state) throw AppError.badRequest('Missing code or state');

    const clientId = process.env.HUBSPOT_CLIENT_ID!;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET!;
    const redirectUri = process.env.HUBSPOT_REDIRECT_URI!;
    const { orgId } = JSON.parse(Buffer.from(state, 'base64url').toString()) as { orgId: string };

    await exchangeCode({ orgId, code, clientId, clientSecret, redirectUri });
    return reply.redirect(`${process.env.APP_URL ?? 'http://localhost:3000'}/settings/integrations/hubspot?connected=1`);
  });

  app.get('/api/v1/integrations/hubspot', {
    preHandler: [app.authenticate],
    schema: { tags: ['HubSpot'] },
  }, async (req, reply) => {
    const [conn] = await db.select({
      hubId: hubspotConnections.hubId,
      hubDomain: hubspotConnections.hubDomain,
      syncContacts: hubspotConnections.syncContacts,
      syncDeals: hubspotConnections.syncDeals,
      lastSyncedAt: hubspotConnections.lastSyncedAt,
    }).from(hubspotConnections).where(eq(hubspotConnections.orgId, req.user!.orgId)).limit(1);
    return reply.send({ data: conn ?? null });
  });

  app.delete('/api/v1/integrations/hubspot', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['HubSpot'] },
  }, async (req, reply) => {
    await db.delete(hubspotConnections).where(eq(hubspotConnections.orgId, req.user!.orgId));
    return reply.send({ data: { disconnected: true } });
  });

  app.patch('/api/v1/integrations/hubspot', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['HubSpot'] },
  }, async (req, reply) => {
    const body = z.object({
      syncContacts: z.boolean().optional(),
      syncDeals: z.boolean().optional(),
    }).parse(req.body);
    const [updated] = await db.update(hubspotConnections).set({ ...body, updatedAt: new Date() }).where(eq(hubspotConnections.orgId, req.user!.orgId)).returning();
    if (!updated) throw AppError.notFound('HubSpot connection');
    return reply.send({ data: updated });
  });

  app.post('/api/v1/integrations/hubspot/sync/contacts', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['HubSpot'] },
  }, async (req, reply) => {
    const result = await pullContactsFromHubSpot(req.user!.orgId);
    return reply.send({ data: result });
  });

  app.post('/api/v1/integrations/hubspot/sync/deals', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['HubSpot'] },
  }, async (req, reply) => {
    const result = await pullDealsFromHubSpot(req.user!.orgId);
    return reply.send({ data: result });
  });

  app.post('/api/v1/integrations/hubspot/push/contact/:contactId', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['HubSpot'] },
  }, async (req, reply) => {
    const { contactId } = req.params as { contactId: string };
    await pushContactToHubSpot(req.user!.orgId, contactId);
    return reply.send({ data: { pushed: true } });
  });

  app.post('/api/v1/integrations/hubspot/push/deal/:dealId', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['HubSpot'] },
  }, async (req, reply) => {
    const { dealId } = req.params as { dealId: string };
    await pushDealToHubSpot(req.user!.orgId, dealId);
    return reply.send({ data: { pushed: true } });
  });
};

export default hubspotRoutes;
