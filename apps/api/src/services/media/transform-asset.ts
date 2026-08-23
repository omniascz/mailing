/**
 * Editing an asset in the library: fetch, transform, store, record.
 *
 * ─── The derivative is a new asset. The original is never touched. ───────────
 *
 * This is the decision the rest of the feature hangs on, and it is not a
 * preference. An asset's URL is quoted in places that cannot be edited after
 * the fact:
 *
 *   - block JSON inside campaigns that have already gone out; the mail in
 *     someone's inbox loads that URL every time it is opened
 *   - saved templates, which are copied into new campaigns
 *   - view-in-browser, which re-renders from `campaigns.content` on request,
 *     so an archive page assembled today shows whatever the URL serves today
 *
 * Overwrite the bytes and last month's Black Friday mail quietly becomes
 * whatever someone cropped this morning. So: new key, new row,
 * `derived_from_id` pointing back at the parent, original bytes untouched.
 *
 * ─── When the work happens ───────────────────────────────────────────────────
 *
 * On explicit request, not on upload and not on read.
 *
 *   Not on upload, because the crop is a decision the customer makes later and
 *   about a specific use; guessing a set of derivatives at upload time
 *   produces variants nobody asked for and still not the one they want.
 *
 *   Not on read, because an on-demand resizing endpoint is a public URL whose
 *   query string commands CPU — the classic image-proxy amplification bug —
 *   and email clients fetch images from unpredictable networks, so it has to
 *   be cacheable and cheap. A stored file is both.
 *
 * On request means one transform per click, at a moment a human is waiting for
 * the result and no mail is being sent.
 */

import { AppError } from '../../lib/app-error.js';
import { createMediaAsset, getMediaAsset } from './index.js';
import { transformImage, isNoOp, type TransformOps } from './image-transform.js';
import { readAssetBytes, putMediaObject, derivativeKey } from './storage.js';
import type { MediaAsset } from '../../db/schema/index.js';

const MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** `photo.jpg` + webp → `photo-edited.webp`. */
function derivedFilename(original: string, format: string): string {
  const dot = original.lastIndexOf('.');
  const stem = dot > 0 ? original.slice(0, dot) : original;
  const ext = format === 'jpeg' ? 'jpg' : format;
  return `${stem}-edited.${ext}`;
}

export interface TransformAssetInput extends TransformOps {
  /** Overrides the auto-generated `<name>-edited.<ext>`. */
  filename?: string;
}

/**
 * Produce an edited copy of one asset.
 *
 * Org scoping is the first thing that happens and it is not a separate check:
 * `getMediaAsset(id, orgId)` is the only way in, and it filters on both. An id
 * belonging to another organisation reads as not found, so nothing downstream
 * — no fetch, no decode, no upload — ever runs for it.
 */
export async function transformAsset(
  orgId: string,
  assetId: string,
  input: TransformAssetInput,
): Promise<MediaAsset> {
  const source = await getMediaAsset(assetId, orgId);

  if (!source.mimeType.startsWith('image/')) {
    throw AppError.badRequest(`${source.filename} is not an image (${source.mimeType}).`);
  }

  const { filename, ...ops } = input;
  if (isNoOp(ops)) {
    throw AppError.badRequest('Nothing to do: no crop, resize, rotation or format change.');
  }

  const bytes = await readAssetBytes(source.storageUrl);
  const result = await transformImage(bytes, ops);

  const stamp = Date.now();
  const key = derivativeKey(orgId, source.id, result.format, stamp);
  const contentType = MIME[result.format] ?? 'application/octet-stream';
  const storageUrl = await putMediaObject(key, result.bytes, contentType);

  return createMediaAsset(orgId, {
    folder: source.folder,
    filename: filename?.trim() || derivedFilename(source.filename, result.format),
    mimeType: contentType,
    sizeBytes: result.sizeBytes,
    width: result.width,
    height: result.height,
    storageUrl,
    altText: source.altText,
    tags: source.tags,
    derivedFromId: source.id,
    transform: {
      ...(ops.crop ? { crop: ops.crop } : {}),
      ...(ops.resize?.width || ops.resize?.height
        ? { resize: { width: ops.resize.width, height: ops.resize.height } }
        : {}),
      ...(ops.rotate ? { rotate: ops.rotate } : {}),
      ...(ops.format ? { format: ops.format } : {}),
      ...(ops.quality !== undefined ? { quality: ops.quality } : {}),
    },
  });
}
