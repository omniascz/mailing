/**
 * Anomaly detector internal route.
 *
 *   POST /api/v1/internal/anomaly-detector/scan  one-shot sweep
 *
 * Called by the BullMQ recurring job in apps/workers + by the operator
 * dashboard's "scan now" button. Returns the sweep summary so the
 * caller can log it.
 */

import type { FastifyPluginAsync } from 'fastify';
import { scanForAnomalies } from '../../../services/deliverability/anomaly-detector.js';

const anomalyDetectorRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/anomaly-detector/scan',
    {
      schema: {
        tags: ['Internal'],
        summary: 'Scan every in-flight campaign for bounce/complaint anomalies',
      },
    },
    async (_req, reply) => {
      const result = await scanForAnomalies();
      return reply.send({ data: result });
    },
  );
};

export default anomalyDetectorRoutes;
