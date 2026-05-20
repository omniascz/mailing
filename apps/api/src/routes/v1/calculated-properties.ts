/**
 * Calculated properties routes (#350).
 *
 *   GET    /api/v1/calculated-properties            — list
 *   POST   /api/v1/calculated-properties            — create (admin)
 *   DELETE /api/v1/calculated-properties/:id        — admin (soft-delete)
 *   POST   /api/v1/calculated-properties/preview    — dry-run evaluate against a row
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createProperty,
  listProperties,
  deleteProperty,
  evaluateAll,
} from '../../services/calculated-props/index.js';

const entityEnum = z.enum(['contact', 'deal', 'account']);
const resultTypeEnum = z.enum(['number', 'string', 'boolean', 'date']);
const cacheEnum = z.enum(['none', 'lazy', 'eager']);

const calcPropRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/calculated-properties',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CalculatedProperties'] },
    },
    async (req, reply) => {
      const { entity } = z.object({ entity: entityEnum.optional() }).parse(req.query);
      return reply.send({ data: await listProperties(req.user!.orgId, entity) });
    },
  );

  app.post(
    '/api/v1/calculated-properties',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['CalculatedProperties'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          entity: entityEnum,
          key: z.string().min(1).max(64),
          label: z.string().min(1).max(128),
          description: z.string().max(500).optional(),
          resultType: resultTypeEnum,
          formula: z.any(),
          cacheStrategy: cacheEnum.optional(),
          cacheTtlSeconds: z
            .number()
            .int()
            .positive()
            .max(30 * 24 * 3600)
            .optional(),
        })
        .parse(req.body);
      return reply.code(201).send({
        data: await createProperty(req.user!.orgId, {
          ...body,
          formula: body.formula as never,
        }),
      });
    },
  );

  app.delete(
    '/api/v1/calculated-properties/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['CalculatedProperties'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteProperty(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/v1/calculated-properties/preview',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CalculatedProperties'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          entity: entityEnum,
          row: z.record(z.unknown()),
        })
        .parse(req.body);
      const props = await listProperties(req.user!.orgId, body.entity);
      return reply.send({ data: evaluateAll(props, body.row) });
    },
  );
};

export default calcPropRoutes;
