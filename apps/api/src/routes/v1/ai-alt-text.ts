import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateAltText, fillMissingAltTexts } from '../../services/editor/ai-alt-text.js';

export default async function aiAltTextRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * POST /api/v1/editor/alt-text/generate
   * Generate alt text for a single image URL.
   */
  app.post('/api/v1/editor/alt-text/generate', async (req) => {
    const body = z
      .object({
        imageUrl: z.string().url(),
        context: z.string().max(200).optional(),
      })
      .parse(req.body);

    const result = await generateAltText(req.user!.orgId, body.imageUrl, body.context);
    return { data: result };
  });

  /**
   * POST /api/v1/editor/alt-text/fill-html
   * Fill all missing alt attributes in an email HTML string.
   */
  app.post('/api/v1/editor/alt-text/fill-html', async (req) => {
    const body = z
      .object({
        html: z.string().min(1),
        emailContext: z.string().max(300).optional(),
      })
      .parse(req.body);

    const result = await fillMissingAltTexts(req.user!.orgId, body.html, body.emailContext);
    return { data: result };
  });
}
