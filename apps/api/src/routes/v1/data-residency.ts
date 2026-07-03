/**
 * Data residency — region selection + resolved endpoints for the org.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  getOrgRegion,
  resolveOrgEndpoints,
  setOrgRegion,
  DATA_REGIONS,
} from '../../services/data-residency/index.js';

const dataResidencyRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/account/data-region',
    { preHandler: [app.requireAuth], schema: { tags: ['Data Residency'] } },
    async (req) => {
      const orgId = req.user!.orgId;
      const [region, endpoints] = await Promise.all([
        getOrgRegion(orgId),
        resolveOrgEndpoints(orgId),
      ]);
      return {
        data: {
          region,
          availableRegions: DATA_REGIONS,
          awsRegion: endpoints.awsRegion,
          s3Bucket: endpoints.s3Bucket,
          s3Endpoint: endpoints.s3Endpoint,
        },
      };
    },
  );

  app.put(
    '/api/v1/account/data-region',
    {
      preHandler: [app.requireAuth, app.requireRole('owner')],
      schema: { tags: ['Data Residency'], summary: 'Set the org data region' },
    },
    async (req) => {
      const { region } = z.object({ region: z.enum(['us', 'eu', 'ap']) }).parse(req.body);
      const applied = await setOrgRegion(req.user!.orgId, region);
      return {
        data: {
          region: applied,
          note: 'Applies to newly-written data. Existing data is not automatically migrated.',
        },
      };
    },
  );
};

export default dataResidencyRoutes;
