/**
 * The image editor's core, against real bytes.
 *
 * Every case here decodes an actual image with sharp and reads the actual
 * result back — "it did not throw" would pass on a function that returns the
 * input unchanged, and half of these are about hostile input, where the only
 * meaningful assertion is what came back and how fast.
 */
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  transformImage,
  isNoOp,
  MAX_INPUT_PIXELS,
  MAX_OUTPUT_DIMENSION,
} from './image-transform.js';

/** A real PNG of known size, with three bands so a crop can be checked by colour. */
async function png(width: number, height: number, rgb: [number, number, number] = [10, 120, 200]) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: rgb[0], g: rgb[1], b: rgb[2] },
    },
  })
    .png()
    .toBuffer();
}

/** Left half red, right half blue — so a crop can prove WHICH pixels it took. */
async function twoTone(width: number, height: number) {
  const left = await sharp({
    create: { width: width / 2, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
  const right = await sharp({
    create: { width: width / 2, height, channels: 3, background: { r: 0, g: 0, b: 255 } },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: width / 2, top: 0 },
    ])
    .png()
    .toBuffer();
}

/** The colour of one pixel in the result. */
async function pixel(buf: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
}

describe('crop', () => {
  it('produces exactly the requested rectangle, and it is a real image', async () => {
    const src = await png(800, 600);
    const out = await transformImage(src, {
      crop: { left: 100, top: 50, width: 300, height: 200 },
    });

    expect(out.width).toBe(300);
    expect(out.height).toBe(200);

    // Read it back through the decoder: the reported size has to be the real one.
    const meta = await sharp(out.bytes).metadata();
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(200);
    expect(meta.format).toBe('png');
  });

  it('takes the pixels it was pointed at, not just any 300×200', async () => {
    const src = await twoTone(800, 600);
    const fromLeft = await transformImage(src, {
      crop: { left: 0, top: 0, width: 100, height: 100 },
    });
    const fromRight = await transformImage(src, {
      crop: { left: 700, top: 0, width: 100, height: 100 },
    });

    expect(await pixel(fromLeft.bytes, 50, 50)).toMatchObject({ r: 255, g: 0, b: 0 });
    expect(await pixel(fromRight.bytes, 50, 50)).toMatchObject({ r: 0, g: 0, b: 255 });
  });

  it('refuses a rectangle that runs off the edge', async () => {
    const src = await png(100, 100);
    await expect(
      transformImage(src, { crop: { left: 60, top: 0, width: 60, height: 10 } }),
    ).rejects.toThrow(/falls outside the 100×100 image/);
  });

  it('refuses a rectangle with no area', async () => {
    const src = await png(100, 100);
    await expect(
      transformImage(src, { crop: { left: 0, top: 0, width: 0, height: 10 } }),
    ).rejects.toThrow(/at least 1×1/);
  });
});

describe('resize', () => {
  it('scales to an exact width and height', async () => {
    const src = await png(800, 600);
    const out = await transformImage(src, { resize: { width: 400, height: 300 } });
    expect([out.width, out.height]).toEqual([400, 300]);
    const meta = await sharp(out.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([400, 300]);
  });

  it('keeps the aspect ratio when only one side is given', async () => {
    const src = await png(800, 600);
    const out = await transformImage(src, { resize: { width: 400 } });
    expect([out.width, out.height]).toEqual([400, 300]);
  });

  it('applies to what the crop left behind, not to the original', async () => {
    const src = await png(800, 600);
    const out = await transformImage(src, {
      crop: { left: 0, top: 0, width: 400, height: 400 },
      resize: { width: 200 },
    });
    // 400×400 cropped, then halved: square, not 200×150.
    expect([out.width, out.height]).toEqual([200, 200]);
  });

  it('refuses to enlarge past the output cap', async () => {
    const src = await png(100, 100);
    await expect(
      transformImage(src, { resize: { width: MAX_OUTPUT_DIMENSION + 1 } }),
    ).rejects.toThrow(/may exceed 10000 px/);
  });

  it('refuses a total pixel count over the cap even when both sides are legal', async () => {
    const src = await png(100, 100);
    await expect(transformImage(src, { resize: { width: 9000, height: 9000 } })).rejects.toThrow(
      /megapixels; the limit is 25/,
    );
  });
});

describe('rotate', () => {
  it('swaps the sides on a quarter turn', async () => {
    const src = await png(800, 600);
    const out = await transformImage(src, { rotate: 90 });
    expect([out.width, out.height]).toEqual([600, 800]);
  });

  it('keeps them on a half turn', async () => {
    const src = await png(800, 600);
    const out = await transformImage(src, { rotate: 180 });
    expect([out.width, out.height]).toEqual([800, 600]);
  });

  it('turns the image, not just the frame', async () => {
    // Red on the left before; red at the top after a clockwise quarter turn.
    const src = await twoTone(200, 100);
    const out = await transformImage(src, { rotate: 90 });
    expect([out.width, out.height]).toEqual([100, 200]);
    expect(await pixel(out.bytes, 50, 40)).toMatchObject({ r: 255, g: 0, b: 0 });
    expect(await pixel(out.bytes, 50, 160)).toMatchObject({ r: 0, g: 0, b: 255 });
  });
});

describe('compression', () => {
  it('a lower quality is a smaller file, and still a valid JPEG', async () => {
    // A flat colour compresses to nothing at any setting; use noise.
    const noisy = await sharp({
      create: {
        width: 600,
        height: 400,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
        noise: { type: 'gaussian', mean: 128, sigma: 60 },
      },
    })
      .png()
      .toBuffer();

    const high = await transformImage(noisy, { format: 'jpeg', quality: 90 });
    const low = await transformImage(noisy, { format: 'jpeg', quality: 30 });

    expect(low.sizeBytes).toBeLessThan(high.sizeBytes);
    expect((await sharp(low.bytes).metadata()).format).toBe('jpeg');
    expect([low.width, low.height]).toEqual([600, 400]);
  });

  it('converts to webp on request', async () => {
    const out = await transformImage(await png(120, 90), { format: 'webp' });
    expect(out.format).toBe('webp');
    expect((await sharp(out.bytes).metadata()).format).toBe('webp');
  });

  it('refuses nonsense quality', async () => {
    await expect(transformImage(await png(10, 10), { quality: 0 })).rejects.toThrow(
      /between 1 and 100/,
    );
    await expect(transformImage(await png(10, 10), { quality: 101 })).rejects.toThrow(
      /between 1 and 100/,
    );
  });
});

describe('the limits that make this safe to point at customer bytes', () => {
  it('a decompression bomb is refused by the header, quickly and in words', async () => {
    // 40000×40000 declared: 12 KB on disk, 6.4 GB decoded. sharp's own default
    // limit would allow a quarter of that, which is still a dead process.
    const bomb = await sharp({
      create: { width: 20_000, height: 20_000, channels: 3, background: { r: 1, g: 2, b: 3 } },
      // The fixture has to opt out of the very limit under test to be built at
      // all — which is itself the point: 400 MP is past what sharp will touch
      // unless it is told to.
      limitInputPixels: false,
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    expect(20_000 * 20_000).toBeGreaterThan(MAX_INPUT_PIXELS);

    const started = Date.now();
    await expect(transformImage(bomb, { resize: { width: 100 } })).rejects.toThrow(/megapixels/i);
    // Refused, not survived: no full decode happened.
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 60_000);

  it('SVG is refused, with the reason', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
        '<image xlink:href="http://169.254.169.254/latest/meta-data/" width="100" height="100"/>' +
        '</svg>',
    );
    await expect(transformImage(svg, { resize: { width: 50 } })).rejects.toThrow(
      /SVG cannot be edited here/,
    );
  });

  it('an SVG that only claims to be a PNG is still refused', async () => {
    // The check is on what the decoder says the bytes are, not on a filename
    // or a Content-Type a caller can write.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    await expect(transformImage(svg, { format: 'png' })).rejects.toThrow(/SVG cannot be edited/);
  });

  it('a file that is not an image at all gets a sentence, not a stack trace', async () => {
    await expect(transformImage(Buffer.from('this is not an image'), {})).rejects.toThrow(
      /could not be read as an image/,
    );
  });

  it('an empty body is refused', async () => {
    await expect(transformImage(Buffer.alloc(0), {})).rejects.toThrow(/empty/);
  });

  it('a PDF is refused even though sharp can be built to read one', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>');
    await expect(transformImage(pdf, {})).rejects.toThrow(
      /could not be read as an image|not an image format/,
    );
  });
});

describe('isNoOp', () => {
  it('recognises an empty request', () => {
    expect(isNoOp({})).toBe(true);
    expect(isNoOp({ resize: {} })).toBe(true);
  });

  it('recognises a real one', () => {
    expect(isNoOp({ rotate: 90 })).toBe(false);
    expect(isNoOp({ resize: { width: 10 } })).toBe(false);
    expect(isNoOp({ quality: 50 })).toBe(false);
    expect(isNoOp({ crop: { left: 0, top: 0, width: 1, height: 1 } })).toBe(false);
  });
});
