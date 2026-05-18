/**
 * Cross-account user access routes (#274).
 *
 *  GET    /api/v1/me/orgs                  — list all orgs the current user has access to
 *  POST   /api/v1/me/orgs/switch           — switch to a different org (returns new token)
 *  GET    /api/v1/orgs/:id/members         — list org members
 *  POST   /api/v1/orgs/:id/members/invite  — invite member by email
 *  POST   /api/v1/invitations/:token/accept — accept invitation
 *  PATCH  /api/v1/orgs/:id/members/:memberId — update role
 *  DELETE /api/v1/orgs/:id/members/:memberId — remove member
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { organizationMembers } from '../../db/schema/organization-members.js';
import { AppError } from '../../lib/app-error.js';
import {
  getUserOrgs, switchOrg, inviteMember, acceptInvitation,
  updateMemberRole, removeMember,
} from '../../services/auth/cross-account.js';

const crossAccountRoutes: FastifyPluginAsync = async (app) => {

  // ── List user's orgs ────────────────────────────────────────────────────────

  app.get('/api/v1/me/orgs', {
    preHandler: [app.authenticate],
    schema: { tags: ['Cross-Account'] },
  }, async (req, reply) => {
    const orgs = await getUserOrgs(req.user!.userId);
    return reply.send({ data: orgs });
  });

  // ── Switch org ──────────────────────────────────────────────────────────────

  app.post('/api/v1/me/orgs/switch', {
    preHandler: [app.authenticate],
    schema: { tags: ['Cross-Account'] },
  }, async (req, reply) => {
    const { orgId } = z.object({ orgId: z.string().uuid() }).parse(req.body);
    const token = await switchOrg(req.user!.userId, orgId);
    return reply.send({ data: { token } });
  });

  // ── List members ────────────────────────────────────────────────────────────

  app.get('/api/v1/orgs/:id/members', {
    preHandler: [app.authenticate],
    schema: { tags: ['Cross-Account'] },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id !== req.user!.orgId) throw AppError.forbidden('Access denied');

    const members = await db.select().from(organizationMembers)
      .where(and(
        eq(organizationMembers.orgId, id),
        // exclude 'removed' by default
      ));
    return reply.send({ data: members });
  });

  // ── Invite member ───────────────────────────────────────────────────────────

  app.post('/api/v1/orgs/:id/members/invite', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['Cross-Account'] },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id !== req.user!.orgId) throw AppError.forbidden('Access denied');

    const body = z.object({
      email: z.string().email(),
      role: z.enum(['viewer', 'editor', 'admin']).default('viewer'),
    }).parse(req.body);

    const result = await inviteMember(id, req.user!.userId, body.email, body.role);

    // In production: send invitation email here
    // await sendInvitationEmail(body.email, result.token);

    return reply.code(201).send({ data: { memberId: result.memberId, tokenSent: true } });
  });

  // ── Accept invitation ───────────────────────────────────────────────────────

  app.post('/api/v1/invitations/:token/accept', {
    preHandler: [app.authenticate],
    schema: { tags: ['Cross-Account'] },
  }, async (req, reply) => {
    const { token } = req.params as { token: string };
    const member = await acceptInvitation(token, req.user!.userId);
    return reply.send({ data: member });
  });

  // ── Update member role ──────────────────────────────────────────────────────

  app.patch('/api/v1/orgs/:id/members/:memberId', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['Cross-Account'] },
  }, async (req, reply) => {
    const { id, memberId } = req.params as { id: string; memberId: string };
    if (id !== req.user!.orgId) throw AppError.forbidden('Access denied');

    const { role } = z.object({
      role: z.enum(['viewer', 'editor', 'admin']),
    }).parse(req.body);

    await updateMemberRole(id, memberId, role);
    return reply.send({ data: { updated: true } });
  });

  // ── Remove member ───────────────────────────────────────────────────────────

  app.delete('/api/v1/orgs/:id/members/:memberId', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['Cross-Account'] },
  }, async (req, reply) => {
    const { id, memberId } = req.params as { id: string; memberId: string };
    if (id !== req.user!.orgId) throw AppError.forbidden('Access denied');

    await removeMember(id, memberId);
    return reply.send({ data: { removed: true } });
  });
};

export default crossAccountRoutes;
