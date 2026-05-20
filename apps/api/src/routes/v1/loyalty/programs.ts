/**
 * Loyalty program routes — CRUD for programs + members (#235)
 *
 * GET    /api/v1/loyalty/programs
 * POST   /api/v1/loyalty/programs
 * GET    /api/v1/loyalty/programs/:id
 * PATCH  /api/v1/loyalty/programs/:id
 * DELETE /api/v1/loyalty/programs/:id
 *
 * POST   /api/v1/loyalty/programs/:id/members/enroll
 * GET    /api/v1/loyalty/programs/:id/members
 * GET    /api/v1/loyalty/programs/:id/members/:memberId
 * PATCH  /api/v1/loyalty/programs/:id/members/:memberId/status
 * POST   /api/v1/loyalty/programs/:id/members/:memberId/credit
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { loyaltyPrograms } from '../../../db/schema/index.js';
import {
  enrollMember,
  listMembers,
  getMember,
  updateMemberStatus,
  creditPoints,
} from '../../../services/loyalty/enrollment.js';

const loyaltyProgramRoutes: FastifyPluginAsync = async (app) => {
  // ── Programs CRUD ──────────────────────────────────────────────────────────

  app.get(
    '/api/v1/loyalty/programs',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Loyalty'], summary: 'List loyalty programs' },
    },
    async (req) => {
      const rows = await db
        .select()
        .from(loyaltyPrograms)
        .where(and(eq(loyaltyPrograms.orgId, req.user!.orgId), isNull(loyaltyPrograms.deletedAt)))
        .orderBy(loyaltyPrograms.createdAt);
      return { data: rows };
    },
  );

  app.post(
    '/api/v1/loyalty/programs',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Loyalty'], summary: 'Create a loyalty program' },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(255),
          description: z.string().optional(),
          tiers: z
            .array(
              z.object({
                id: z.string(),
                name: z.string(),
                minPoints: z.number().int().min(0),
                color: z.string().optional(),
                benefits: z.array(z.string()).optional(),
                multiplier: z.number().optional(),
              }),
            )
            .default([]),
          expiryType: z.enum(['never', 'rolling', 'fixed']).default('never'),
          expiryValue: z.string().max(10).optional(),
          earningEnabled: z.boolean().default(true),
          redemptionEnabled: z.boolean().default(true),
        })
        .parse(req.body);

      const [program] = await db
        .insert(loyaltyPrograms)
        .values({ orgId: req.user!.orgId, ...body })
        .returning();
      return reply.status(201).send({ data: program });
    },
  );

  app.get(
    '/api/v1/loyalty/programs/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Loyalty'], summary: 'Get a loyalty program' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const [row] = await db
        .select()
        .from(loyaltyPrograms)
        .where(
          and(
            eq(loyaltyPrograms.id, id),
            eq(loyaltyPrograms.orgId, req.user!.orgId),
            isNull(loyaltyPrograms.deletedAt),
          ),
        )
        .limit(1);
      if (!row) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Program not found' });
      return { data: row };
    },
  );

  app.patch(
    '/api/v1/loyalty/programs/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Loyalty'], summary: 'Update a loyalty program' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          name: z.string().min(1).max(255).optional(),
          description: z.string().optional(),
          tiers: z.array(z.any()).optional(),
          expiryType: z.enum(['never', 'rolling', 'fixed']).optional(),
          expiryValue: z.string().max(10).optional(),
          earningEnabled: z.boolean().optional(),
          redemptionEnabled: z.boolean().optional(),
          active: z.boolean().optional(),
        })
        .parse(req.body);

      const [updated] = await db
        .update(loyaltyPrograms)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(loyaltyPrograms.id, id), eq(loyaltyPrograms.orgId, req.user!.orgId)))
        .returning();
      if (!updated)
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Program not found' });
      return { data: updated };
    },
  );

  app.delete(
    '/api/v1/loyalty/programs/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Loyalty'], summary: 'Delete a loyalty program' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await db
        .update(loyaltyPrograms)
        .set({ deletedAt: new Date() })
        .where(and(eq(loyaltyPrograms.id, id), eq(loyaltyPrograms.orgId, req.user!.orgId)));
      return reply.status(204).send();
    },
  );

  // ── Members ────────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/loyalty/programs/:id/members/enroll',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Loyalty'], summary: 'Enroll a contact in a loyalty program' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.body);
      const result = await enrollMember(req.user!.orgId, id, contactId);
      return reply.status(result.alreadyEnrolled ? 200 : 201).send({ data: result.member });
    },
  );

  app.get(
    '/api/v1/loyalty/programs/:id/members',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Loyalty'], summary: 'List loyalty program members' },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const q = z
        .object({
          limit: z.coerce.number().int().min(1).max(200).default(50),
          cursor: z.string().optional(),
        })
        .parse(req.query);
      return listMembers(req.user!.orgId, id, q);
    },
  );

  app.get(
    '/api/v1/loyalty/programs/:id/members/:memberId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Loyalty'], summary: 'Get a loyalty member' },
    },
    async (req, reply) => {
      const { id: _programId, memberId } = z
        .object({
          id: z.string().uuid(),
          memberId: z.string().uuid(),
        })
        .parse(req.params);
      const member = await getMember(req.user!.orgId, memberId);
      if (!member)
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Member not found' });
      return { data: member };
    },
  );

  app.patch(
    '/api/v1/loyalty/programs/:id/members/:memberId/status',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Loyalty'], summary: 'Update member status' },
    },
    async (req) => {
      const { memberId } = z
        .object({ id: z.string().uuid(), memberId: z.string().uuid() })
        .parse(req.params);
      const { status } = z
        .object({ status: z.enum(['active', 'suspended', 'opted_out']) })
        .parse(req.body);
      const member = await updateMemberStatus(req.user!.orgId, memberId, status);
      return { data: member };
    },
  );

  app.post(
    '/api/v1/loyalty/programs/:id/members/:memberId/credit',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Loyalty'], summary: 'Manually credit points to a member' },
    },
    async (req) => {
      const { memberId } = z
        .object({ id: z.string().uuid(), memberId: z.string().uuid() })
        .parse(req.params);
      const body = z
        .object({
          points: z.number().int().min(1),
          description: z.string().optional(),
          type: z.enum(['earn', 'bonus', 'adjust']).default('adjust'),
        })
        .parse(req.body);
      const result = await creditPoints(req.user!.orgId, memberId, body.points, {
        description: body.description,
        type: body.type,
        actorType: 'admin',
        actorId: req.user!.userId,
      });
      return { data: result };
    },
  );
};

export default loyaltyProgramRoutes;
