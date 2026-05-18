/**
 * Dedicated IP + IP pool management routes.
 *
 *  IP Pools:
 *   - GET    /api/v1/ip-pools                    — list pools
 *   - POST   /api/v1/ip-pools                    — create pool
 *   - GET    /api/v1/ip-pools/:id                — get pool
 *   - PUT    /api/v1/ip-pools/:id                — update pool
 *   - DELETE /api/v1/ip-pools/:id                — soft-delete pool
 *
 *  Dedicated IPs:
 *   - GET    /api/v1/dedicated-ips               — list assigned IPs
 *   - POST   /api/v1/dedicated-ips               — allocate a new dedicated IP (owner/admin)
 *   - GET    /api/v1/dedicated-ips/:id           — get IP detail
 *   - PUT    /api/v1/dedicated-ips/:id/pool      — reassign to a different pool
 *   - PUT    /api/v1/dedicated-ips/:id/status    — change status (suspend / retire)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createIpPool,
  listIpPools,
  getIpPool,
  updateIpPool,
  deleteIpPool,
  allocateDedicatedIp,
  listDedicatedIps,
  getDedicatedIp,
  assignIpToPool,
  updateIpStatus,
} from '../../services/dedicated-ips/index.js';

const idParam = z.object({ id: z.string().uuid() });

const poolCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  type: z
    .enum(['marketing', 'transactional', 'cold_outreach', 'warming', 'shared', 'dedicated'])
    .optional(),
  isDefault: z.boolean().optional(),
  allowedCampaignTypes: z.string().max(255).optional(),
  perIpDailyLimit: z.number().int().min(0).optional(),
});

const poolUpdateSchema = poolCreateSchema.partial();

const ipAllocateSchema = z.object({
  poolId: z.string().uuid().optional(),
  ipAddress: z
    .string()
    .regex(
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:\.|$)){4}|^[0-9a-fA-F:]+$/,
      'Invalid IPv4 or IPv6',
    )
    .optional(),
  ptrRecord: z.string().max(253).optional(),
  region: z.string().max(20).optional(),
  startWarmup: z.boolean().optional(),
});

const routes: FastifyPluginAsync = async (app) => {
  // ─── IP Pools ───────────────────────────────────────────────────────────────
  app.get(
    '/api/v1/ip-pools',
    { preHandler: [app.authenticate], schema: { tags: ['IP Pools'] } },
    async (req) => ({ data: await listIpPools(req.user!.orgId) }),
  );

  app.post(
    '/api/v1/ip-pools',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['IP Pools'] },
    },
    async (req, reply) => {
      const body = poolCreateSchema.parse(req.body);
      const data = await createIpPool(req.user!.orgId, body);
      return reply.code(201).send({ data });
    },
  );

  app.get(
    '/api/v1/ip-pools/:id',
    { preHandler: [app.authenticate], schema: { tags: ['IP Pools'] } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await getIpPool(req.user!.orgId, id) };
    },
  );

  app.put(
    '/api/v1/ip-pools/:id',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['IP Pools'] },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const patch = poolUpdateSchema.parse(req.body);
      return { data: await updateIpPool(req.user!.orgId, id, patch) };
    },
  );

  app.delete(
    '/api/v1/ip-pools/:id',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['IP Pools'] },
    },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await deleteIpPool(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // ─── Dedicated IPs ──────────────────────────────────────────────────────────
  app.get(
    '/api/v1/dedicated-ips',
    { preHandler: [app.authenticate], schema: { tags: ['Dedicated IPs'] } },
    async (req) => {
      const q = z
        .object({
          poolId: z.string().uuid().optional(),
          status: z.string().optional(),
        })
        .parse(req.query);
      return { data: await listDedicatedIps(req.user!.orgId, q) };
    },
  );

  app.post(
    '/api/v1/dedicated-ips',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['Dedicated IPs'] },
    },
    async (req, reply) => {
      const body = ipAllocateSchema.parse(req.body);
      const data = await allocateDedicatedIp({ ...body, orgId: req.user!.orgId });
      return reply.code(201).send({ data });
    },
  );

  app.get(
    '/api/v1/dedicated-ips/:id',
    { preHandler: [app.authenticate], schema: { tags: ['Dedicated IPs'] } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await getDedicatedIp(req.user!.orgId, id) };
    },
  );

  app.put(
    '/api/v1/dedicated-ips/:id/pool',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['Dedicated IPs'] },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const { poolId } = z.object({ poolId: z.string().uuid().nullable() }).parse(req.body);
      return { data: await assignIpToPool(req.user!.orgId, id, poolId) };
    },
  );

  app.put(
    '/api/v1/dedicated-ips/:id/status',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['Dedicated IPs'] },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const { status, notes } = z
        .object({
          status: z.enum(['active', 'warming', 'warm', 'suspended', 'retired']),
          notes: z.string().max(2000).optional(),
        })
        .parse(req.body);
      return { data: await updateIpStatus(req.user!.orgId, id, status, notes) };
    },
  );
};

export default routes;
