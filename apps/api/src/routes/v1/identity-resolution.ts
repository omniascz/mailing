/**
 * Identity Resolution L2-L3 routes (§9 P1).
 *
 *   POST /api/v1/identity/resolve-transitive  — closure walk
 *   GET  /api/v1/identity/conflicts           — high-conflict signals
 *   POST /api/v1/identity/probabilistic-match — fingerprint candidates
 *   POST /api/v1/identity/fingerprint         — record fingerprint
 *
 * All auth-gated except where the upstream snippet route already accepts
 * unauthenticated POSTs; fingerprint capture for unknown visitors happens
 * inside the existing /t/pv pipeline (see Sprint H.5 follow-up wiring).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  detectConflicts,
  recordVisitorFingerprint,
  resolveTransitively,
  suggestProbabilisticMatches,
} from '../../services/identity-resolution/index.js';
import { buildFingerprint } from '../../services/identity-resolution/pure.js';

const identityResolutionRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/identity/resolve-transitive',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Identity'],
        summary: 'Walk the identity graph from a root contact (L2 transitive closure)',
      },
    },
    async (req, reply) => {
      const body = z
        .object({
          contactId: z.string().uuid(),
          maxHops: z.number().int().min(1).max(10).optional(),
        })
        .parse(req.body);
      const result = await resolveTransitively(req.user!.orgId, body.contactId, body.maxHops);
      return reply.send({ data: result });
    },
  );

  app.get(
    '/api/v1/identity/conflicts',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Identity'],
        summary: 'List high-conflict signals (shared NAT, devices, etc.)',
      },
    },
    async (req, reply) => {
      const q = z
        .object({
          minDistinct: z.coerce.number().int().min(2).max(100).optional(),
          limit: z.coerce.number().int().min(1).max(500).optional(),
        })
        .parse(req.query);
      const data = await detectConflicts(req.user!.orgId, q.minDistinct, q.limit);
      return reply.send({ data });
    },
  );

  app.post(
    '/api/v1/identity/probabilistic-match',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Identity'],
        summary: 'Find anonymous_profiles matching a fingerprint (L3)',
      },
    },
    async (req, reply) => {
      const body = z
        .object({
          ip: z.string().max(64).optional(),
          userAgent: z.string().max(1024).optional(),
          acceptLanguage: z.string().max(256).optional(),
          width: z.number().int().min(100).max(8000).optional(),
          height: z.number().int().min(100).max(8000).optional(),
          dpr: z.number().min(0.5).max(5).optional(),
          sinceDays: z.number().int().min(1).max(90).optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .parse(req.body);
      const fp = buildFingerprint(body);
      const candidates = await suggestProbabilisticMatches(
        req.user!.orgId,
        fp,
        body.sinceDays,
        body.limit,
      );
      return reply.send({ data: { fingerprint: fp, candidates } });
    },
  );

  app.post(
    '/api/v1/identity/fingerprint',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Identity'],
        summary: 'Persist a non-PII fingerprint onto an anonymous profile',
      },
    },
    async (req, reply) => {
      const body = z
        .object({
          visitorId: z.string().min(1).max(128),
          ip: z.string().max(64).optional(),
          userAgent: z.string().max(1024).optional(),
          acceptLanguage: z.string().max(256).optional(),
          width: z.number().int().min(100).max(8000).optional(),
          height: z.number().int().min(100).max(8000).optional(),
          dpr: z.number().min(0.5).max(5).optional(),
        })
        .parse(req.body);
      const fp = buildFingerprint(body);
      await recordVisitorFingerprint(req.user!.orgId, body.visitorId, fp);
      return reply.send({ data: { fingerprint: fp } });
    },
  );
};

export default identityResolutionRoutes;
