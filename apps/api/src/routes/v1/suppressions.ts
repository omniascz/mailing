import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLogs, suppressions } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { suppressionEmail, suppressionEmailIs } from '../../services/suppressions/email.js';

const REASON = [
  'hard_bounce',
  'complaint',
  'manual',
  'unsubscribe',
  'block',
  'invalid_email',
] as const;

/** Reasons that record the recipient's own refusal — never deleted by an operator. */
const RECIPIENT_REFUSALS: readonly string[] = ['unsubscribe', 'complaint'];

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
          or(sql`${suppressions.email} ILIKE ${like}`, sql`${suppressions.phone} ILIKE ${like}`)!,
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
   * GET /api/v1/suppressions/summary
   * Per-list counts (SendGrid-style: bounces / blocks / spam_reports /
   * invalid_emails / unsubscribes) for the suppression dashboard. Every reason
   * is present in the response even when its count is zero.
   */
  app.get(
    '/api/v1/suppressions/summary',
    { schema: { tags: ['Suppressions'], summary: 'Suppression counts per list' } },
    async (req) => {
      const rows = await db
        .select({ reason: suppressions.reason, count: sql<number>`count(*)::int` })
        .from(suppressions)
        .where(eq(suppressions.orgId, req.user!.orgId))
        .groupBy(suppressions.reason);

      const counts = Object.fromEntries(REASON.map((r) => [r, 0])) as Record<
        (typeof REASON)[number],
        number
      >;
      for (const row of rows) counts[row.reason as (typeof REASON)[number]] = row.count;
      // Addresses, not rows: one address can be in several lists at once (one
      // row per reason), so the sum of the counts would count it twice.
      const [distinct] = await db
        .select({
          n: sql<number>`count(distinct coalesce(${suppressions.email}, ${suppressions.phone}, ${suppressions.id}::text))::int`,
        })
        .from(suppressions)
        .where(eq(suppressions.orgId, req.user!.orgId));
      const total = distinct?.n ?? 0;
      return { data: { counts, total } };
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
        .values({
          orgId: req.user!.orgId,
          ...body,
          // Stored the way every reader looks it up. As typed, Jan@X.cz was a
          // row that stopped nothing sent to jan@x.cz (Z144).
          ...(body.email ? { email: suppressionEmail(body.email) } : {}),
        })
        .returning()
        .catch((err: Error) => {
          if (
            err.message.includes('suppressions_org_email_reason_idx') ||
            err.message.includes('suppressions_org_phone_idx')
          ) {
            throw AppError.conflict('Address is already suppressed for this reason');
          }
          throw err;
        });
      return reply.code(201).send({ data: row });
    },
  );

  /**
   * DELETE /api/v1/suppressions/:id
   * Release a deliverability suppression (hard_bounce, invalid_email, block,
   * manual). Admin or owner only, and every release is written to audit_logs
   * with who and when.
   *
   * An 'unsubscribe' or 'complaint' row is the recipient's own refusal and is
   * never deleted here: they come back only through the preference centre's
   * resubscribe or a double opt-in confirmation, which record their consent
   * (services/contacts/resubscribe.ts). This route used to delete any row for
   * any role, viewer included, and the next edit to 'active' then mailed an
   * unsubscribed or complaining address (Z142, measured).
   *
   * Nor is the row an erasure leaves (email_hash set, services/contacts/
   * gdpr.ts): the person was deleted at their request and stays suppressed
   * until they give consent again, which only their double opt-in confirmation
   * records. Owner and admin alike; it used to answer 204 to both (Z145).
   */
  app.delete(
    '/api/v1/suppressions/:id',
    {
      preHandler: [app.requireRole('admin', 'owner')],
      schema: { tags: ['Suppressions'], summary: 'Release a deliverability suppression' },
    },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const orgId = req.user!.orgId;
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(suppressions)
          .where(and(eq(suppressions.id, id), eq(suppressions.orgId, orgId)))
          .for('update')
          .limit(1);
        if (!row) throw AppError.notFound('Suppression');
        if (row.emailHash) {
          throw new AppError({
            code: 'ERASURE_SUPPRESSION',
            statusCode: 409,
            message:
              'This suppression keeps an erased person from being mailed and cannot be removed',
            details: {
              reason: 'gdpr_erasure',
              explanation:
                'The contact was anonymised at their request (right to erasure). Their address is ' +
                'kept only as a hash, and mail to it stays stopped until the person confirms a ' +
                'double opt-in subscription again, which lifts this row and records their consent. ' +
                'Neither an owner nor an admin can remove it.',
            },
          });
        }
        if (RECIPIENT_REFUSALS.includes(row.reason)) {
          throw new AppError({
            code: 'CONSENT_REQUIRED',
            statusCode: 409,
            message:
              `A '${row.reason}' suppression is the recipient's own refusal and cannot be removed. ` +
              `Only the recipient lifts it — through the preference centre or a double opt-in confirmation`,
          });
        }
        await tx.delete(suppressions).where(eq(suppressions.id, row.id));
        await tx.insert(auditLogs).values({
          orgId,
          userId: req.user!.userId ?? null,
          action: 'suppression.released',
          resource: 'suppression',
          resourceId: row.id,
          changes: {
            email: row.email,
            phone: row.phone,
            reason: row.reason,
            suppressedAt: row.createdAt.toISOString(),
          },
          metadata: { role: req.user!.role },
          ipAddress: req.ip ?? null,
          userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
        });
      });
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
      if (body.email) orConds.push(suppressionEmailIs(body.email));
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
  reason: 'hard_bounce' | 'complaint' | 'unsubscribe' | 'block' | 'invalid_email',
): Promise<void> {
  if (!target.email && !target.phone) return;
  await db
    .insert(suppressions)
    .values({
      orgId,
      ...target,
      ...(target.email ? { email: suppressionEmail(target.email) } : {}),
      reason,
    })
    .onConflictDoNothing();
}
