/**
 * Turning an aspect ratio into a crop rectangle.
 *
 * Lives here rather than in the component so it can be tested without a DOM:
 * it is the only arithmetic in the photo editor, and getting it wrong crops
 * the wrong part of every image without ever throwing.
 */

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The largest rectangle of the given ratio that fits inside the source,
 * centred on it.
 *
 * The server takes whole pixels and refuses a rectangle that overhangs by even
 * one, so everything is rounded here and clamped to the source. With the four
 * ratios the UI offers, the rounding cannot actually push past the edge —
 * measured, not assumed — so the clamp is a guard against a fifth ratio being
 * added later, not something the current buttons depend on.
 */
export function centredCrop(sourceWidth: number, sourceHeight: number, ratio: number): CropRect {
  const wider = sourceWidth / sourceHeight > ratio;
  const width = Math.min(sourceWidth, wider ? Math.round(sourceHeight * ratio) : sourceWidth);
  const height = Math.min(sourceHeight, wider ? sourceHeight : Math.round(sourceWidth / ratio));
  return {
    left: Math.max(0, Math.round((sourceWidth - width) / 2)),
    top: Math.max(0, Math.round((sourceHeight - height) / 2)),
    width,
    height,
  };
}
