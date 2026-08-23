import { describe, it, expect } from 'vitest';
import { centredCrop } from './crop';

/**
 * The rectangle the ratio buttons produce.
 *
 * Two properties matter and neither shows up as an error if it is wrong: the
 * rectangle has to have the ratio the user picked, and it has to stay inside
 * the image. The server refuses a rectangle that overhangs by one pixel, so
 * "off by a rounding" is a failed save, not a slightly odd crop.
 */
describe('centredCrop', () => {
  it('takes a full-height slice of a landscape image for a square', () => {
    expect(centredCrop(800, 600, 1)).toEqual({ left: 100, top: 0, width: 600, height: 600 });
  });

  it('takes a full-width slice of a portrait image for a square', () => {
    expect(centredCrop(600, 800, 1)).toEqual({ left: 0, top: 100, width: 600, height: 600 });
  });

  it('leaves an image that already has the ratio alone', () => {
    expect(centredCrop(1600, 900, 16 / 9)).toEqual({ left: 0, top: 0, width: 1600, height: 900 });
  });

  it('centres the strip it keeps', () => {
    const c = centredCrop(1000, 1000, 16 / 9);
    expect(c.width).toBe(1000);
    expect(c.height).toBe(563);
    // Equal margins above and below, give or take the odd pixel.
    expect(Math.abs(c.top - (1000 - c.height - c.top))).toBeLessThanOrEqual(1);
  });

  it('never runs off the edge, whatever the rounding', () => {
    const ratios = [1, 4 / 3, 3 / 2, 16 / 9];
    const sizes: Array<[number, number]> = [
      [801, 601],
      [999, 333],
      [1, 1],
      [1023, 767],
      [3, 5000],
    ];
    for (const [w, h] of sizes) {
      for (const r of ratios) {
        const c = centredCrop(w, h, r);
        expect(c.left + c.width, `${w}×${h} @ ${r} overhangs horizontally`).toBeLessThanOrEqual(w);
        expect(c.top + c.height, `${w}×${h} @ ${r} overhangs vertically`).toBeLessThanOrEqual(h);
        expect(c.width).toBeGreaterThanOrEqual(1);
        expect(c.height).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
