import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { simulateWorkflow } from '../../services/campaigns/what-if-simulator.js';

export default async function whatIfSimulatorRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * POST /api/v1/what-if/simulate
   * Simulate expected outcomes of a workflow before publishing.
   */
  app.post('/api/v1/what-if/simulate', async (req) => {
    const body = z
      .object({
        audienceSize: z.number().int().min(1).max(10_000_000),
        steps: z
          .array(
            z.object({
              name: z.string().min(1).max(100),
              delayDays: z.number().int().min(0).max(365),
              emailSubject: z.string().optional(),
              conditionType: z.enum(['opened', 'clicked', 'not_opened', 'none']).default('none'),
            }),
          )
          .min(1)
          .max(20),
      })
      .parse(req.body);

    const result = await simulateWorkflow(req.user!.orgId, body.audienceSize, body.steps);
    return { data: result };
  });
}
