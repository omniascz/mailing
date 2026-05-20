import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { customFieldDefinitions } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const KEY_RE = /^[a-z][a-z0-9_]{0,98}$/;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(KEY_RE, 'Key must be snake_case (letters, digits, underscores)'),
  fieldType: z.enum(['text', 'number', 'date', 'select', 'boolean']),
  options: z.array(z.string().min(1).max(200)).min(1).max(100).optional(),
  required: z.boolean().optional(),
  defaultValue: z.string().max(1000).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  options: z.array(z.string().min(1).max(200)).min(1).max(100).optional(),
  required: z.boolean().optional(),
  defaultValue: z.string().max(1000).nullable().optional(),
});

const idParam = z.object({ id: z.string().uuid() });

// ─── Route plugin ────────────────────────────────────────────────────────────

export default async function customFieldRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * GET /api/v1/custom-fields
   * List all custom field definitions for this organisation.
   */
  app.get(
    '/api/v1/custom-fields',
    { schema: { tags: ['CustomFields'], summary: 'List custom field definitions' } },
    async (req) => {
      const rows = await db
        .select()
        .from(customFieldDefinitions)
        .where(eq(customFieldDefinitions.orgId, req.user!.orgId))
        .orderBy(asc(customFieldDefinitions.name));
      return { data: rows };
    },
  );

  /**
   * POST /api/v1/custom-fields
   * Create a new custom field definition.
   */
  app.post(
    '/api/v1/custom-fields',
    { schema: { tags: ['CustomFields'], summary: 'Create custom field definition' } },
    async (req, reply) => {
      const body = createSchema.parse(req.body);

      if (body.fieldType === 'select' && (!body.options || body.options.length === 0)) {
        throw AppError.badRequest('Options are required for select type fields');
      }
      if (body.fieldType !== 'select' && body.options) {
        throw AppError.badRequest('Options are only valid for select type fields');
      }

      const [row] = await db
        .insert(customFieldDefinitions)
        .values({ orgId: req.user!.orgId, ...body })
        .returning()
        .catch((err: Error) => {
          if (err.message.includes('custom_field_defs_org_key_idx')) {
            throw AppError.conflict(`Custom field with key "${body.key}" already exists`);
          }
          throw err;
        });
      return reply.code(201).send({ data: row });
    },
  );

  /**
   * GET /api/v1/custom-fields/:id
   */
  app.get(
    '/api/v1/custom-fields/:id',
    { schema: { tags: ['CustomFields'], summary: 'Get custom field definition' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const [row] = await db
        .select()
        .from(customFieldDefinitions)
        .where(
          and(eq(customFieldDefinitions.id, id), eq(customFieldDefinitions.orgId, req.user!.orgId)),
        )
        .limit(1);
      if (!row) throw AppError.notFound('Custom field definition');
      return { data: row };
    },
  );

  /**
   * PUT /api/v1/custom-fields/:id
   * Update name, options, required, defaultValue. Key is immutable.
   */
  app.put(
    '/api/v1/custom-fields/:id',
    { schema: { tags: ['CustomFields'], summary: 'Update custom field definition' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const patch = updateSchema.parse(req.body);

      const [row] = await db
        .update(customFieldDefinitions)
        .set({ ...patch, updatedAt: new Date() })
        .where(
          and(eq(customFieldDefinitions.id, id), eq(customFieldDefinitions.orgId, req.user!.orgId)),
        )
        .returning();
      if (!row) throw AppError.notFound('Custom field definition');
      return { data: row };
    },
  );

  /**
   * DELETE /api/v1/custom-fields/:id
   * Removes the definition. Values in contacts.custom_fields are NOT purged
   * (too expensive at delete time; done lazily or via background job).
   */
  app.delete(
    '/api/v1/custom-fields/:id',
    { schema: { tags: ['CustomFields'], summary: 'Delete custom field definition' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const [row] = await db
        .delete(customFieldDefinitions)
        .where(
          and(eq(customFieldDefinitions.id, id), eq(customFieldDefinitions.orgId, req.user!.orgId)),
        )
        .returning();
      if (!row) throw AppError.notFound('Custom field definition');
      return reply.code(204).send();
    },
  );
}

// ─── Validation helper (used by contact routes) ───────────────────────────────

/**
 * Validate a contact's customFields object against the org's field definitions.
 * Throws AppError.badRequest if any constraint is violated.
 */
export async function validateCustomFields(
  orgId: string,
  customFields: Record<string, unknown>,
): Promise<void> {
  const defs = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.orgId, orgId));

  const errors: string[] = [];

  for (const def of defs) {
    const value = customFields[def.key];

    // Required check
    if (def.required && (value === undefined || value === null || value === '')) {
      errors.push(`Field "${def.key}" is required`);
      continue;
    }

    if (value === undefined || value === null) continue;

    // Type validation
    switch (def.fieldType) {
      case 'number':
        if (isNaN(Number(value))) {
          errors.push(`Field "${def.key}" must be a number`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
          errors.push(`Field "${def.key}" must be a boolean`);
        }
        break;
      case 'date':
        if (typeof value === 'string' && isNaN(Date.parse(value))) {
          errors.push(`Field "${def.key}" must be a valid date string`);
        }
        break;
      case 'select':
        if (def.options && !def.options.includes(String(value))) {
          errors.push(`Field "${def.key}" must be one of: ${def.options.join(', ')}`);
        }
        break;
      case 'text':
        // No extra validation needed
        break;
    }
  }

  if (errors.length > 0) {
    throw AppError.badRequest('Custom field validation failed', { errors });
  }
}
