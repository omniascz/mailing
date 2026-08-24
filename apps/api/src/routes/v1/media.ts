import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  createMediaAsset,
  listMediaAssets,
  getMediaAsset,
  deleteMediaAsset,
  folderStats,
} from '../../services/media/index.js';
import { transformAsset } from '../../services/media/transform-asset.js';
import { ALLOWED_OUTPUT_FORMATS, MAX_INPUT_BYTES } from '../../services/media/image-transform.js';
import { storeUpload } from '../../services/media/ingest.js';
import { AppError } from '../../lib/app-error.js';

/**
 * A display name for the row.
 *
 * Path separators and control characters are stripped because this string is
 * shown in the dashboard and echoed in API responses; the extension is
 * replaced with the format the bytes actually are, so a `.png` that is really
 * a JPEG is not labelled a lie.
 */
function safeFilename(raw: string | undefined, extension: string): string {
  const base = (raw ?? 'obrazek')
    .replace(/[\u002f\u005c]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(new RegExp(`[\u0000-\u001f\u007f]`, 'g'), '')
    .trim();
  const stem = (base.replace(/\.[^.]*$/, '') || 'obrazek').slice(0, 200);
  return `${stem}.${extension}`;
}

const mediaRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/media',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Media'] },
    },
    async (req, reply) => {
      const q = z
        .object({
          folder: z.string().optional(),
          tag: z.string().optional(),
        })
        .parse(req.query);
      return reply.send({ data: await listMediaAssets(req.user!.orgId, q) });
    },
  );

  /**
   * POST /api/v1/media — upload a file.
   *
   * Multipart, following the shape contacts/import/upload already uses: take
   * the file with a byte limit, then check `truncated` rather than trusting
   * any declared size. The plugin was registered for 50 MB and one file and
   * had no consumer anywhere in the repository; this is the first.
   *
   * The whole file is buffered rather than streamed to storage, because the
   * validation needs the header and the thumbnail needs the pixels, and both
   * happen before anything is written. MAX_INPUT_BYTES bounds that buffer.
   *
   * Everything about the stored asset is measured from the bytes — see
   * services/media/ingest.ts. Nothing the caller says about the file is
   * written to the row.
   */
  app.post(
    '/api/v1/media',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Media'], summary: 'Upload an image into the media library' },
    },
    async (req, reply) => {
      // `req.file()` throws rather than returning undefined when the request
      // is not multipart at all — which is exactly what a caller written
      // against the old JSON shape sends. That deserves the explanation, not
      // a 500.
      const wrongShape = AppError.badRequest(
        'Send the image as multipart/form-data with a "file" part. This endpoint no longer ' +
          'accepts a JSON body with a storageUrl — the bytes have to come through us.',
      );
      let mp;
      try {
        mp = await req.file({ limits: { fileSize: MAX_INPUT_BYTES } });
      } catch {
        throw wrongShape;
      }
      if (!mp) throw wrongShape;

      const bytes = await mp.toBuffer();
      // `truncated` is the only honest size check: the limit is enforced by
      // the parser as it reads, so a client that lies about length still stops
      // here.
      if (mp.file.truncated) {
        throw AppError.badRequest(
          `The file exceeds the ${MAX_INPUT_BYTES / 1024 / 1024} MB limit.`,
        );
      }

      // Fields travel alongside the file in the same multipart body.
      const fields = mp.fields as Record<string, { value?: unknown } | undefined>;
      const fieldValue = (name: string): string | undefined => {
        const v = fields?.[name]?.value;
        return typeof v === 'string' && v.trim() ? v.trim() : undefined;
      };

      const assetId = randomUUID();
      const { storageUrl, thumbnailUrl, meta } = await storeUpload(req.user!.orgId, assetId, bytes);

      const asset = await createMediaAsset(req.user!.orgId, {
        id: assetId,
        folder: fieldValue('folder') ?? '/',
        // The name is the one thing taken from the caller, and only as a
        // label: the extension is replaced by what the bytes turned out to be.
        filename: safeFilename(mp.filename, meta.extension),
        altText: fieldValue('altText')?.slice(0, 512),
        mimeType: meta.mimeType,
        sizeBytes: meta.sizeBytes,
        width: meta.width,
        height: meta.height,
        storageUrl,
        thumbnailUrl,
      });

      return reply.code(201).send({ data: asset });
    },
  );

  app.get(
    '/api/v1/media/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Media'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getMediaAsset(id, req.user!.orgId) });
    },
  );

  app.delete(
    '/api/v1/media/:id',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Media'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteMediaAsset(id, req.user!.orgId);
      return reply.code(204).send();
    },
  );

  /**
   * POST /api/v1/media/:id/transform
   * Crop / resize / rotate / recompress an image into a NEW asset.
   *
   * Never in place: the original's URL is quoted by campaigns that have
   * already been delivered and by the view-in-browser page, both of which
   * would silently change. See services/media/transform-asset.ts.
   */
  app.post(
    '/api/v1/media/:id/transform',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Media'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          crop: z
            .object({
              left: z.number().int().min(0),
              top: z.number().int().min(0),
              width: z.number().int().min(1),
              height: z.number().int().min(1),
            })
            .optional(),
          resize: z
            .object({
              width: z.number().int().min(1).optional(),
              height: z.number().int().min(1).optional(),
              fit: z.enum(['cover', 'contain', 'inside']).optional(),
            })
            .optional(),
          rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
          format: z.enum(ALLOWED_OUTPUT_FORMATS).optional(),
          quality: z.number().int().min(1).max(100).optional(),
          filename: z.string().min(1).max(255).optional(),
        })
        .parse(req.body ?? {});

      const asset = await transformAsset(req.user!.orgId, id, body);
      return reply.code(201).send({ data: asset });
    },
  );

  app.get(
    '/api/v1/media/stats/folders',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Media'] },
    },
    async (req, reply) => {
      return reply.send({ data: await folderStats(req.user!.orgId) });
    },
  );
};

export default mediaRoutes;
