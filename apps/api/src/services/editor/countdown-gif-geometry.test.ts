/**
 * The countdown GIF is laid out where we think it is.
 *
 * ─── Why this is a second file ───────────────────────────────────────────────
 *
 * countdown-gif.test.ts mocks `sharp` — it hands the encoder a buffer of RGBA
 * zeros — so it proves the frames are assembled and the options are honoured
 * without needing a native binary. What it cannot see is anything the real
 * rasteriser does, and its strongest assertion about the output is
 * `Buffer.isBuffer(buf)`. A mock cannot be told to render text in the wrong
 * place. So this file runs the real sharp instead, and the two cannot share a
 * module registry: `vi.mock` is file-scoped.
 *
 * ─── The regression this exists for ──────────────────────────────────────────
 *
 * Measured on 2026-08-31, bumping sharp 0.33.5 → 0.35.4 (vips 8.15.3 →
 * 8.18.6). Raster-to-raster was untouched — png, jpeg, webp and resize all
 * decoded to pixel-identical output — but the SVG rasteriser reads
 * `dominant-baseline="middle"` differently, and every glyph moved 13 px down:
 *
 *     0.33.5   text bbox y=30..62,  centroid Y=46.1
 *     0.35.4   text bbox y=42..74,  centroid Y=58.6
 *
 * Same width, same height, same x, the same count of lit pixels. Only lower.
 * On a 120 px frame that is an eighth of the image, and it pushes the
 * DAYS/HRS/MIN/SEC labels up against the digits. This picture goes out in
 * customer email, and the whole suite stayed green through it.
 *
 * ─── What it asserts, and how ────────────────────────────────────────────────
 *
 * The same measurement that found it, by hand: decode the first frame to raw
 * RGBA, take the pixels bright enough to be the digits (#f8fafc on #1e293b —
 * the labels are #94a3b8 and fall below the threshold), and describe where
 * they sit. Tolerances are a few pixels, which is wide enough for antialiasing
 * and palette quantisation to wobble and far tighter than the 12.5 px the
 * regression moved the centroid.
 *
 * ─── What it cannot see ──────────────────────────────────────────────────────
 *
 *   - Whether the text is *correct*. It measures where ink is, not what it
 *     spells; a renderer that drew the wrong digits in the right place passes.
 *   - Fonts. The bbox depends on Arial/Helvetica resolving to something of the
 *     usual metrics. On a host with no such font the numbers would move and
 *     this fails — which is the right answer, but the message will talk about
 *     geometry rather than fonts.
 *   - Frames after the first. The countdown decrements, so their ink differs;
 *     the frame count and delays are checked for all of them, the layout only
 *     for frame one.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { generateCountdownGif } from './countdown-gif.js';

/** Frozen so two runs of this file are two attempts at the same picture. */
const FIXED_NOW = 1_700_000_000_000;
/** 3 days 4 hours out, so every cell has a stable two-digit value. */
const TARGET = new Date(FIXED_NOW + 3 * 86_400_000 + 4 * 3_600_000).toISOString();

/** Bright enough to be a digit (#f8fafc), not a label (#94a3b8) or the ground. */
const DIGIT_LEVEL = 200;

interface Ink {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centroidY: number;
  pixels: number;
}

function measureInk(data: Buffer, width: number, height: number, channels: number): Ink {
  let minX = Infinity;
  let maxX = -1;
  let minY = Infinity;
  let maxY = -1;
  let pixels = 0;
  let sumY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (data[i]! > DIGIT_LEVEL && data[i + 1]! > DIGIT_LEVEL && data[i + 2]! > DIGIT_LEVEL) {
        pixels++;
        sumY += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, maxX, minY, maxY, centroidY: sumY / pixels, pixels };
}

let gif: Buffer;
let ink: Ink;
let meta: sharp.Metadata;

beforeAll(async () => {
  const realNow = Date.now;
  Date.now = () => FIXED_NOW;
  try {
    gif = await generateCountdownGif({ targetDate: TARGET, fps: 2, durationSeconds: 3 });
  } finally {
    Date.now = realNow;
  }
  meta = await sharp(gif, { animated: true }).metadata();
  const frame = await sharp(gif).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  ink = measureInk(frame.data, frame.info.width, frame.info.height, frame.info.channels);
}, 60_000);

describe('countdown GIF — animation geometry', () => {
  it('is 480x120', () => {
    expect(meta.width).toBe(480);
    expect(meta.pageHeight).toBe(120);
  });

  it('has one frame per fps-second, six for 2fps over 3s', () => {
    expect(meta.pages).toBe(6);
  });

  it('holds every frame for 500 ms, which is what 2fps means', () => {
    expect(meta.delay).toEqual([500, 500, 500, 500, 500, 500]);
  });

  it('loops forever', () => {
    expect(meta.loop).toBe(0);
  });
});

describe('countdown GIF — where the digits actually land', () => {
  it('draws digits at all', () => {
    // A blank frame would pass every bbox assertion below by vacuous truth:
    // Infinity and -1 compare against nothing. Measured ~3262.
    expect(ink.pixels).toBeGreaterThan(2_000);
    expect(ink.pixels).toBeLessThan(5_000);
  });

  it('centres them vertically — the assertion sharp 0.35 fails', () => {
    // 46.1 measured on sharp 0.33.5 / vips 8.15.3; 58.6 on 0.35.4 / 8.18.6.
    // ±3 leaves room for quantisation and none for a baseline that moved.
    expect(ink.centroidY).toBeGreaterThan(43);
    expect(ink.centroidY).toBeLessThan(49);
  });

  it('keeps the digit band clear of the labels below it', () => {
    // y=30..62 measured. The labels are drawn at height*0.78 ≈ 94, so the
    // digits ending by ~65 is what leaves them their own line.
    expect(ink.minY).toBeGreaterThan(27);
    expect(ink.minY).toBeLessThan(33);
    expect(ink.maxY).toBeGreaterThan(59);
    expect(ink.maxY).toBeLessThan(65);
  });

  it('spans the four cells horizontally', () => {
    // x=37..442 measured: the outer digits of DAYS and SEC. This is the axis
    // the regression did NOT move, so it is here to say so — a change that
    // shifted the layout sideways would be a different bug, and unasserted.
    expect(ink.minX).toBeGreaterThan(33);
    expect(ink.minX).toBeLessThan(41);
    expect(ink.maxX).toBeGreaterThan(438);
    expect(ink.maxX).toBeLessThan(446);
  });
});
