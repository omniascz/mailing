/**
 * 1:1 video messaging API (#325).
 *
 * Routes:
 *   POST   /api/v1/video/request-upload    — rep asks for presigned upload URL
 *   POST   /api/v1/video/:id/uploaded      — rep signals upload complete
 *   GET    /api/v1/video                   — list rep's videos
 *   DELETE /api/v1/video/:id               — soft delete
 *   GET    /v/:token                       — public landing (returns player metadata)
 *   POST   /v/:token/events                — play event ingest
 *   POST   /api/v1/internal/video/:id/transcode-result — worker callback
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  requestUpload,
  markUploaded,
  markTranscodeResult,
  getVideoByToken,
  recordPlayEvent,
  listVideos,
  softDeleteVideo,
} from '../../services/video/recorder.js';

export default async function videoRoutes(app: FastifyInstance) {
  // ── Authenticated rep endpoints ─────────────────────────────────────────────
  app.register(async (scope) => {
    scope.addHook('preHandler', app.requireAuth);

    scope.post('/api/v1/video/request-upload', async (req, reply) => {
      const body = z.object({
        contactId: z.string().uuid().optional(),
        title: z.string().max(255).optional(),
        mimeType: z.string().max(64),
        sizeBytes: z.number().int().positive(),
      }).parse(req.body);

      const user = req.user as { orgId: string; userId: string };
      const result = await requestUpload(user.orgId, {
        userId: user.userId,
        contactId: body.contactId,
        title: body.title,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
      });
      return reply.status(201).send({ data: result });
    });

    scope.post('/api/v1/video/:id/uploaded', async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const user = req.user as { orgId: string };
      const row = await markUploaded(user.orgId, id);
      return reply.send({ data: row });
    });

    scope.get('/api/v1/video', async (req, reply) => {
      const user = req.user as { orgId: string; userId: string };
      const rows = await listVideos(user.orgId, user.userId);
      return reply.send({ data: rows, total: rows.length });
    });

    scope.delete('/api/v1/video/:id', async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const user = req.user as { orgId: string };
      await softDeleteVideo(user.orgId, id);
      return reply.status(204).send();
    });
  });

  // ── Public (unauthenticated) share endpoints ────────────────────────────────
  app.get('/v/:token', async (req, reply) => {
    const { token } = z.object({ token: z.string().min(16).max(128) }).parse(req.params);
    const meta = await getVideoByToken(token);
    return reply.send({ data: meta });
  });

  app.post('/v/:token/events', async (req, reply) => {
    const { token } = z.object({ token: z.string().min(16).max(128) }).parse(req.params);
    const body = z.object({
      eventType: z.enum(['play', 'pause', 'progress', 'completed']),
      positionSeconds: z.number().int().nonnegative(),
    }).parse(req.body);

    await recordPlayEvent(token, {
      eventType: body.eventType,
      positionSeconds: body.positionSeconds,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      referer: req.headers.referer,
    });
    return reply.status(204).send();
  });

  // ── Internal worker callback ────────────────────────────────────────────────
  app.get('/api/v1/internal/video/pending', async (req, reply) => {
    const secret = req.headers['x-internal-secret'];
    if (secret !== process.env.INTERNAL_SECRET) return reply.status(401).send();

    const { db } = await import('../../db/client.js');
    const { videoMessages } = await import('../../db/schema/video-messages.js');
    const { eq } = await import('drizzle-orm');
    const rows = await db.select({
      id: videoMessages.id,
      orgId: videoMessages.orgId,
      originalObjectKey: videoMessages.originalObjectKey,
      shareToken: videoMessages.shareToken,
    }).from(videoMessages).where(eq(videoMessages.status, 'uploaded')).limit(20);
    return reply.send({ data: rows });
  });

  app.post('/api/v1/internal/video/:id/transcode-result', async (req, reply) => {
    const secret = req.headers['x-internal-secret'];
    if (secret !== process.env.INTERNAL_SECRET) return reply.status(401).send();

    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      orgId: z.string().uuid(),
      success: z.boolean(),
      hlsManifestKey: z.string().optional(),
      thumbnailKey: z.string().optional(),
      durationSeconds: z.number().int().optional(),
      error: z.string().optional(),
    }).parse(req.body);

    await markTranscodeResult(body.orgId, id, body);
    return reply.status(204).send();
  });
}
