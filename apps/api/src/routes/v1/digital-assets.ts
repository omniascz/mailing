/**
 * Digital asset delivery routes (#648, #649).
 *
 *   GET    /api/v1/digital-assets               — list org assets
 *   POST   /api/v1/digital-assets               — create asset
 *   GET    /api/v1/digital-assets/:id           — get asset
 *   PUT    /api/v1/digital-assets/:id           — update asset
 *   DELETE /api/v1/digital-assets/:id           — soft delete
 *
 *   POST   /api/v1/digital-assets/:id/deliver/:contactId — generate delivery URL
 *   GET    /api/v1/digital-assets/:id/deliveries         — list delivery history
 *
 *   GET    /api/v1/assets/download              — process download (public, token auth)
 *
 *   POST   /api/v1/digital-assets/:id/license-keys      — generate a license key
 *   GET    /api/v1/digital-assets/:id/license-keys      — list license keys
 *   DELETE /api/v1/digital-assets/:assetId/license-keys/:keyId — revoke key
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { digitalAssets, digitalAssetDeliveries, licenseKeys } from '../../db/schema/index.js';
import { and, eq, desc } from 'drizzle-orm';
import {
  generateDeliveryUrl,
  processDownload,
  generateLicenseKey,
} from '../../services/digital-assets/index.js';

const idParam = z.object({ id: z.string().uuid() });

const createAssetBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  storageKey: z.string().max(1024).optional(),
  externalUrl: z.string().url().max(2048).optional(),
  contentType: z.string().max(100).optional(),
  fileSizeBytes: z.number().int().positive().optional(),
  maxDownloads: z.number().int().positive().optional(),
  urlExpirySeconds: z.number().int().min(60).max(604800).optional(),
  requiresLicenseKey: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

const updateAssetBody = createAssetBody.partial();

export default async function digitalAssetRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };
  const adminAuth = { preHandler: [app.authenticate, app.requireRole('admin', 'owner', 'editor')] };

  // ── Asset CRUD ────────────────────────────────────────────────────────────

  app.get('/api/v1/digital-assets', auth, async (req, reply) => {
    const rows = await db
      .select()
      .from(digitalAssets)
      .where(and(eq(digitalAssets.orgId, req.user!.orgId), eq(digitalAssets.active, true)))
      .orderBy(desc(digitalAssets.createdAt));
    return reply.send({ data: rows });
  });

  app.post('/api/v1/digital-assets', adminAuth, async (req, reply) => {
    const body = createAssetBody.parse(req.body);
    if (!body.storageKey && !body.externalUrl) {
      return reply
        .code(422)
        .send({ code: 'MISSING_SOURCE', message: 'Provide storageKey or externalUrl' });
    }
    const [row] = await db
      .insert(digitalAssets)
      .values({ ...body, orgId: req.user!.orgId })
      .returning();
    return reply.code(201).send({ data: row });
  });

  app.get('/api/v1/digital-assets/:id', auth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [row] = await db
      .select()
      .from(digitalAssets)
      .where(and(eq(digitalAssets.orgId, req.user!.orgId), eq(digitalAssets.id, id)))
      .limit(1);
    if (!row) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Asset not found' });
    return reply.send({ data: row });
  });

  app.put('/api/v1/digital-assets/:id', adminAuth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = updateAssetBody.parse(req.body);
    const [row] = await db
      .update(digitalAssets)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(digitalAssets.orgId, req.user!.orgId), eq(digitalAssets.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Asset not found' });
    return reply.send({ data: row });
  });

  app.delete('/api/v1/digital-assets/:id', adminAuth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await db
      .update(digitalAssets)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(digitalAssets.orgId, req.user!.orgId), eq(digitalAssets.id, id)));
    return reply.code(204).send();
  });

  // ── Delivery ──────────────────────────────────────────────────────────────

  app.post('/api/v1/digital-assets/:id/deliver/:contactId', adminAuth, async (req, reply) => {
    const { id, contactId } = z
      .object({ id: z.string().uuid(), contactId: z.string().uuid() })
      .parse(req.params);
    const result = await generateDeliveryUrl(req.user!.orgId, id, contactId);
    return reply.code(201).send({ data: result });
  });

  app.get('/api/v1/digital-assets/:id/deliveries', auth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const rows = await db
      .select()
      .from(digitalAssetDeliveries)
      .where(
        and(
          eq(digitalAssetDeliveries.orgId, req.user!.orgId),
          eq(digitalAssetDeliveries.assetId, id),
        ),
      )
      .orderBy(desc(digitalAssetDeliveries.createdAt));
    return reply.send({ data: rows });
  });

  // ── Public download endpoint ───────────────────────────────────────────────

  app.get('/api/v1/assets/download', async (req, reply) => {
    const { token } = req.query as { token?: string };
    if (!token) return reply.code(400).send({ code: 'MISSING_TOKEN', message: 'Token required' });

    try {
      const { assetUrl } = await processDownload(token, req.ip);
      return reply.redirect(assetUrl, 302);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ code: 'DOWNLOAD_ERROR', message: e.message });
    }
  });

  // ── License keys (#649) ───────────────────────────────────────────────────

  const licenseKeyBody = z.object({
    maxActivations: z.number().int().positive().optional(),
    expiresAt: z.string().datetime().optional(),
    contactId: z.string().uuid().optional(),
  });

  app.post('/api/v1/digital-assets/:id/license-keys', adminAuth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = licenseKeyBody.parse(req.body);
    const key = await generateLicenseKey(req.user!.orgId, id, body.contactId ?? null, {
      maxActivations: body.maxActivations,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });
    return reply.code(201).send({ data: key });
  });

  app.get('/api/v1/digital-assets/:id/license-keys', auth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const rows = await db
      .select()
      .from(licenseKeys)
      .where(and(eq(licenseKeys.orgId, req.user!.orgId), eq(licenseKeys.assetId, id)))
      .orderBy(desc(licenseKeys.issuedAt));
    return reply.send({ data: rows });
  });

  app.delete(
    '/api/v1/digital-assets/:assetId/license-keys/:keyId',
    adminAuth,
    async (req, reply) => {
      const { assetId, keyId } = z
        .object({ assetId: z.string().uuid(), keyId: z.string().uuid() })
        .parse(req.params);
      await db
        .update(licenseKeys)
        .set({ status: 'revoked', revokedAt: new Date() })
        .where(
          and(
            eq(licenseKeys.orgId, req.user!.orgId),
            eq(licenseKeys.assetId, assetId),
            eq(licenseKeys.id, keyId),
          ),
        );
      return reply.code(204).send();
    },
  );
}
