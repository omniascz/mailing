/**
 * Internal status page endpoints (Sprint H.5).
 *
 * Lets monitoring tools (Sentry alert action, /health/ready probe, BullMQ
 * queue depth watcher) push an incident to status.mailforge.io without
 * each tool having to speak Instatus directly. The orchestrator in
 * `services/status-page/index.ts` handles dedup, severity, and component
 * routing.
 *
 * Endpoints (all unauthenticated — must sit behind network boundary or
 * shared-secret header in production):
 *
 *   POST /api/v1/internal/status-page/incident
 *     body: { kind, region?, summary?, metrics? }
 *     → opens or updates an incident
 *
 *   POST /api/v1/internal/status-page/resolve
 *     body: { kind, region?, postmortemUrl? }
 *     → resolves a matching open incident if any
 *
 *   GET  /api/v1/internal/status-page/open
 *     → lists open Instatus incidents (debug)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { listOpen, reportIncident, resolveByDedup } from '../../../services/status-page/index.js';

const SIGNAL_KINDS = [
  'db_down',
  'redis_down',
  'queue_backlog',
  'high_bounce_rate',
  'high_complaint_rate',
  'engine_unreachable',
  'webhook_failures',
  'auth_outage',
  'tracking_pixel_down',
  'sms_provider_outage',
] as const;

const incidentBody = z.object({
  kind: z.enum(SIGNAL_KINDS),
  region: z.string().max(64).optional(),
  summary: z.string().max(200).optional(),
  metrics: z.record(z.unknown()).optional(),
});

const resolveBody = z.object({
  kind: z.enum(SIGNAL_KINDS),
  region: z.string().max(64).optional(),
  postmortemUrl: z.string().url().max(2048).optional(),
});

const statusPageInternalRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/status-page/incident',
    {
      schema: {
        tags: ['Internal', 'StatusPage'],
        summary: 'Open or update a status-page incident',
      },
    },
    async (req, reply) => {
      const parsed = incidentBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.message });
      }
      const result = await reportIncident(parsed.data.kind, {
        region: parsed.data.region,
        summary: parsed.data.summary,
        metrics: parsed.data.metrics as Record<string, string | number> | undefined,
      });
      // 200 in all success paths — distinguishing "noop because no API
      // key" from "actually pushed" via the response body keeps the
      // monitoring tool's retry logic simple.
      return reply.code(200).send(result);
    },
  );

  app.post(
    '/api/v1/internal/status-page/resolve',
    {
      schema: {
        tags: ['Internal', 'StatusPage'],
        summary: 'Resolve a matching open incident',
      },
    },
    async (req, reply) => {
      const parsed = resolveBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.message });
      }
      const result = await resolveByDedup(
        parsed.data.kind,
        { region: parsed.data.region },
        parsed.data.postmortemUrl,
      );
      return reply.code(200).send(result);
    },
  );

  app.get(
    '/api/v1/internal/status-page/open',
    {
      schema: {
        tags: ['Internal', 'StatusPage'],
        summary: 'List open Instatus incidents',
      },
    },
    async () => {
      const open = await listOpen();
      return { data: open };
    },
  );
};

export default statusPageInternalRoutes;
