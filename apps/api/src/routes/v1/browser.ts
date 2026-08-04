/**
 * View-in-browser route (#3) — public, unauthenticated hosted copy of an email.
 *
 *   GET /api/v1/browser/:token  → renders the campaign for the token's contact
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { renderCampaignForToken } from '../../services/campaigns/browser-view.js';
import { AppError } from '../../lib/app-error.js';

const paramsSchema = z.object({ token: z.string().min(1).max(2048) });

export default async function browserRoutes(app: FastifyInstance) {
  app.get('/api/v1/browser/:token', { schema: { tags: ['Public'] } }, async (request, reply) => {
    const { token } = paramsSchema.parse(request.params);
    const html = await renderCampaignForToken(token);
    if (!html) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'This email is no longer available.',
        statusCode: 404,
      });
    }
    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Cache-Control', 'public, max-age=3600')
      .send(html);
  });
}
