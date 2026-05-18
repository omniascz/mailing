import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as svc from '../../services/custom-objects/index.js';

const fieldSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(255),
  type: z.enum(['text', 'number', 'date', 'boolean', 'select', 'reference']),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  referenceTo: z.enum(['contact', 'account', 'deal', 'custom']).optional(),
  referenceCustomKey: z.string().max(64).optional(),
  defaultValue: z.unknown().optional(),
});

const createDefSchema = z.object({
  key: z.string().min(1).max(64),
  singularLabel: z.string().min(1).max(255),
  pluralLabel: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  fields: z.array(fieldSchema).max(100).optional(),
  primaryFieldKey: z.string().max(64).optional(),
});

const updateDefSchema = z.object({
  singularLabel: z.string().min(1).max(255).optional(),
  pluralLabel: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  fields: z.array(fieldSchema).max(100).optional(),
  primaryFieldKey: z.string().max(64).optional(),
});

const recordCreateSchema = z.object({
  data: z.record(z.unknown()),
  externalId: z.string().max(255).optional(),
});

const recordUpsertSchema = z.object({
  externalId: z.string().min(1).max(255),
  data: z.record(z.unknown()),
});

const recordUpdateSchema = z.object({
  data: z.record(z.unknown()),
});

const relationSchema = z.object({
  entityType: z.enum(['contact', 'account', 'deal', 'custom']),
  entityId: z.string().uuid(),
  entityCustomKey: z.string().max(64).optional(),
  role: z.string().max(64).optional(),
});

export default async function customObjectRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // ─── Definitions ───────────────────────────────────────────────────────────

  app.get(
    '/api/v1/custom-objects',
    { schema: { tags: ['CustomObjects'], summary: 'List custom object definitions' } },
    async (req) => ({ data: await svc.listDefinitions(req.user!.orgId) }),
  );

  app.post(
    '/api/v1/custom-objects',
    { schema: { tags: ['CustomObjects'], summary: 'Create custom object definition' } },
    async (req, reply) => {
      const body = createDefSchema.parse(req.body);
      const def = await svc.createDefinition({ orgId: req.user!.orgId, ...body });
      return reply.code(201).send({ data: def });
    },
  );

  app.get(
    '/api/v1/custom-objects/:idOrKey',
    { schema: { tags: ['CustomObjects'], summary: 'Get custom object definition' } },
    async (req) => {
      const { idOrKey } = z.object({ idOrKey: z.string() }).parse(req.params);
      return { data: await svc.getDefinition(req.user!.orgId, idOrKey) };
    },
  );

  app.put(
    '/api/v1/custom-objects/:id',
    { schema: { tags: ['CustomObjects'], summary: 'Update custom object definition' } },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = updateDefSchema.parse(req.body);
      return { data: await svc.updateDefinition(req.user!.orgId, id, body) };
    },
  );

  app.delete(
    '/api/v1/custom-objects/:id',
    { schema: { tags: ['CustomObjects'], summary: 'Delete custom object definition' } },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await svc.deleteDefinition(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // ─── Records ───────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/custom-objects/:objectKey/records',
    { schema: { tags: ['CustomObjects'], summary: 'List records' } },
    async (req) => {
      const { objectKey } = z.object({ objectKey: z.string() }).parse(req.params);
      const { limit, cursor } = z
        .object({ limit: z.coerce.number().int().min(1).max(200).optional(), cursor: z.string().optional() })
        .parse(req.query);
      return svc.listRecords({ orgId: req.user!.orgId, objectKey, limit, cursor });
    },
  );

  app.post(
    '/api/v1/custom-objects/:objectKey/records',
    { schema: { tags: ['CustomObjects'], summary: 'Create record' } },
    async (req, reply) => {
      const { objectKey } = z.object({ objectKey: z.string() }).parse(req.params);
      const body = recordCreateSchema.parse(req.body);
      const record = await svc.createRecord({ orgId: req.user!.orgId, objectKey, ...body });
      return reply.code(201).send({ data: record });
    },
  );

  app.put(
    '/api/v1/custom-objects/:objectKey/records:upsert',
    { schema: { tags: ['CustomObjects'], summary: 'Upsert record by externalId' } },
    async (req) => {
      const { objectKey } = z.object({ objectKey: z.string() }).parse(req.params);
      const body = recordUpsertSchema.parse(req.body);
      const record = await svc.upsertRecord({ orgId: req.user!.orgId, objectKey, ...body });
      return { data: record };
    },
  );

  app.get(
    '/api/v1/custom-objects/records/:id',
    { schema: { tags: ['CustomObjects'], summary: 'Get record' } },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return { data: await svc.getRecord(req.user!.orgId, id) };
    },
  );

  app.patch(
    '/api/v1/custom-objects/records/:id',
    { schema: { tags: ['CustomObjects'], summary: 'Update record (partial)' } },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = recordUpdateSchema.parse(req.body);
      return { data: await svc.updateRecord(req.user!.orgId, id, body.data) };
    },
  );

  app.delete(
    '/api/v1/custom-objects/records/:id',
    { schema: { tags: ['CustomObjects'], summary: 'Soft-delete record' } },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await svc.deleteRecord(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // ─── Relations ─────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/custom-objects/records/:id/relations',
    { schema: { tags: ['CustomObjects'], summary: 'Link record to an entity' } },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = relationSchema.parse(req.body);
      const rel = await svc.relateRecord({ orgId: req.user!.orgId, recordId: id, ...body });
      return reply.code(201).send({ data: rel });
    },
  );

  app.get(
    '/api/v1/custom-objects/records/:id/relations',
    { schema: { tags: ['CustomObjects'], summary: 'List relations for a record' } },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return { data: await svc.listRelationsForRecord(req.user!.orgId, id) };
    },
  );

  app.get(
    '/api/v1/custom-objects/by-entity/:entityType/:entityId',
    { schema: { tags: ['CustomObjects'], summary: 'List relations for an entity' } },
    async (req) => {
      const { entityType, entityId } = z
        .object({
          entityType: z.enum(['contact', 'account', 'deal', 'custom']),
          entityId: z.string().uuid(),
        })
        .parse(req.params);
      return { data: await svc.listRelationsForEntity(req.user!.orgId, entityType, entityId) };
    },
  );

  app.delete(
    '/api/v1/custom-objects/relations/:id',
    { schema: { tags: ['CustomObjects'], summary: 'Remove a relation' } },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await svc.unrelateRecord(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );
}
