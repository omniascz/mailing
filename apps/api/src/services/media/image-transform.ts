/**
 * Server-side image editing: crop, resize, rotate, recompress.
 *
 * This module is the whole of the image handling. It takes bytes and returns
 * bytes; it does not know about assets, storage or organisations. That is on
 * purpose — the limits below are the security boundary of the feature, and a
 * boundary is easier to trust when it is one function you can hand a hostile
 * buffer to in a unit test.
 *
 * ─── What an image decoder is, from the outside ──────────────────────────────
 *
 * A caller supplies bytes and we hand them to a C library that allocates
 * memory in proportion to what the header claims. Every limit here exists
 * because the header is attacker-controlled:
 *
 *  - DECOMPRESSION BOMB. A 12 KB PNG can declare 40000×40000 pixels; decoded
 *    that is 6.4 GB of RGBA and the process dies before any of our code runs
 *    again. sharp's own default is 268 megapixels — over a gigabyte — which is
 *    a limit in name only. MAX_INPUT_PIXELS is 40 MP: larger than any photo a
 *    camera produces, small enough that the worst case is 160 MB.
 *
 *  - SVG. sharp will happily rasterise it, and an SVG is a document that can
 *    reference other documents: `<image xlink:href="http://169.254.169.254/…">`
 *    or `file:///etc/passwd`. Those loads happen inside librsvg, where this
 *    repository's SSRF guard cannot see them — the guard sits in our own fetch
 *    path. There is no way to make that safe from here, so SVG is refused on
 *    input. (countdown-gif.ts also rasterises SVG through sharp, but it writes
 *    the SVG itself; nothing there comes from a customer.)
 *
 *  - TIME. A malformed-but-decodable file can take minutes. sharp's own
 *    timeout covers the libvips pipeline; the race around it covers everything
 *    else, so a stuck decode fails as a 400 instead of holding a worker.
 *
 *  - OUTPUT SIZE. Resize takes a target from the caller, so without a cap the
 *    caller can ask for 30000×30000 out of a thumbnail and bomb us with our
 *    own encoder.
 *
 * Every one of these is asserted in image-transform.test.ts. A comment saying
 * "we handle bombs" is not a limit.
 */

import sharp from 'sharp';
import { AppError } from '../../lib/app-error.js';

/** Formats we will decode. Anything else — SVG above all — is refused. */
export const ALLOWED_INPUT_FORMATS = ['jpeg', 'png', 'webp', 'gif', 'avif'] as const;
export type ImageFormat = (typeof ALLOWED_INPUT_FORMATS)[number];

/** Formats we will encode to. GIF and AVIF stay input-only: neither belongs in
 *  an email produced by a crop tool, and both are slow to encode. */
export const ALLOWED_OUTPUT_FORMATS = ['jpeg', 'png', 'webp'] as const;
export type OutputFormat = (typeof ALLOWED_OUTPUT_FORMATS)[number];

/** Bytes we will accept as input. Well above a phone photo, well below a DoS. */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

/**
 * Pixels the decoder may materialise. 40 MP ≈ 160 MB as RGBA.
 * sharp's default is 268 MP, which is not a limit anyone would choose.
 */
export const MAX_INPUT_PIXELS = 40_000_000;

/** Neither side of the output may exceed this. */
export const MAX_OUTPUT_DIMENSION = 10_000;

/** …and the product may not exceed this, so 10000×10000 is still refused. */
export const MAX_OUTPUT_PIXELS = 25_000_000;

/** Wall clock for one transform, decode included. */
export const TRANSFORM_TIMEOUT_MS = 15_000;

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TransformOps {
  /** Pixels in the SOURCE image, applied before everything else. */
  crop?: CropRect;
  /** Target size. One side may be omitted to keep the aspect ratio. */
  resize?: { width?: number; height?: number; fit?: 'cover' | 'contain' | 'inside' };
  /** Clockwise degrees. Only right angles — anything else needs a fill colour. */
  rotate?: 0 | 90 | 180 | 270;
  /** Defaults to the input format. */
  format?: OutputFormat;
  /** 1–100, for jpeg and webp. Ignored by png, which is lossless. */
  quality?: number;
}

