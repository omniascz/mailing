import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { suppressions } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

const REASON = ['hard_bounce', 'complaint', 'manual', 'unsubscribe'] as const;

const createSchema = z
  .object({
    email: z.string().email().max(255).optional(),
    phone: z.string().max(32).optional(),
    reason: z.enum(REASON),
    notes: z.string().max(1000).optional(),
  })
  .refine((d) => d.email || d.phone, { message: 'At least one of email or phone is required' });

const idParam = z.object({ id: z.string().uuid() });
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  reason: z.enum(REASON).optional(),
  search: z.string().max(200).optional(),
});

export default async function suppressionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * GET /api/v1/suppressions
   * List suppressed emails/phones for this organisation.
   */
  app.get(
    '/api/v1/suppressions',
    { schema: { tags: ['Suppressions'], summary: 'List suppressions' } },
    async (req) => {
      const q = listQuery.parse(req.query);
      const conds = [eq(suppressions.orgId, req.user!.orgId)];

      if (q.reason) conds.push(eq(suppressions.reason, q.reason));
      if (q.search) {
        const like = `%${q.search}%`;
        conds.push(
          or(
            sql`${suppressions.email} ILIKE ${like}`,
            sql`${suppressions.phone} ILIKE ${like}`,
          )!,
        );
      }

      const rows = await db
        .select()
        .from(suppressions)
        .where(and(...conds))
        .orderBy(desc(suppressions.createdAt))
        .limit(q.limit)
        .offset(q.offset);

      return { data: rows };
    },
  );

  /**
   * POST /api/v1/suppressions
   * Add an address to the suppression list.
   */
  app.post(
    '/api/v1/suppressions',
    { schema: { tags: ['Suppressions'], summary: 'Add suppression' } },
    async (req, reply) => {
      const body = createSchema.parse(req.body);
      const [row] = await db
        .insert(suppressions)
        .values({ orgId: req.user!.orgId, ...body })
        .returning()
        .catch((err: Error) => {
          if (
            err.message.includes('suppressions_org_email_idx') ||
            err.message.includes('suppressions_org_phone_idx')
          ) {
            throw AppError.conflict('Address is already suppressed');
          }
          throw err;
        });
      return reply.code(201).send({ data: row });
    },
  );

  /**
   * DELETE /api/v1/suppressions/:id
   * Remove a suppression (manual re-activation).
   */
  app.delete(
    '/api/v1/suppressions/:id',
    { schema: { tags: ['Suppressions'], summary: 'Remove suppression' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const [row] = await db
        .delete(suppressions)
        .where(and(eq(suppressions.id, id), eq(suppressions.orgId, req.user!.orgId)))
        .returning();
      if (!row) throw AppError.notFound('Suppression');
      return reply.code(204).send();
    },
  );

  /**
   * POST /api/v1/suppressions/check
   * Check whether an email or phone is suppressed (used in pre-send validation).
   * Body: { email?, phone? }
   * Returns: { suppressed: boolean, reason?: string }
   */
  app.post(
    '/api/v1/suppressions/check',
    { schema: { tags: ['Suppressions'], summary: 'Check if address is suppressed' } },
    async (req) => {
      const body = z
        .object({ email: z.string().email().optional(), phone: z.string().optional() })
        .refine((d) => d.email || d.phone)
        .parse(req.body);

      const conds = [eq(suppressions.orgId, req.user!.orgId)];
      const orConds = [];
      if (body.email) orConds.push(eq(suppressions.email, body.email.toLowerCase()));
      if (body.phone) orConds.push(eq(suppressions.phone, body.phone));
      conds.push(or(...orConds)!);

      const [hit] = await db
        .select()
        .from(suppressions)
        .where(and(...conds))
        .limit(1);
      if (hit) {
        return { data: { suppressed: true, reason: hit.reason, id: hit.id } };
      }
      return { data: { suppressed: false } };
    },
  );
}

/**
 * Auto-add to suppression list (called from bounce/complaint processors).
 * Silently ignores duplicate conflicts.
 */
export async function autoSuppress(
  orgId: string,
  target: { email?: string; phone?: string },
  reason: 'hard_bounce' | 'complaint' | 'unsubscribe',
): Promise<void> {
  if (!target.email && !target.phone) return;
  await db
    .insert(suppressions)
    .values({ orgId, ...target, reason })
    .onConflictDoNothing();
}
