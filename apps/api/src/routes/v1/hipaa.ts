/**
 * HIPAA compliance routes (#231)
 *
 * GET  /api/v1/hipaa/status
 * POST /api/v1/hipaa/mode/enable
 * POST /api/v1/hipaa/mode/disable
 * GET  /api/v1/hipaa/report
 *
 * GET  /api/v1/hipaa/baa
 * POST /api/v1/hipaa/baa
 * PATCH /api/v1/hipaa/baa/:id
 * DELETE /api/v1/hipaa/baa/:id
 *
 * GET  /api/v1/hipaa/phi-fields
 * POST /api/v1/hipaa/phi-fields
 * DELETE /api/v1/hipaa/phi-fields/:fieldKey
 *
 * GET  /api/v1/hipaa/access-log
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  enableHipaaMode,
  disableHipaaMode,
  isHipaaModeEnabled,
  createBaa,
  updateBaa,
  listBaas,
  deleteBaa,
  setPhiFieldFlag,
  removePhiFieldFlag,
  listPhiFieldFlags,
  listPhiAccessLog,
  getHipaaComplianceReport,
} from '../../services/compliance/hipaa.js';

const hipaaRoutes: FastifyPluginAsync = async (app) => {
  // ── HIPAA mode ──────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/hipaa/status',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['HIPAA'], summary: 'Check if HIPAA mode is enabled' },
    },
    async (req) => {
      return { data: { hipaaMode: await isHipaaModeEnabled(req.user!.orgId) } };
    },
  );

  app.post(
    '/api/v1/hipaa/mode/enable',
    {
      preHandler: [app.authenticate, app.requireRole('owner')],
      schema: { tags: ['HIPAA'], summary: 'Enable HIPAA compliance mode' },
    },
    async (req) => {
      await enableHipaaMode(req.user!.orgId);
      return { data: { hipaaMode: true } };
    },
  );

  app.post(
    '/api/v1/hipaa/mode/disable',
    {
      preHandler: [app.authenticate, app.requireRole('owner')],
      schema: { tags: ['HIPAA'], summary: 'Disable HIPAA compliance mode' },
    },
    async (req) => {
      await disableHipaaMode(req.user!.orgId);
      return { data: { hipaaMode: false } };
    },
  );

  app.get(
    '/api/v1/hipaa/report',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['HIPAA'], summary: 'HIPAA compliance summary report' },
    },
    async (req) => {
      return { data: await getHipaaComplianceReport(req.user!.orgId) };
    },
  );

  // ── BAA management ──────────────────────────────────────────────────────────

  app.get(
    '/api/v1/hipaa/baa',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['HIPAA'], summary: 'List Business Associate Agreements' },
    },
    async (req) => {
      return { data: await listBaas(req.user!.orgId) };
    },
  );

  app.post(
    '/api/v1/hipaa/baa',
    {
      preHandler: [app.authenticate, app.requireRole('owner')],
      schema: { tags: ['HIPAA'], summary: 'Create a BAA record' },
    },
    async (req, reply) => {
      const body = z
        .object({
          baName: z.string().min(1).max(255),
          baEmail: z.string().email().optional(),
          baType: z.string().max(100).optional(),
          documentUrl: z.string().url().optional(),
          effectiveDate: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
          expirationDate: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
          notes: z.string().optional(),
        })
        .parse(req.body);
      const baa = await createBaa(req.user!.orgId, body);
      return reply.status(201).send({ data: baa });
    },
  );

  app.patch(
    '/api/v1/hipaa/baa/:id',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['HIPAA'], summary: 'Update a BAA record' },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          status: z.enum(['pending', 'active', 'expired', 'terminated']).optional(),
          documentUrl: z.string().url().optional(),
          effectiveDate: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
          expirationDate: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
          signedByUserId: z.string().uuid().optional(),
          signedAt: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
          notes: z.string().optional(),
        })
        .parse(req.body);
      return { data: await updateBaa(req.user!.orgId, id, body) };
    },
  );

  app.delete(
    '/api/v1/hipaa/baa/:id',
    {
      preHandler: [app.authenticate, app.requireRole('owner')],
      schema: { tags: ['HIPAA'], summary: 'Delete a BAA record' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteBaa(req.user!.orgId, id);
      return reply.status(204).send();
    },
  );

  // ── PHI field flags ─────────────────────────────────────────────────────────

  app.get(
    '/api/v1/hipaa/phi-fields',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['HIPAA'], summary: 'List PHI-tagged custom fields' },
    },
    async (req) => {
      return { data: await listPhiFieldFlags(req.user!.orgId) };
    },
  );

  app.post(
    '/api/v1/hipaa/phi-fields',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['HIPAA'], summary: 'Tag a custom field as containing PHI' },
    },
    async (req, reply) => {
      const body = z
        .object({
          fieldKey: z.string().min(1).max(255),
          phiCategory: z.string().max(100).default('other'),
          encryptAtRest: z.boolean().default(false),
          redactInLogs: z.boolean().default(true),
        })
        .parse(req.body);
      const flag = await setPhiFieldFlag(req.user!.orgId, req.user!.userId, body);
      return reply.status(201).send({ data: flag });
    },
  );

  app.delete(
    '/api/v1/hipaa/phi-fields/:fieldKey',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['HIPAA'], summary: 'Remove PHI tag from a custom field' },
    },
    async (req, reply) => {
      const { fieldKey } = z.object({ fieldKey: z.string().min(1) }).parse(req.params);
      await removePhiFieldFlag(req.user!.orgId, fieldKey);
      return reply.status(204).send();
    },
  );

  // ── Access log ──────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/hipaa/access-log',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['HIPAA'], summary: 'HIPAA PHI access log' },
    },
    async (req) => {
      const q = z
        .object({
          limit: z.coerce.number().int().min(1).max(200).default(50),
          cursor: z.string().optional(),
          userId: z.string().uuid().optional(),
          resource: z.string().optional(),
        })
        .parse(req.query);
      return listPhiAccessLog(req.user!.orgId, q);
    },
  );
};

export default hipaaRoutes;
