/**
 * Campaign management routes:
 *  - GET    /api/v1/campaigns               — list campaigns (cursor pagination)
 *  - POST   /api/v1/campaigns               — create draft campaign
 *  - GET    /api/v1/campaigns/:id            — get campaign detail
 *  - PUT    /api/v1/campaigns/:id            — update draft campaign
 *  - DELETE /api/v1/campaigns/:id            — soft delete
 *  - POST   /api/v1/campaigns/:id/schedule   — schedule for future send
 *  - POST   /api/v1/campaigns/:id/send       — send immediately
 *  - POST   /api/v1/campaigns/:id/pause      — pause sending
 *  - POST   /api/v1/campaigns/:id/resume     — resume paused campaign
 *  - POST   /api/v1/campaigns/:id/cancel     — cancel scheduled/paused campaign
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/index.js';
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
  deleteCampaign,
  scheduleCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
} from '../../services/campaigns/index.js';
import { scheduleResend } from '../../services/campaigns/auto-resend.js';
import {
  enqueueCampaignSend,
  dispatchScheduledCampaigns,
  setCampaignStatusInternal,
} from '../../services/campaigns/dispatch.js';
import {
  computeAbWinner,
  getAbTestResult,
  getHoldbackPage,
  markWinnerDispatched,
  storeHoldback,
} from '../../services/campaigns/ab-winner.js';
import { sendTransactionalEmail } from '../../lib/queues.js';
import { checkSendCapacity } from '../../services/billing/plan-enforcement.js';
import { AppError } from '../../lib/app-error.js';
import { assertCampaignPurpose } from '../../services/gdpr/campaign-purpose-check.js';

const idParam = z.object({ id: z.string().uuid() });

const campaignStatuses = ['draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled'] as const;
const campaignTypes = ['email', 'sms', 'whatsapp', 'push', 'voice'] as const;

const createSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(campaignTypes).optional(),
  subject: z.string().max(255).optional(),
  preheader: z.string().max(255).optional(),
  fromName: z.string().max(100).optional(),
  fromEmail: z.string().email().optional(),
  replyTo: z.string().email().optional(),
  templateId: z.string().uuid().optional(),
  content: z.record(z.unknown()).optional(),
  listId: z.string().uuid().optional(),
  segmentId: z.string().uuid().optional(),
  excludeSegmentId: z.string().uuid().optional(),
  abConfig: z.record(z.unknown()).optional(),
  configurationSet: z.string().max(128).optional(),
  category: z.string().max(128).optional(),
  scheduledAt: z.string().datetime().optional(),
  timezone: z.string().max(100).optional(),
});

const updateSchema = createSchema.partial();

const listQuerySchema = z.object({
  status: z.enum(campaignStatuses).optional(),
  cursor: z.string().uuid().optional(),
  limit: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(100))
    .optional(),
});

export default async function campaignRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * GET /api/v1/campaigns
   * List campaigns for this org. Supports cursor pagination and status filter.
   *
   * Query: ?status=draft&cursor=<uuid>&limit=50
   */
  app.get(
    '/api/v1/campaigns',
    { schema: { tags: ['Campaigns'], summary: 'List campaigns' } },
    async (req) => {
      const query = listQuerySchema.parse(req.query);
      const result = await listCampaigns({
        orgId: req.user!.orgId,
        status: query.status,
        cursor: query.cursor,
        limit: query.limit,
      });
      return result;
    },
  );

  /**
   * POST /api/v1/campaigns
   * Create a new draft campaign.
   */
  app.post(
    '/api/v1/campaigns',
    { schema: { tags: ['Campaigns'], summary: 'Create campaign' } },
    async (req, reply) => {
      const body = createSchema.parse(req.body);
      const campaign = await createCampaign({
        ...body,
        orgId: req.user!.orgId,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      });
      return reply.code(201).send({ data: campaign });
    },
  );

  /**
   * GET /api/v1/campaigns/:id
   * Get a single campaign.
   */
  app.get(
    '/api/v1/campaigns/:id',
    { schema: { tags: ['Campaigns'], summary: 'Get campaign' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const campaign = await getCampaign(req.user!.orgId, id);
      return { data: campaign };
    },
  );

  /**
   * PUT /api/v1/campaigns/:id
   * Update a draft campaign.
   */
  app.put(
    '/api/v1/campaigns/:id',
    { schema: { tags: ['Campaigns'], summary: 'Update campaign' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const body = updateSchema.parse(req.body);
      const campaign = await updateCampaign(req.user!.orgId, id, {
        ...body,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      });
      return { data: campaign };
    },
  );

  /**
   * DELETE /api/v1/campaigns/:id
   * Soft delete a campaign (cannot delete while sending).
   */
  app.delete(
    '/api/v1/campaigns/:id',
    { schema: { tags: ['Campaigns'], summary: 'Delete campaign' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await deleteCampaign(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  /**
   * POST /api/v1/campaigns/:id/schedule
   * Schedule a campaign for future sending.
   *
   * Body: { scheduledAt: "2024-01-15T10:00:00Z", timezone?: "Europe/Prague" }
   */
  app.post(
    '/api/v1/campaigns/:id/schedule',
    { schema: { tags: ['Campaigns'], summary: 'Schedule campaign' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const { scheduledAt, timezone } = z
        .object({
          scheduledAt: z.string().datetime(),
          timezone: z.string().max(100).optional(),
        })
        .parse(req.body);

      const campaign = await scheduleCampaign(req.user!.orgId, id, new Date(scheduledAt), timezone);
      return { data: campaign };
    },
  );

  /**
   * POST /api/v1/campaigns/:id/send
   * Send a campaign immediately.
   *
   * This triggers the queue pipeline:
   *   campaign-splitter → batch-sender → mta-{isp}
   */
  app.post(
    '/api/v1/campaigns/:id/send',
    { schema: { tags: ['Campaigns'], summary: 'Send campaign immediately' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      // Plan + suspended check before flipping status. We don't know the
      // exact recipient count yet (splitter resolves audience), so pass
      // adding=1 as a sentinel — checkSendCapacity blocks when monthly
      // cap is already reached. Real metered overage is enforced by the
      // splitter later.
      await checkSendCapacity(req.user!.orgId, 1);

      // GDPR: if the org enforces processing purposes, the campaign must name
      // one. Rejected here so an operator sees it, rather than surfacing as a
      // blocked batch inside the worker where nobody is watching.
      await assertCampaignPurpose(req.user!.orgId, id);

      // Transition → sending + enqueue splitter (A/B, UTM, DKIM forwarded).
      // Same code path the scheduled-campaign cron uses.
      const campaign = await enqueueCampaignSend(req.user!.orgId, id);

      return { data: campaign };
    },
  );

  /**
   * POST /api/v1/campaigns/:id/pause
   * Pause a sending campaign.
   */
  app.post(
    '/api/v1/campaigns/:id/pause',
    { schema: { tags: ['Campaigns'], summary: 'Pause campaign' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const campaign = await pauseCampaign(req.user!.orgId, id);
      return { data: campaign };
    },
  );

  /**
   * POST /api/v1/campaigns/:id/resume
   * Resume a paused campaign.
   */
  app.post(
    '/api/v1/campaigns/:id/resume',
    { schema: { tags: ['Campaigns'], summary: 'Resume campaign' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const campaign = await resumeCampaign(req.user!.orgId, id);
      return { data: campaign };
    },
  );

  /**
   * POST /api/v1/campaigns/:id/cancel
   * Cancel a scheduled or paused campaign.
   */
  app.post(
    '/api/v1/campaigns/:id/cancel',
    { schema: { tags: ['Campaigns'], summary: 'Cancel campaign' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const campaign = await cancelCampaign(req.user!.orgId, id);
      return { data: campaign };
    },
  );

  /**
   * POST /api/v1/campaigns/:id/schedule-resend
   * Schedule a resend of this campaign to contacts who didn't open it.
   * Body: { delayHours, newSubject?, newPreheader?, includeBots? }
   * Returns the newly-created child campaign in 'scheduled' status.
   */
  app.post(
    '/api/v1/campaigns/:id/schedule-resend',
    { schema: { tags: ['Campaigns'], summary: 'Schedule resend to non-openers' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          delayHours: z.number().int().min(1).max(168),
          newSubject: z.string().max(255).optional(),
          newPreheader: z.string().max(255).optional(),
          includeBots: z.boolean().optional(),
        })
        .parse(req.body);
      const child = await scheduleResend(req.user!.orgId, id, body);
      return reply.code(201).send({ data: child });
    },
  );

  /**
   * POST /api/v1/campaigns/:id/test
   * Send a one-off test of this campaign's current content to a specific
   * email address. Lets marketers preview rendering + merge tags before
   * committing to the broadcast.
   *
   * Logs a `send` event in email_events with `test: true` for audit,
   * then enqueues a transactional job to the MTA pipeline. The actual
   * SMTP delivery happens asynchronously via the Go MTA worker.
   *
   * Body: { to: email }
   */
  app.post(
    '/api/v1/campaigns/:id/test',
    { schema: { tags: ['Campaigns'], summary: 'Send a test of this campaign' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const { to } = z.object({ to: z.string().email() }).parse(req.body);

      const campaign = await getCampaign(req.user!.orgId, id);
      const content = (campaign.content ?? {}) as { html?: string; plainText?: string };
      if (!content.html && !content.plainText) {
        throw AppError.badRequest('Campaign has no content to test — add HTML or plain text first');
      }
      if (!campaign.subject) {
        throw AppError.badRequest('Campaign has no subject — set one before sending a test');
      }

      const messageId = `<test-${randomUUID()}@forgemsg>`;
      await db.insert(emailEvents).values({
        orgId: req.user!.orgId,
        eventType: 'send',
        messageId,
        campaignId: campaign.id,
        metadata: {
          to,
          test: true,
          subject: campaign.subject,
          fromEmail: campaign.fromEmail,
          fromName: campaign.fromName,
        },
      });

      // Enqueue the actual delivery. mta-other worker dispatches via gRPC
      // to Go MTA. If MTA is unreachable we still recorded the audit row
      // above, so monitoring catches "test send requested but never sent".
      try {
        await sendTransactionalEmail({
          to,
          from: campaign.fromEmail ?? `no-reply@${process.env.DOI_FROM_DOMAIN ?? 'example.com'}`,
          fromName: campaign.fromName ?? undefined,
          replyTo: campaign.replyTo ?? undefined,
          subject: `[TEST] ${campaign.subject}`,
          html: content.html ?? '',
          text: content.plainText ?? undefined,
          orgId: req.user!.orgId,
        });
      } catch (err) {
        req.log.error({ err, event: 'campaign_test_enqueue_failed', campaignId: id, to });
        // Don't fail the response — audit row exists, retry from UI is fine.
      }

      return reply.code(202).send({ data: { messageId, to, status: 'queued' } });
    },
  );

  // ── A/B winner endpoints ──────────────────────────────────────────────────

  /**
   * GET /api/v1/campaigns/:id/ab-result
   * Returns the stored A/B test result (winner, confidence, rankings) for a campaign.
   */
  app.get(
    '/api/v1/campaigns/:id/ab-result',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Campaigns'], summary: 'Get A/B test result for a campaign' },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const result = await getAbTestResult(req.user!.orgId, id);
      return { data: result };
    },
  );

  // ── Internal endpoints (called by ab-winner BullMQ worker) ───────────────

  /**
   * POST /api/v1/internal/campaigns/:id/ab-winner-compute
   * Computes the winning variant and stores the result. Idempotent.
   * Protected by x-internal-secret header.
   */
  app.post(
    '/api/v1/internal/campaigns/:id/ab-winner-compute',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const secret = req.headers['x-internal-secret'];
      if (secret !== process.env.INTERNAL_SECRET) return reply.status(401).send();
      const { id } = idParam.parse(req.params);
      const { orgId } = z.object({ orgId: z.string().uuid() }).parse(req.body);
      const result = await computeAbWinner(orgId, id);
      return { data: result };
    },
  );

  /**
   * GET /api/v1/internal/campaigns/:id/ab-holdback
   * Paginated list of holdback contact IDs for dispatching winner.
   * Protected by x-internal-secret header.
   */
  app.get(
    '/api/v1/internal/campaigns/:id/ab-holdback',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const secret = req.headers['x-internal-secret'];
      if (secret !== process.env.INTERNAL_SECRET) return reply.status(401).send();
      const { id } = idParam.parse(req.params);
      const q = z
        .object({
          limit: z.coerce.number().int().min(1).max(5000).default(1000),
          cursor: z.string().uuid().optional(),
        })
        .parse(req.query);
      const page = await getHoldbackPage(id, q.limit, q.cursor);
      return { data: page };
    },
  );

  /**
   * POST /api/v1/internal/campaigns/:id/ab-holdback
   * Bulk-store holdback contacts (called by campaign-splitter after enqueuing variants).
   */
  app.post(
    '/api/v1/internal/campaigns/:id/ab-holdback',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const secret = req.headers['x-internal-secret'];
      if (secret !== process.env.INTERNAL_SECRET) return reply.status(401).send();
      const { id } = idParam.parse(req.params);
      const { orgId, contactIds } = z
        .object({ orgId: z.string().uuid(), contactIds: z.array(z.string().uuid()).max(100_000) })
        .parse(req.body);
      await storeHoldback(orgId, id, contactIds);
      return reply.code(201).send({ data: { stored: contactIds.length } });
    },
  );

  /**
   * POST /api/v1/internal/campaigns/:id/ab-winner-dispatched
   * Called by the worker to mark the winner dispatch as completed.
   */
  app.post(
    '/api/v1/internal/campaigns/:id/ab-winner-dispatched',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const secret = req.headers['x-internal-secret'];
      if (secret !== process.env.INTERNAL_SECRET) return reply.status(401).send();
      const { id } = idParam.parse(req.params);
      await markWinnerDispatched(id);
      return { data: { ok: true } };
    },
  );

  /**
   * PATCH /api/v1/internal/campaigns/:id/status
   * Called by the splitter/winner worker to drive the sending→sent lifecycle.
   * (Previously the splitter called this endpoint but it did not exist, so
   * campaigns were never marked `sent`.)
   */
  app.patch(
    '/api/v1/internal/campaigns/:id/status',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const secret = req.headers['x-internal-secret'];
      if (secret !== process.env.INTERNAL_SECRET) return reply.status(401).send();
      const { id } = idParam.parse(req.params);
      const { status } = z
        .object({ status: z.enum(['sending', 'sent', 'paused', 'cancelled']) })
        .parse(req.body);
      await setCampaignStatusInternal(id, status);
      return { data: { ok: true } };
    },
  );

  /**
   * POST /api/v1/internal/campaigns/dispatch-scheduled
   * Called every minute by the campaign-dispatch cron — finds scheduled
   * campaigns whose time has come and enqueues them.
   */
  app.post(
    '/api/v1/internal/campaigns/dispatch-scheduled',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const secret = req.headers['x-internal-secret'];
      if (secret !== process.env.INTERNAL_SECRET) return reply.status(401).send();
      const result = await dispatchScheduledCampaigns();
      // Same tick also fires any due scheduled transactional batches.
      const { dispatchDueBatches } =
        await import('../../services/transactional/scheduled-batch.js');
      const batches = await dispatchDueBatches().catch(() => ({ dispatched: 0, errors: 0 }));
      return { data: { ...result, batches } };
    },
  );
}
