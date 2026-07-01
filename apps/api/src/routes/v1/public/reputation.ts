/**
 * Public sender-reputation badge routes (#440).
 *
 * Unauthenticated (no `authenticate` preHandler) — serves a coarse, opt-in
 * transparency badge for a verified sending domain.
 *
 *   GET /api/v1/public/reputation/:domain            — JSON badge summary
 *   GET /api/v1/public/reputation/:domain/badge.svg  — shields-style SVG image
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPublicReputationBadge } from '../../../services/deliverability/reputation-badge.js';
import { renderReputationBadgeSvg, gradeToColor } from '../../../services/deliverability/pure.js';
import { AppError } from '../../../lib/app-error.js';

const paramsSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9.-]+$/i, 'Invalid domain'),
});

export default async function publicReputationRoutes(app: FastifyInstance) {
  // JSON summary
  app.get(
    '/api/v1/public/reputation/:domain',
    { schema: { tags: ['Public'] } },
    async (request, reply) => {
      const { domain } = paramsSchema.parse(request.params);
      const badge = await getPublicReputationBadge(domain);
      if (!badge) {
        throw new AppError({
          code: 'NOT_FOUND',
          message: 'No public reputation badge for this domain',
          statusCode: 404,
        });
      }
      // Cacheable at the edge for 1 h — reputation moves slowly.
      return reply
        .header('Cache-Control', 'public, max-age=3600')
        .send({ data: badge });
    },
  );

  // SVG badge image
  app.get(
    '/api/v1/public/reputation/:domain/badge.svg',
    { schema: { tags: ['Public'] } },
    async (request, reply) => {
      const { domain } = paramsSchema.parse(request.params);
      const badge = await getPublicReputationBadge(domain);
      if (!badge) {
        throw new AppError({
          code: 'NOT_FOUND',
          message: 'No public reputation badge for this domain',
          statusCode: 404,
        });
      }
      const svg = renderReputationBadgeSvg(
        'sender reputation',
        `${badge.grade} (${badge.score})`,
        gradeToColor(badge.grade),
      );
      return reply
        .header('Content-Type', 'image/svg+xml; charset=utf-8')
        .header('Cache-Control', 'public, max-age=3600')
        .send(svg);
    },
  );
}
