/**
 * What we accept as an image, decided from the bytes.
 *
 * Every case here hands the function real encoded bytes and asserts on what
 * comes back. The point of the module is that the extension, the
 * Content-Type and the declared size are all written by whoever is uploading,
 * so the only thing worth testing is what the decoder says.
 */
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { inspectImage, makeThumbnail, THUMBNAIL_SIZE } from './ingest.js';
import { MAX_INPUT_PIXELS } from './image-transform.js';

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 9, g: 90, b: 200 } } })
    .png()
    .toBuffer();

const jpeg = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 9, b: 90 } } })
    .jpeg()
    .toBuffer();

describe('what the bytes actually are', () => {
  it('reads the real format, size and dimensions', async () => {
    const bytes = await png(800, 600);
    const meta = await inspectImage(bytes);
    expect(meta).toMatchObject({
      format: 'png',
      mimeType: 'image/png',
      extension: 'png',
      width: 800,
      height: 600,
    });
    expect(meta.sizeBytes).toBe(bytes.length);
  });

  it('a JPEG is a JPEG whatever the upload was called', async () => {
    // The filename never reaches this function; this is the assertion that
    // the answer comes from the header.
    const meta = await inspectImage(await jpeg(320, 240));
    expect(meta.format).toBe('jpeg');
    expect(meta.extension).toBe('jpg');
    expect(meta.mimeType).toBe('image/jpeg');
  });

  it('accepts the formats an email client can display', async () => {
    const webp = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .webp()
      .toBuffer();
    expect((await inspectImage(webp)).format).toBe('webp');

    const gif = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .gif()
      .toBuffer();
    expect((await inspectImage(gif)).format).toBe('gif');
  });
});

describe('what is refused', () => {
  it('a PDF wearing a .png name', async () => {
    // The case the brief names: the extension says one thing, the bytes
    // another. Only the bytes are consulted, so this cannot get through.
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>');
    await expect(inspectImage(pdf)).rejects.toThrow(/not an image|not a format/i);
  });

  it('a text file wearing a .jpg name', async () => {
    await expect(inspectImage(Buffer.from('rozhodne to neni obrazek'))).rejects.toThrow(
      /not an image|not a format/i,
    );
  });

  it('an SVG, with the reason', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
        '<image xlink:href="http://169.254.169.254/latest/meta-data/" width="100" height="100"/>' +
        '</svg>',
    );
    await expect(inspectImage(svg)).rejects.toThrow(/SVG cannot be uploaded/);
  });

  it('an SVG behind an XML declaration', async () => {
    const svg = Buffer.from(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    );
    await expect(inspectImage(svg)).rejects.toThrow(/SVG cannot be uploaded/);
  });

  it('a decompression bomb, quickly and in words', async () => {
    // Small on disk, enormous decoded. Refused from the header — the elapsed
    // check is what distinguishes "refused" from "survived".
    const bomb = await sharp({
      create: { width: 20_000, height: 20_000, channels: 3, background: { r: 1, g: 2, b: 3 } },
      limitInputPixels: false,
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(20_000 * 20_000).toBeGreaterThan(MAX_INPUT_PIXELS);

    const started = Date.now();
    await expect(inspectImage(bomb)).rejects.toThrow(/megapixels/i);
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 60_000);

  it('an image in the band sharp itself would allow', async () => {
    // The case that shows MAX_INPUT_PIXELS earns its place. 10000x10000 is
    // 100 MP: over our 40 MP limit, under sharp's own 268 MP default.
    // Measured — 304 KB on disk, and sharp's default opens it happily.
    const wide = await sharp({
      create: { width: 10_000, height: 10_000, channels: 3, background: { r: 1, g: 2, b: 3 } },
      limitInputPixels: false,
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    expect(wide.length).toBeLessThan(2 * 1024 * 1024);
    // sharp on its own would let this through…
    await expect(sharp(wide).metadata()).resolves.toMatchObject({ width: 10_000 });
    // …and we do not.
    await expect(inspectImage(wide)).rejects.toThrow(/megapixels/i);
  }, 60_000);

  it('an empty body', async () => {
    await expect(inspectImage(Buffer.alloc(0))).rejects.toThrow(/empty/i);
  });

  it('a file past the byte limit', async () => {
    // 26 MB of noise: over MAX_INPUT_BYTES before any decoding is attempted.
    const big = Buffer.alloc(26 * 1024 * 1024, 7);
    await expect(inspectImage(big)).rejects.toThrow(/the limit is 25 MB/);
  });
});

describe('the thumbnail', () => {
  it('is a small WebP that fits the box', async () => {
    const thumb = await makeThumbnail(await png(1600, 900));
    expect(thumb).not.toBeNull();
    const meta = await sharp(thumb!).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(THUMBNAIL_SIZE);
    // The reason it exists: the grid was pulling full-size originals.
    expect(thumb!.length).toBeLessThan((await png(1600, 900)).length);
  });

  it('does not enlarge an image that is already small', async () => {
    const meta = await sharp((await makeThumbnail(await png(80, 60)))!).metadata();
    expect([meta.width, meta.height]).toEqual([80, 60]);
  });

  it('returns null rather than throwing when it cannot be made', async () => {
    // Best-effort: losing the upload over a preview would be the wrong trade.
    expect(await makeThumbnail(Buffer.from('not an image'))).toBeNull();
  });
});
