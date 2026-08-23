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
import { getThrottleState, resetThrottle } from '@forgemsg/shared/sending/isp-throttle';
import {
  startWarmup,
  listWarmupStatuses,
  advanceWarmupDay,
  claimWarmupCapacity,
} from '../../services/sending/ip-warmup.js';
import { AppError } from '../../lib/app-error.js';
import { db } from '../../db/client.js';
import { warmupIps } from '../../db/schema/index.js';
import { ne } from 'drizzle-orm';
import {
  getContactSendHour,
  getOrgPeakHour,
  getBatchSendHours,
  nextSendWindow,
} from '../../services/sending/send-time-optimization.js';

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

  /**
   * Everything below this point needs a user session.
   *
   * It used to be a plugin-wide preHandler with a list of paths to skip, and a
   * skip-list is only ever as good as the next person to add a route. It had
   * already failed once: /api/v1/internal/* was not on the list, so
   * POST /internal/sending/warmup/advance-all answered 401 to the nightly cron
   * that is its only caller. warmup_day never advanced — a warming IP stayed on
   * day 1, and on 50 sends a day, for as long as it existed. Nothing looked
   * broken, because no allowance was being enforced either.
   *
   * Encapsulation instead of exemptions, the same shape as routes/v1/video.ts:
   * the guard lives in a child context and reaches exactly what is registered
   * inside it. Routes registered outside — fbl-inbound above, which carries its
   * own shared secret, and the internal pair below, which the internal-auth
   * plugin guards — cannot inherit a credential their callers do not hold, and
   * a route added later inherits the context it was written in rather than a
   * list somebody forgot to update.
   */
  await app.register(async (scope) => {
    scope.addHook('preHandler', app.requireAuth);
    /**
     * GET /api/v1/sending/throttle
     * Get current throttle state for all ISPs for this org.
     *
     * Query params: ?ip=1.2.3.4 (sending IP to check, required)
     */
    scope.get(
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
    scope.post(
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
    scope.get(
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
    scope.post(
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
    scope.post(
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

    // ── Send Time Optimization (#STO) ────────────────────────────────────────

    /**
     * GET /api/v1/sending/sto/contact/:contactId
     * Returns the optimal send hour for a single contact based on engagement history.
     */
    scope.get(
      '/api/v1/sending/sto/contact/:contactId',
      {
        preHandler: [app.authenticate],
        schema: { tags: ['Sending'], summary: 'Per-contact send time optimization' },
      },
      async (req) => {
        const { contactId } = req.params as { contactId: string };
        const orgId = req.user!.orgId;
        const sto = await getContactSendHour(orgId, contactId);
        const sendAt = nextSendWindow(sto.peakHour, sto.confidence);
        return { data: { ...sto, sendAt: sendAt.toISOString() } };
      },
    );

    /**
     * GET /api/v1/sending/sto/org
     * Returns the peak engagement hour for the whole org (cached, used as fallback).
     */
    scope.get(
      '/api/v1/sending/sto/org',
      {
        preHandler: [app.authenticate],
        schema: { tags: ['Sending'], summary: 'Org-level peak send hour' },
      },
      async (req) => {
        const orgId = req.user!.orgId;
        const sto = await getOrgPeakHour(orgId);
        const sendAt = nextSendWindow(sto.peakHour, sto.confidence);
        return { data: { ...sto, sendAt: sendAt.toISOString() } };
      },
    );

    /**
     * POST /api/v1/sending/sto/batch
     * Returns optimal send times for a list of contact IDs (up to 1000).
     * Used by campaign splitter to schedule per-contact STO sends.
     */
    scope.post(
      '/api/v1/sending/sto/batch',
      {
        preHandler: [app.authenticate],
        schema: { tags: ['Sending'], summary: 'Batch per-contact send time optimization' },
      },
      async (req) => {
        const { contactIds } = z
          .object({ contactIds: z.array(z.string().uuid()).min(1).max(1000) })
          .parse(req.body);
        const orgId = req.user!.orgId;
        const map = await getBatchSendHours(orgId, contactIds);
        const results = Array.from(map.values()).map((r) => ({
          ...r,
          sendAt: nextSendWindow(r.peakHour, r.confidence).toISOString(),
        }));
        return { data: results };
      },
    );
  });

  /**
   * POST /api/v1/internal/sending/warmup/claim
   *
   * The engine asks here before it dials. It sends the IPs it may bind to and
   * gets back the one it should use, with a unit of that IP's daily allowance
   * already spent — check and increment are one statement, so two concurrent
   * senders cannot both take the last one.
   *
   * The engine could not hold this counter itself. It had one in Redis and the
   * API had another under a different key, which meant the cap would have been
   * double the moment both ran; and Redis here is allkeys-lru, so the key is
   * evictable and a lost counter silently restores full capacity to a cold IP.
   * One counter, in Postgres, reached the same way the engine already reaches
   * /internal/smtp/auth.
   */
  app.post(
    '/api/v1/internal/sending/warmup/claim',
    { schema: { tags: ['Internal'], summary: 'Claim one send of daily warmup capacity' } },
    async (req, reply) => {
      const body = z
        .object({ ips: z.array(z.string().min(1).max(45)).min(1).max(32) })
        .parse(req.body);

      // Prefer a warm IP; among warming ones take the first that still has
      // room. Selection and claim happen together so the answer cannot go
      // stale between deciding and sending.
      let firstKnownRefusal: Awaited<ReturnType<typeof claimWarmupCapacity>> | null = null;
      for (const ip of body.ips) {
        const claim = await claimWarmupCapacity(ip);
        if (claim.allowed) {
          return reply.send({
            data: {
              ip,
              warmupDay: claim.warmupDay,
              sentToday: claim.sentToday,
              dailyLimit: claim.dailyLimit === Infinity ? null : claim.dailyLimit,
              isWarm: claim.isWarm,
              known: claim.known,
            },
          });
        }
        firstKnownRefusal ??= claim;
      }

      // Every configured IP is out of allowance for today. 429 rather than an
      // error: nothing is broken, the capacity comes back at midnight.
      return reply.code(429).send({
        code: 'WARMUP_QUOTA_EXHAUSTED',
        message: 'warmup: all sending IPs have reached their daily limit',
        warmupDay: firstKnownRefusal?.warmupDay ?? null,
        dailyLimit: firstKnownRefusal?.dailyLimit ?? null,
        sentToday: firstKnownRefusal?.sentToday ?? null,
      });
    },
  );

  /**
   * POST /api/v1/internal/sending/warmup/advance-all
   * Advance warmup day for every active warming IP. Called daily by BullMQ cron (#485).
   */
  app.post(
    '/api/v1/internal/sending/warmup/advance-all',
    { schema: { tags: ['Internal'], summary: 'Daily warmup day advancement for all IPs (#485)' } },
    async (_req, reply) => {
      const allWarming = await db
        .select({ ipAddress: warmupIps.ipAddress })
        .from(warmupIps)
        .where(ne(warmupIps.status, 'warm'));

      const results = await Promise.allSettled(
        allWarming.map(async ({ ipAddress }) => {
          const newDay = await advanceWarmupDay(ipAddress);
          return { ipAddress, warmupDay: newDay };
        }),
      );

      const advanced = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - advanced;
      return reply.send({ data: { total: allWarming.length, advanced, failed } });
    },
  );
}