export interface TransformResult {
  bytes: Buffer;
  width: number;
  height: number;
  format: OutputFormat;
  sizeBytes: number;
}

/** True when the ops would leave the image exactly as it was. */
export function isNoOp(ops: TransformOps): boolean {
  return (
    !ops.crop &&
    !ops.resize?.width &&
    !ops.resize?.height &&
    !ops.rotate &&
    !ops.format &&
    ops.quality === undefined
  );
}

function assertWithinSource(crop: CropRect, sourceWidth: number, sourceHeight: number): void {
  const whole = [crop.left, crop.top, crop.width, crop.height].every(
    (n) => Number.isInteger(n) && n >= 0,
  );
  if (!whole || crop.width < 1 || crop.height < 1) {
    throw AppError.badRequest('Crop must be whole pixels, at least 1×1.');
  }
  if (crop.left + crop.width > sourceWidth || crop.top + crop.height > sourceHeight) {
    throw AppError.badRequest(
      `Crop ${crop.width}×${crop.height} at ${crop.left},${crop.top} falls outside the ` +
        `${sourceWidth}×${sourceHeight} image.`,
    );
  }
}

function assertOutputSize(width: number, height: number): void {
  if (width > MAX_OUTPUT_DIMENSION || height > MAX_OUTPUT_DIMENSION) {
    throw AppError.badRequest(
      `Neither side of the result may exceed ${MAX_OUTPUT_DIMENSION} px (asked for ${width}×${height}).`,
    );
  }
  if (width * height > MAX_OUTPUT_PIXELS) {
    throw AppError.badRequest(
      `The result would be ${((width * height) / 1_000_000).toFixed(1)} megapixels; the limit is ` +
        `${MAX_OUTPUT_PIXELS / 1_000_000}.`,
    );
  }
}

/** The size the ops ask for, before sharp sees them. */
function requestedOutputSize(
  ops: TransformOps,
  afterCrop: { width: number; height: number },
): { width: number; height: number } {
  const w = ops.resize?.width;
  const h = ops.resize?.height;
  if (!w && !h) return afterCrop;
  if (w && h) return { width: w, height: h };
  if (w) {
    const scale = w / afterCrop.width;
    return { width: w, height: Math.max(1, Math.round(afterCrop.height * scale)) };
  }
  const scale = h! / afterCrop.height;
  return { width: Math.max(1, Math.round(afterCrop.width * scale)), height: h! };
}

/**
 * Is this XML that a rasteriser would treat as SVG?
 *
 * Sniffed from the bytes rather than asked of sharp, because the answer must
 * not depend on how sharp was built. A binary without librsvg reports SVG as
 * unreadable — the right outcome by accident — while one with librsvg happily
 * opens it and fetches whatever it references. The refusal has to be ours.
 */
export function looksLikeSvg(input: Buffer): boolean {
  const head = input.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg')) return true;
  // A leading XML declaration, DOCTYPE or comment before the root element.
  return (head.startsWith('<?xml') || head.startsWith('<!')) && head.includes('<svg');
}

