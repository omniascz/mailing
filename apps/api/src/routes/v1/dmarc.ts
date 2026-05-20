/**
 * DMARC Digest routes (#233)
 *
 *  POST /t/dmarc/report            — receive DMARC aggregate XML (public, called by ISP)
 *  GET  /api/v1/dmarc/reports      — list parsed reports (authenticated)
 *  GET  /api/v1/dmarc/summary      — aggregate stats for a domain (authenticated)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  receiveDmarcReport,
  listDmarcReports,
  getDmarcSummary,
} from '../../services/deliverability/dmarc-digest.js';

const dmarcRoutes: FastifyPluginAsync = async (app) => {
  // ── Public inbound webhook (ISPs POST aggregate XML reports here) ─────────────
  // Secured by X-DMARC-Secret header matching env var DMARC_INBOUND_SECRET

  app.post(
    '/t/dmarc/report',
    {
      schema: { tags: ['DMARC'], summary: 'Receive DMARC aggregate report (called by ISP)' },
    },
    async (req, reply) => {
      const secret = process.env.DMARC_INBOUND_SECRET;
      if (secret && req.headers['x-dmarc-secret'] !== secret) {
        return reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Invalid secret' });
      }

      const body = z
        .object({
          orgId: z.string().uuid(),
          xml: z.string().min(1),
        })
        .parse(req.body);

      await receiveDmarcReport(body.orgId, body.xml);
      return reply.status(202).send({ ok: true });
    },
  );

  // ── Authenticated dashboard endpoints ─────────────────────────────────────────

  app.get(
    '/api/v1/dmarc/reports',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['DMARC'], summary: 'List DMARC aggregate reports' },
    },
    async (req) => {
      const q = z
        .object({
          domain: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(30),
          cursor: z.string().optional(),
        })
        .parse(req.query);
      return listDmarcReports(req.user!.orgId, q);
    },
  );

  app.get(
    '/api/v1/dmarc/summary',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['DMARC'], summary: 'DMARC pass/fail summary for a domain' },
    },
    async (req) => {
      const { domain, days } = z
        .object({
          domain: z.string().min(1),
          days: z.coerce.number().int().min(1).max(365).default(30),
        })
        .parse(req.query);
      return { data: await getDmarcSummary(req.user!.orgId, domain, days) };
    },
  );
};

export default dmarcRoutes;
