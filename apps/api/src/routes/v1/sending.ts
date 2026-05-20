/**
 * Email sending engine management routes:
 *  - POST /api/v1/sending/fbl-inbound       — receive FBL/ARF complaint emails (internal webhook)
 *  - GET  /api/v1/sending/throttle           — get throttle state for org's ISPs
 *  - POST /api/v1/sending/throttle/reset     — reset throttle counters (admin)
 *  - GET  /api/v1/sending/warmup             — list IP warmup statuses for org
 *  - POST /api/v1/sending/warmup             — start warmup for a new IP
 *  - POST /api/v1/sending/warmup/advance     — manually advance warmup day (admin/cron)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseArfReport, processFblComplaint } from '../../services/sending/fbl-processor.js';
import { getThrottleState, resetThrottle } from '../../services/sending/isp-throttle.js';
import {
  startWarmup,
  listWarmupStatuses,
  advanceWarmupDay,
} from '../../services/sending/ip-warmup.js';
import { AppError } from '../../lib/app-error.js';

const ISP_NAMES = ['gmail', 'microsoft', 'yahoo', 'other'] as const;

export default async function sendingRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/sending/fbl-inbound
   * Inbound webhook for FBL / ARF complaint emails from ISPs.
   *
   * Expects: raw email body as text (Content-Type: text/plain or message/rfc822)
   * Auth: shared secret via X-FBL-Secret header (not JWT — ISPs post to this)
   *
   * Body: { raw: string, orgId: string, campaignId?: string }
   * Returns: { data: FblProcessResult }
   */
  app.post(
    '/api/v1/sending/fbl-inbound',
    { schema: { tags: ['Sending'], summary: 'Process FBL/ARF complaint email' } },
    async (req, reply) => {
      // Simple shared-secret auth for webhook
      const secret = req.headers['x-fbl-secret'];
      const expectedSecret = process.env.FBL_WEBHOOK_SECRET;
      if (!expectedSecret) {
        throw AppError.internal('FBL_WEBHOOK_SECRET not configured');
      }
      if (secret !== expectedSecret) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const { raw, orgId, campaignId } = z
        .object({
          raw: z.string().min(10).max(500_000),
          orgId: z.string().uuid(),
          campaignId: z.string().uuid().optional(),
        })
        .parse(req.body);

      const report = parseArfReport(raw);
      const result = await processFblComplaint(report, orgId, campaignId);

      return { data: result };
    },
  );

  // ─── Auth-required routes below ─────────────────────────────────────────────
  app.addHook('preHandler', async (req) => {
    // Skip auth for fbl-inbound (handled above with shared secret)
    if (req.routeOptions?.url === '/api/v1/sending/fbl-inbound') return;
    await app.requireAuth(req);
  });

  /**
   * GET /api/v1/sending/throttle
   * Get current throttle state for all ISPs for this org.
   *
   * Query params: ?ip=1.2.3.4 (sending IP to check, required)
   */
  app.get(
    '/api/v1/sending/throttle',
    { schema: { tags: ['Sending'], summary: 'Get ISP throttle state' } },
    async (req) => {
      const { ip } = z.object({ ip: z.string().min(7).max(45) }).parse(req.query);

      const states = await Promise.all(
        ISP_NAMES.map((isp) => getThrottleState(req.user!.orgId, isp, ip)),
      );

      return { data: states };
    },
  );

  /**
   * POST /api/v1/sending/throttle/reset
   * Reset throttle counters for a specific ISP + IP (admin action, e.g. after IP change).
   *
   * Body: { ip: string, isp?: string }
   */
  app.post(
    '/api/v1/sending/throttle/reset',
    { schema: { tags: ['Sending'], summary: 'Reset ISP throttle counters' } },
    async (req) => {
      const { ip, isp } = z
        .object({
          ip: z.string().min(7).max(45),
          isp: z.enum(ISP_NAMES).optional(),
        })
        .parse(req.body);

      const ispsToReset = isp ? [isp] : [...ISP_NAMES];
      await Promise.all(ispsToReset.map((i) => resetThrottle(req.user!.orgId, i, ip)));

      return { data: { reset: ispsToReset, ip } };
    },
  );

  /**
   * GET /api/v1/sending/warmup
   * List warmup status for all IPs registered for this org.
   */
  app.get(
    '/api/v1/sending/warmup',
    { schema: { tags: ['Sending'], summary: 'List IP warmup statuses' } },
    async (req) => {
      const statuses = await listWarmupStatuses(req.user!.orgId);
      return { data: statuses };
    },
  );

  /**
   * POST /api/v1/sending/warmup
   * Start warmup tracking for a new sending IP.
   *
   * Body: { ip: string }
   */
  app.post(
    '/api/v1/sending/warmup',
    { schema: { tags: ['Sending'], summary: 'Start IP warmup' } },
    async (req, reply) => {
      const { ip } = z.object({ ip: z.string().min(7).max(45) }).parse(req.body);

      await startWarmup(ip, req.user!.orgId);
      return reply.code(201).send({ data: { ip, status: 'warming', warmupDay: 1 } });
    },
  );

  /**
   * POST /api/v1/sending/warmup/advance
   * Advance warmup day for an IP. Called by the daily cron job (or manually by admin).
   *
   * Body: { ip: string }
   */
  app.post(
    '/api/v1/sending/warmup/advance',
    { schema: { tags: ['Sending'], summary: 'Advance IP warmup day' } },
    async (req) => {
      const { ip } = z.object({ ip: z.string().min(7).max(45) }).parse(req.body);
      const newDay = await advanceWarmupDay(ip);
      if (newDay === null) {
        throw AppError.badRequest('IP not found in warmup schedule or already fully warm');
      }
      return { data: { ip, warmupDay: newDay } };
    },
  );
}
