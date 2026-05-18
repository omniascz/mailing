import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createSegment,
  updateSegment,
  deleteSegment,
  listSegments,
  getSegment,
  countByConditions,
  listContactsByConditions,
  SegmentQueryError,
} from '../../services/segments/index.js';
import { AppError } from '../../lib/app-error.js';
import type { SegmentConditions, SegmentRuleOp } from '../../db/schema/segments.js';

const ruleOpSchema = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'in',
  'not_in',
  'is_set',
  'is_not_set',
  'has_tag',
  'not_has_tag',
  'opened_campaign',
  'not_opened_campaign',
  'clicked_link',
  'not_clicked_link',
]) satisfies z.ZodType<SegmentRuleOp>;

const ruleSchema = z.object({
  field: z.string().min(1).max(128),
  op: ruleOpSchema,
  value: z.unknown().optional(),
  withinDays: z.number().int().positive().max(3650).optional(),
});

const conditionsSchema: z.ZodType<SegmentConditions> = z.lazy(() =>
  z.object({
    operator: z.enum(['AND', 'OR']),
    rules: z.array(ruleSchema),
    groups: z.array(conditionsSchema).optional(),
    negate: z.boolean().optional(),
  }),
);

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  conditions: conditionsSchema,
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  conditions: conditionsSchema.optional(),
});

function mapQueryError(err: unknown): never {
  if (err instanceof SegmentQueryError) {
    throw AppError.badRequest(err.message);
  }
  throw err;
}

export default async function segmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/api/v1/segments', { schema: { tags: ['Segments'], summary: 'List segments' } }, async (req) => {
    const orgId = req.user!.orgId;
    const rows = await listSegments(orgId);
    return { data: rows };
  });

  app.post('/api/v1/segments', { schema: { tags: ['Segments'], summary: 'Create segment' } }, async (req) => {
    const body = createSchema.parse(req.body);
    try {
      const row = await createSegment({ orgId: req.user!.orgId, ...body });
      return { data: row };
    } catch (err) {
      mapQueryError(err);
    }
  });

  app.get(
    '/api/v1/segments/:id',
    { schema: { tags: ['Segments'], summary: 'Get segment' } },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return { data: await getSegment(req.user!.orgId, id) };
    },
  );

  app.put(
    '/api/v1/segments/:id',
    { schema: { tags: ['Segments'], summary: 'Update segment' } },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = updateSchema.parse(req.body);
      try {
        return { data: await updateSegment(req.user!.orgId, id, body) };
      } catch (err) {
        mapQueryError(err);
      }
    },
  );

  app.delete(
    '/api/v1/segments/:id',
    { schema: { tags: ['Segments'], summary: 'Delete segment' } },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteSegment(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  app.get(
    '/api/v1/segments/:id/count',
    { schema: { tags: ['Segments'], summary: 'Count contacts in segment' } },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const seg = await getSegment(req.user!.orgId, id);
      try {
        const count = await countByConditions(req.user!.orgId, seg.conditions);
        return { data: { count } };
      } catch (err) {
        mapQueryError(err);
      }
    },
  );

  app.post(
    '/api/v1/segments/preview/count',
    { schema: { tags: ['Segments'], summary: 'Preview count for ad-hoc conditions' } },
    async (req) => {
      const body = z.object({ conditions: conditionsSchema }).parse(req.body);
      try {
        const count = await countByConditions(req.user!.orgId, body.conditions);
        return { data: { count } };
      } catch (err) {
        mapQueryError(err);
      }
    },
  );

  app.get(
    '/api/v1/segments/:id/contacts',
    { schema: { tags: ['Segments'], summary: 'List contacts in segment' } },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const query = z
        .object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(500).optional() })
        .parse(req.query);
      const seg = await getSegment(req.user!.orgId, id);
      try {
        const opts: { cursor?: string; limit?: number } = {};
        if (query.cursor !== undefined) opts.cursor = query.cursor;
        if (query.limit !== undefined) opts.limit = query.limit;
        const result = await listContactsByConditions(req.user!.orgId, seg.conditions, opts);
        return result;
      } catch (err) {
        mapQueryError(err);
      }
    },
  );
}
