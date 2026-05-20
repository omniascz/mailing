import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  refreshOrgRfm,
  rfmDistribution,
  getContactRfm,
  listSegmentContacts,
  type RfmSegment,
} from '../../services/rfm/index.js';

const rfmSegmentEnum = z.enum([
  'champions',
  'loyal',
  'potential_loyalists',
  'recent_customers',
  'promising',
  'needs_attention',
  'about_to_sleep',
  'at_risk',
  'cant_lose',
  'hibernating',
  'lost',
]);

const rfmRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/rfm/refresh',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['RFM'] },
    },
    async (req, reply) => {
      return reply.send({ data: await refreshOrgRfm(req.user!.orgId) });
    },
  );

  app.get(
    '/api/v1/rfm/distribution',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['RFM'] },
    },
    async (req, reply) => {
      return reply.send({ data: await rfmDistribution(req.user!.orgId) });
    },
  );

  app.get(
    '/api/v1/rfm/contacts/:contactId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['RFM'] },
    },
    async (req, reply) => {
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getContactRfm(contactId) });
    },
  );

  /**
   * GET /api/v1/rfm/segments/:segment/contacts?cursor=&limit=
   * Paginated list of contactIds in a named RFM cohort — wired into the
   * campaign builder's "Send to Champions / At Risk / Lost" picker.
   */
  app.get(
    '/api/v1/rfm/segments/:segment/contacts',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['RFM'] },
    },
    async (req, reply) => {
      const { segment } = z.object({ segment: rfmSegmentEnum }).parse(req.params);
      const { cursor, limit } = z
        .object({
          cursor: z.string().uuid().optional(),
          limit: z
            .string()
            .transform((v) => parseInt(v, 10))
            .pipe(z.number().int().min(1).max(5000))
            .optional(),
        })
        .parse(req.query);
      const result = await listSegmentContacts({
        orgId: req.user!.orgId,
        segment: segment as RfmSegment,
        cursor,
        limit,
      });
      return reply.send({ data: result });
    },
  );
};

export default rfmRoutes;
