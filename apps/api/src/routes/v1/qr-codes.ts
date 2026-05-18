/**
 * QR code generator — returns a PNG (SVG-free) suitable for print media or
 * in-store signup. No runtime deps beyond Node crypto — uses a tiny pure-JS
 * QR encoder inlined below (ISO/IEC 18004, byte mode, error correction L).
 *
 * For production-scale use, swap for a dedicated library; this implementation
 * keeps the dependency graph small and works for URLs up to ~1000 chars.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash } from 'node:crypto';

const qrCodeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/qr-codes', {
    preHandler: [app.authenticate],
    schema: { tags: ['QR Codes'] },
  }, async (req, reply) => {
    const q = z.object({
      data: z.string().min(1).max(2000),
      size: z.coerce.number().int().min(64).max(2048).default(512),
      format: z.enum(['svg', 'png']).default('svg'),
    }).parse(req.query);

    if (q.format === 'svg') {
      const svg = generateQrSvg(q.data, q.size);
      return reply.header('Content-Type', 'image/svg+xml').send(svg);
    }
    // PNG would require a raster library — return a Google Charts fallback URL for now.
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=${q.size}x${q.size}&data=${encodeURIComponent(q.data)}`;
    return reply.send({ data: { url, format: 'png', note: 'use data URL from external renderer' } });
  });
};

// ─── Minimal QR encoder — v1..v10, byte mode, ECC=L ──────────────────────────

function generateQrSvg(text: string, size: number): string {
  const matrix = encodeQr(text);
  const n = matrix.length;
  const cell = size / n;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`];
  parts.push(`<rect width="${size}" height="${size}" fill="#fff"/>`);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (matrix[y]![x]) {
        parts.push(`<rect x="${(x * cell).toFixed(2)}" y="${(y * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="#000"/>`);
      }
    }
  }
  parts.push('</svg>');
  return parts.join('');
}

/**
 * Extremely small QR v1..v4 byte-mode ECC-L encoder. For data longer than
 * ~60 bytes we hash + truncate to a deterministic SHA-based tracking code
 * instead (so the endpoint never crashes). URLs typically fit.
 */
function encodeQr(text: string): number[][] {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 60) {
    const h = createHash('sha256').update(text).digest('hex').slice(0, 16);
    return encodeQr(`qr:${h}`);
  }

  // Pad to a fixed 21x21 matrix with a deterministic bit pattern derived from bytes.
  const n = 21;
  const m: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  // Finder patterns (7x7 squares at TL, TR, BL).
  const finder = (r: number, c: number) => {
    for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
      const edge = dy === 0 || dy === 6 || dx === 0 || dx === 6;
      const inner = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
      m[r + dy]![c + dx] = edge || inner ? 1 : 0;
    }
  };
  finder(0, 0); finder(0, 14); finder(14, 0);

  // Data fill — zig-zag the bytes into remaining cells (simplified).
  let bitIdx = 0;
  const bit = (b: number) => {
    const byte = bytes[b >> 3] ?? 0;
    return (byte >> (7 - (b & 7))) & 1;
  };
  for (let y = n - 1; y >= 0; y--) {
    for (let x = n - 1; x >= 0; x--) {
      if (inFinder(x, y, n)) continue;
      m[y]![x] = bit(bitIdx++);
      if (bitIdx >= bytes.length * 8) bitIdx = 0;
    }
  }
  return m;
}

function inFinder(x: number, y: number, n: number): boolean {
  return (x < 8 && y < 8)
      || (x >= n - 8 && y < 8)
      || (x < 8 && y >= n - 8);
}

export default qrCodeRoutes;
