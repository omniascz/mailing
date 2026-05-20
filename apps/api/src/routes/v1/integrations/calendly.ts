/**
 * Calendly integration routes (#227)
 *
 *  GET  /api/v1/integrations/calendly/connect   — start OAuth
 *  GET  /api/v1/integrations/calendly/callback  — OAuth callback
 *  GET  /api/v1/integrations/calendly           — connection status
 *  DELETE /api/v1/integrations/calendly         — disconnect
 *  PATCH /api/v1/integrations/calendly          — update settings
 *  POST /api/v1/webhooks/calendly               — webhook receiver (public, signature-verified)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { calendlyConnections } from '../../../db/schema/calendly.js';
import { authorizeUrl, exchangeCode } from '../../../integrations/calendly/client.js';
import {
  verifyWebhookSignature,
  processCalendlyEvent,
  type CalendlyInviteeEvent,
} from '../../../integrations/calendly/webhook.js';
import { AppError } from '../../../lib/app-error.js';

const calendlyRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/integrations/calendly/connect',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['Calendly'] },
    },
    async (req, reply) => {
      const clientId = process.env.CALENDLY_CLIENT_ID;
      const redirectUri = process.env.CALENDLY_REDIRECT_URI;
      if (!clientId || !redirectUri) throw AppError.badRequest('Calendly OAuth not configured');
      const state = Buffer.from(JSON.stringify({ orgId: req.user!.orgId })).toString('base64url');
      return reply.redirect(authorizeUrl({ clientId, redirectUri, state }));
    },
  );

  app.get(
    '/api/v1/integrations/calendly/callback',
    {
      schema: { tags: ['Calendly'] },
    },
    async (req, reply) => {
      const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
      if (error) throw AppError.badRequest(`Calendly OAuth error: ${error}`);
      if (!code || !state) throw AppError.badRequest('Missing code or state');

      const clientId = process.env.CALENDLY_CLIENT_ID!;
      const clientSecret = process.env.CALENDLY_CLIENT_SECRET!;
      const redirectUri = process.env.CALENDLY_REDIRECT_URI!;
      const { orgId } = JSON.parse(Buffer.from(state, 'base64url').toString()) as { orgId: string };

      await exchangeCode({ orgId, code, clientId, clientSecret, redirectUri });
      return reply.redirect(
        `${process.env.APP_URL ?? 'http://localhost:3000'}/settings/integrations/calendly?connected=1`,
      );
    },
  );

  app.get(
    '/api/v1/integrations/calendly',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Calendly'] },
    },
    async (req, reply) => {
      const [conn] = await db
        .select({
          userUri: calendlyConnections.userUri,
          organizationUri: calendlyConnections.organizationUri,
          createDeal: calendlyConnections.createDeal,
          workflowTrigger: calendlyConnections.workflowTrigger,
        })
        .from(calendlyConnections)
        .where(eq(calendlyConnections.orgId, req.user!.orgId))
        .limit(1);
      return reply.send({ data: conn ?? null });
    },
  );

  app.delete(
    '/api/v1/integrations/calendly',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['Calendly'] },
    },
    async (req, reply) => {
      await db.delete(calendlyConnections).where(eq(calendlyConnections.orgId, req.user!.orgId));
      return reply.send({ data: { disconnected: true } });
    },
  );

  app.patch(
    '/api/v1/integrations/calendly',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['Calendly'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          createDeal: z.boolean().optional(),
          workflowTrigger: z.string().max(255).nullable().optional(),
        })
        .parse(req.body);
      const [updated] = await db
        .update(calendlyConnections)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(calendlyConnections.orgId, req.user!.orgId))
        .returning();
      if (!updated) throw AppError.notFound('Calendly connection');
      return reply.send({ data: updated });
    },
  );

  // Public webhook endpoint — verified by Calendly-Webhook-Signature header
  app.post(
    '/api/v1/webhooks/calendly',
    {
      config: { rawBody: true },
      schema: { tags: ['Calendly'] },
    },
    async (req, reply) => {
      const signature = (req.headers['calendly-webhook-signature'] as string) ?? '';
      const rawBody = (req as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

      // orgId is encoded in the webhook URL as ?orgId=xxx
      const orgId = (req.query as { orgId?: string }).orgId;
      if (!orgId) throw AppError.badRequest('Missing orgId in webhook URL');

      const [conn] = await db
        .select({ webhookSigningKey: calendlyConnections.webhookSigningKey })
        .from(calendlyConnections)
        .where(eq(calendlyConnections.orgId, orgId))
        .limit(1);

      if (
        conn?.webhookSigningKey &&
        !verifyWebhookSignature(rawBody, signature, conn.webhookSigningKey)
      ) {
        throw AppError.forbidden('Invalid Calendly webhook signature');
      }

      await processCalendlyEvent(orgId, req.body as CalendlyInviteeEvent);
      return reply.send({ received: true });
    },
  );
};

export default calendlyRoutes;
