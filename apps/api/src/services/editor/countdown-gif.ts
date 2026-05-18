// @ts-ignore — sharp types not bundled in this workspace config
import sharp from 'sharp';
// @ts-ignore — no bundled types for gif-encoder-2
import GIFEncoder from 'gif-encoder-2';

export interface CountdownStyle {
  /** Background colour (CSS hex, e.g. '#1e293b') */
  bgColor?: string;
  /** Number text colour */
  textColor?: string;
  /** Label text colour (DAYS / HRS / MIN / SEC) */
  labelColor?: string;
  /** Font family name recognised by SVG renderers */
  fontFamily?: string;
  width?: number;
  height?: number;
}

export interface CountdownGifOptions {
  /** ISO 8601 date-time string (the moment the countdown reaches 0) */
  targetDate: string;
  style?: CountdownStyle;
  /** Frames per second (1–10). Default 2. */
  fps?: number;
  /**
   * How many seconds of animation to pre-render (the GIF loops forever).
   * Default 30.
   */
  durationSeconds?: number;
}

interface Parts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function toParts(remainingMs: number): Parts {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return { days, hours, minutes, seconds };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function buildSvgFrame(parts: Parts, style: Required<CountdownStyle>): string {
  const { days, hours, minutes, seconds } = parts;
  const { bgColor, textColor, labelColor, fontFamily, width, height } = style;

  const cellW = width / 4;
  const numY = height * 0.52;
  const labelY = height * 0.78;
  const numSize = Math.round(height * 0.38);
  const labelSize = Math.round(height * 0.14);

  const cells = [
    { value: pad(days), label: 'DAYS' },
    { value: pad(hours), label: 'HRS' },
    { value: pad(minutes), label: 'MIN' },
    { value: pad(seconds), label: 'SEC' },
  ];

  const cellsSvg = cells
    .map(({ value, label }, i) => {
      const x = cellW * i + cellW / 2;
      const separator = i < 3
        ? `<text x="${cellW * (i + 1)}" y="${numY}" font-family="${fontFamily}" font-size="${numSize}" fill="${textColor}" text-anchor="middle" dominant-baseline="middle" font-weight="bold">:</text>`
        : '';
      return `
        <text x="${x}" y="${numY}" font-family="${fontFamily}" font-size="${numSize}" fill="${textColor}" text-anchor="middle" dominant-baseline="middle" font-weight="bold">${value}</text>
        <text x="${x}" y="${labelY}" font-family="${fontFamily}" font-size="${labelSize}" fill="${labelColor}" text-anchor="middle">${label}</text>
        ${separator}`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${bgColor}" rx="8"/>
  ${cellsSvg}
</svg>`;
}

/**
 * Generate an animated GIF countdown timer.
 *
 * Returns a Buffer containing the raw GIF bytes. The caller is responsible for
 * streaming/caching the result.
 */
export async function generateCountdownGif(opts: CountdownGifOptions): Promise<Buffer> {
  const targetMs = new Date(opts.targetDate).getTime();
  if (Number.isNaN(targetMs)) throw new Error(`Invalid targetDate: ${opts.targetDate}`);

  const fps = Math.min(10, Math.max(1, opts.fps ?? 2));
  const durationSeconds = Math.min(60, Math.max(1, opts.durationSeconds ?? 30));
  const totalFrames = fps * durationSeconds;
  const frameDelayCs = Math.round(100 / fps); // GIF delay is in centiseconds

  const style: Required<CountdownStyle> = {
    bgColor: opts.style?.bgColor ?? '#1e293b',
    textColor: opts.style?.textColor ?? '#f8fafc',
    labelColor: opts.style?.labelColor ?? '#94a3b8',
    fontFamily: opts.style?.fontFamily ?? 'Arial, Helvetica, sans-serif',
    width: opts.style?.width ?? 480,
    height: opts.style?.height ?? 120,
  };

  const { width, height } = style;

  const encoder = new GIFEncoder(width, height, 'neuquant', true);
  encoder.setDelay(frameDelayCs * 10); // gif-encoder-2 takes milliseconds
  encoder.setRepeat(0); // loop forever
  encoder.start();

  const msPerFrame = 1000 / fps;
  const nowMs = Date.now();

  for (let i = 0; i < totalFrames; i++) {
    const simulatedNow = nowMs + i * msPerFrame;
    const remaining = targetMs - simulatedNow;
    const parts = toParts(remaining);
    const svg = buildSvgFrame(parts, style);

    // sharp can render SVG → raw RGBA pixels directly
    const { data } = await sharp(Buffer.from(svg))
      .resize(width, height)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    encoder.addFrame(data);
  }

  encoder.finish();
  const buf = encoder.out.getData();
  return Buffer.from(buf);
}
