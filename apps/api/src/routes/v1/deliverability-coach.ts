import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { analyzeDeliverability } from '../../services/ai/deliverability-coach.js';

export default async function deliverabilityCoachRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * POST /api/v1/deliverability/analyze
   * Full pre-send deliverability analysis with AI coaching.
   */
  app.post('/api/v1/deliverability/analyze', async (req) => {
    const body = z.object({
      subject: z.string().min(1).max(300),
      html: z.string().min(1),
      fromName: z.string().min(1).max(100),
      fromEmail: z.string().email(),
    }).parse(req.body);

    const report = await analyzeDeliverability(
      req.user!.orgId,
      body.subject,
      body.html,
      body.fromName,
      body.fromEmail,
    );

    return { data: report };
  });
}
