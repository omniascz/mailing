/**
 * Taking bytes from a customer and turning them into a media asset.
 *
 * ─── What was there before ───────────────────────────────────────────────────
 *
 * Nothing. `POST /api/v1/media` wrote a row: the caller supplied `storageUrl`
 * as a bare `z.string().url()` and `sizeBytes` as a number nobody checked, and
 * the API never saw the file. Grepped: no client ever called it. Meanwhile
 * `@fastify/multipart` had been registered for 50 MB and one file since
 * whenever, with no consumer anywhere in the repository.
 *
 * The consequence was not theoretical. An image in a sent campaign was hosted
 * whenever the customer said it was — a server that can swap the picture after
 * the mail goes out, or stop answering, and a `sizeBytes` that need not
 * correspond to anything.
 *
 * ─── What decides the file type ──────────────────────────────────────────────
 *
 * The bytes. Not the extension, not the multipart Content-Type — both are
 * written by whoever is uploading. sharp reads the header and tells us what it
 * actually is, and that answer is what gets stored and what gets checked
 * against the allowlist.
 *
 * SVG is refused, for the reason it is refused in image-transform.ts: it is a
 * document that pulls in other documents while librsvg rasterises it, inside a
 * loader this repository's SSRF guard cannot see. The check is `looksLikeSvg`
 * from that same module, so the two paths cannot drift apart.
 *
 * ─── Why the limits are imported rather than chosen ──────────────────────────
 *
 * MAX_INPUT_BYTES and MAX_INPUT_PIXELS come from image-transform.ts. An upload
 * that the editor would then refuse to crop is a worse outcome than a refused
 * upload, and two sets of numbers for the same question is how they end up
 * disagreeing.
 */

import sharp from 'sharp';
import { AppError } from '../../lib/app-error.js';
import {
  ALLOWED_INPUT_FORMATS,
  MAX_INPUT_BYTES,
  MAX_INPUT_PIXELS,
  looksLikeSvg,
  type ImageFormat,
} from './image-transform.js';
import { putMediaObject } from './storage.js';

/** Longest side of the generated thumbnail. */
export const THUMBNAIL_SIZE = 320;

const MIME: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

const EXTENSION: Record<ImageFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
  avif: 'avif',
};

export interface InspectedImage {
  format: ImageFormat;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * What this file actually is, or a refusal saying why not.
 *
 * Every value it returns is measured from the bytes. Nothing the client sent
 * alongside the file is consulted, which is the whole point: a `.png` that is
 * really a PDF, or a 12 KB file claiming 20000×20000, has to be caught here or
 * not at all.
 */
export async function inspectImage(bytes: Buffer): Promise<InspectedImage> {
  if (bytes.length === 0) throw AppError.badRequest('The file is empty.');
  if (bytes.length > MAX_INPUT_BYTES) {
    throw AppError.badRequest(
      `The file is ${(bytes.length / 1024 / 1024).toFixed(1)} MB; the limit is ` +
        `${MAX_INPUT_BYTES / 1024 / 1024} MB.`,
    );
  }

  // Sniffed from the bytes rather than asked of sharp, so the answer does not
  // depend on whether this build has librsvg — see image-transform.ts.
  if (looksLikeSvg(bytes)) {
    throw AppError.badRequest(
      'SVG cannot be uploaded. It is a document that can pull in other files while it is ' +
        'being processed, so it is not accepted.',
    );
  }

  let meta;
  try {
    meta = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/limitInputPixels|Input image exceeds pixel limit/i.test(message)) {
      throw AppError.badRequest(
        `That image declares more than ${MAX_INPUT_PIXELS / 1_000_000} megapixels and will ` +
          'not be opened.',
      );
    }
    throw AppError.badRequest('That file is not an image this library accepts.');
  }

  const format = meta.format as string | undefined;
  if (!format || !(ALLOWED_INPUT_FORMATS as readonly string[]).includes(format)) {
    throw AppError.badRequest(
      `${(format ?? 'that file').toUpperCase()} is not a format this library accepts ` +
        `(${ALLOWED_INPUT_FORMATS.join(', ')}).`,
    );
  }
  if (!meta.width || !meta.height) {
    throw AppError.badRequest('That image has no readable dimensions.');
  }
  if (meta.width * meta.height > MAX_INPUT_PIXELS) {
    throw AppError.badRequest(
      `That image is ${meta.width}×${meta.height}; the limit is ` +
        `${MAX_INPUT_PIXELS / 1_000_000} megapixels.`,
    );
  }

  const f = format as ImageFormat;
  return {
    format: f,
    mimeType: MIME[f],
    extension: EXTENSION[f],
    width: meta.width,
    height: meta.height,
    // The real length, which is what goes in the column. The client's own
    // number is never consulted.
    sizeBytes: bytes.length,
  };
}

/** Storage key for an original. Org-prefixed, matching derivativeKey. */
export function originalKey(orgId: string, id: string, extension: string): string {
  return `media/${orgId}/${id}-original.${extension}`;
}

export function thumbnailKey(orgId: string, id: string): string {
  return `media/${orgId}/${id}-thumb.webp`;
}

/**
 * A small WebP preview.
 *
 * The grid used to fall back to `storageUrl` and pull the full-size original
 * for every tile — twenty 4 MB photos to draw twenty 150 px squares. WebP
 * because this one is only ever shown in our own dashboard, where format
 * support is not in question, and it is the smallest of the three the encoder
 * offers.
 *
 * Best-effort: a thumbnail that fails to generate leaves `thumbnailUrl` null
 * and the grid falls back exactly as it does today. Losing the upload over a
 * preview would be the wrong trade.
 */
export async function makeThumbnail(bytes: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
  } catch {
    return null;
  }
}

export interface StoredUpload {
  storageUrl: string;
  thumbnailUrl: string | null;
  meta: InspectedImage;
}

/**
 * Validate, store, and hand back the URLs plus the measured metadata.
 *
 * The id is generated by the caller so the storage key and the database row
 * agree without a second round trip.
 */
export async function storeUpload(
  orgId: string,
  assetId: string,
  bytes: Buffer,
): Promise<StoredUpload> {
  const meta = await inspectImage(bytes);

  const storageUrl = await putMediaObject(
    originalKey(orgId, assetId, meta.extension),
    bytes,
    meta.mimeType,
  );

  let thumbnailUrl: string | null = null;
  const thumb = await makeThumbnail(bytes);
  if (thumb) {
    thumbnailUrl = await putMediaObject(thumbnailKey(orgId, assetId), thumb, 'image/webp');
  }

  return { storageUrl, thumbnailUrl, meta };
}