async function readMetadata(
  input: Buffer,
): Promise<{ format: ImageFormat; width: number; height: number }> {
  if (looksLikeSvg(input)) {
    throw AppError.badRequest(
      'SVG cannot be edited here. It is a document that can pull in other files while it ' +
        'is being rasterised, so it is not accepted as input.',
    );
  }

  let meta;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch (err) {
    // The pixel limit surfaces here, before any pixel is decoded — which is the
    // point: the bomb is refused by the header, not survived.
    const message = err instanceof Error ? err.message : String(err);
    if (/limitInputPixels|Input image exceeds pixel limit/i.test(message)) {
      throw AppError.badRequest(
        `That image declares more than ${MAX_INPUT_PIXELS / 1_000_000} megapixels and will not be opened.`,
      );
    }
    throw AppError.badRequest('That file could not be read as an image.');
  }

  const format = meta.format as string | undefined;
  if (!format) throw AppError.badRequest('That file could not be read as an image.');
  if (format === 'svg') {
    throw AppError.badRequest(
      'SVG cannot be edited here. It is a document that can pull in other files while it ' +
        'is being rasterised, so it is not accepted as input.',
    );
  }
  if (!(ALLOWED_INPUT_FORMATS as readonly string[]).includes(format)) {
    throw AppError.badRequest(
      `${format.toUpperCase()} is not an image format this editor accepts ` +
        `(${ALLOWED_INPUT_FORMATS.join(', ')}).`,
    );
  }
  if (!meta.width || !meta.height) {
    throw AppError.badRequest('That image has no readable dimensions.');
  }
  if (meta.width * meta.height > MAX_INPUT_PIXELS) {
    throw AppError.badRequest(
      `That image is ${meta.width}×${meta.height}; the limit is ${MAX_INPUT_PIXELS / 1_000_000} megapixels.`,
    );
  }
  return { format: format as ImageFormat, width: meta.width, height: meta.height };
}

/**
 * Apply the ops and return the encoded result.
 *
 * Order is crop → resize → rotate, which is the order the words are meant in:
 * you choose a region of the original, decide how big it should be, and then
 * turn it. Doing it the other way round makes the crop rectangle mean
 * something different from what the user drew.
 */
export async function transformImage(input: Buffer, ops: TransformOps): Promise<TransformResult> {
  if (input.length === 0) throw AppError.badRequest('The image is empty.');
  if (input.length > MAX_INPUT_BYTES) {
    throw AppError.badRequest(
      `The image is ${(input.length / 1024 / 1024).toFixed(1)} MB; the limit is ` +
        `${MAX_INPUT_BYTES / 1024 / 1024} MB.`,
    );
  }
  if (ops.quality !== undefined && (ops.quality < 1 || ops.quality > 100)) {
    throw AppError.badRequest('Quality must be between 1 and 100.');
  }

  const source = await readMetadata(input);

  const afterCrop = ops.crop
    ? { width: ops.crop.width, height: ops.crop.height }
    : { width: source.width, height: source.height };
  if (ops.crop) assertWithinSource(ops.crop, source.width, source.height);

  const requested = requestedOutputSize(ops, afterCrop);
  assertOutputSize(requested.width, requested.height);

  const outputFormat: OutputFormat =
    ops.format ?? (source.format === 'jpeg' || source.format === 'webp' ? source.format : 'png');

  let pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    // Belt to the race's braces: this one aborts inside libvips.
    .timeout({ seconds: Math.ceil(TRANSFORM_TIMEOUT_MS / 1000) });

  if (ops.crop) pipeline = pipeline.extract(ops.crop);
  if (ops.resize?.width || ops.resize?.height) {
    pipeline = pipeline.resize({
      width: ops.resize.width,
      height: ops.resize.height,
      fit: ops.resize.fit ?? 'cover',
      withoutEnlargement: false,
    });
  }
  if (ops.rotate) pipeline = pipeline.rotate(ops.rotate);

  const quality = ops.quality ?? 82;
  if (outputFormat === 'jpeg') pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  else if (outputFormat === 'webp') pipeline = pipeline.webp({ quality });
  else pipeline = pipeline.png({ compressionLevel: 9 });

  const work = pipeline.toBuffer({ resolveWithObject: true });
  const raced = await Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(AppError.badRequest('That image took too long to process and was abandoned.')),
        TRANSFORM_TIMEOUT_MS,
      ).unref?.(),
    ),
  ]).catch((err: unknown) => {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (/timeout/i.test(message)) {
      throw AppError.badRequest('That image took too long to process and was abandoned.');
    }
    if (/extract_area|bad extract area/i.test(message)) {
      throw AppError.badRequest('The crop falls outside the image.');
    }
    throw AppError.badRequest(`That image could not be processed: ${message}`);
  });

  const { data, info } = raced;
  return {
    bytes: data,
    width: info.width,
    height: info.height,
    format: outputFormat,
    sizeBytes: data.length,
  };
}
