/**
 * Deliverability routes (#397, #354, #372).
 *
 *   POST /api/v1/deliverability/graymail/sweep        — trigger a sweep now
 *   GET  /api/v1/deliverability/health-score          — org composite health
 *   GET  /api/v1/deliverability/reputation            — sender reputation (SenderScore + Google + SNDS + Seznam)
 *   GET  /api/v1/deliverability/reputation/:provider  — single-provider reputation
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sweepOrg } from '../../services/deliverability/graymail.js';
import { computeOrgHealth } from '../../services/deliverability/health-score.js';
import {
  fetchAllReputation,
  fetchSenderScore,
  fetchGooglePostmaster,
  fetchMicrosoftSNDS,
  fetchSeznamPostmaster,
} from '../../services/deliverability/reputation.js';

const deliverabilityRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/deliverability/graymail/sweep',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Deliverability'], summary: 'Run a graymail classification sweep now' },
    },
    async (req) => {
      const result = await sweepOrg(req.user!.orgId);
      return { data: result };
    },
  );

  app.get(
    '/api/v1/deliverability/health-score',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Deliverability'], summary: 'Composite email-health score for this org' },
    },
    async (req) => {
      const query = z
        .object({
          days: z.coerce.number().int().min(1).max(365).optional(),
          domain: z.string().min(1).max(255).optional(),
          ip: z.string().min(3).max(45).optional(),
        })
        .parse(req.query);

      const result = await computeOrgHealth({
        orgId: req.user!.orgId,
        ...(query.days != null ? { days: query.days } : {}),
        ...(query.domain ? { domain: query.domain } : {}),
        ...(query.ip ? { ip: query.ip } : {}),
      });
      return { data: result };
    },
  );
  // ── Sender reputation (#354, #372) ───────────────────────────────────────

  const domainQuery = z.object({
    domain: z.string().min(1).max(255),
  });

  // Aggregate reputation from all providers
  app.get(
    '/api/v1/deliverability/reputation',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Deliverability'], summary: 'Aggregated sender reputation across all ISPs' },
    },
    async (req, reply) => {
      const { domain } = domainQuery.parse(req.query);
      const result = await fetchAllReputation(domain);
      return reply.send({ data: result });
    },
  );

  // Single-provider lookup
  app.get(
    '/api/v1/deliverability/reputation/:provider',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Deliverability'], summary: 'Reputation from a specific provider' },
    },
    async (req, reply) => {
      const { provider } = z
        .object({ provider: z.enum(['senderscore', 'google_postmaster', 'microsoft_snds', 'seznam_postmaster']) })
        .parse(req.params);
      const { domain } = domainQuery.parse(req.query);

      let result;
      switch (provider) {
        case 'senderscore':
          result = await fetchSenderScore(domain);
          break;
        case 'google_postmaster':
          result = await fetchGooglePostmaster(domain);
          break;
        case 'microsoft_snds':
          result = await fetchMicrosoftSNDS(domain);
          break;
        case 'seznam_postmaster':
          result = await fetchSeznamPostmaster(domain);
          break;
      }
      return reply.send({ data: result });
    },
  );
};

export default deliverabilityRoutes;
