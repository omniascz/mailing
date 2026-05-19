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
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
  deleteCampaign,
  scheduleCampaign,
  sendCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
} from '../../services/campaigns/index.js';
import { scheduleResend } from '../../services/campaigns/auto-resend.js';

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

      const campaign = await scheduleCampaign(
        req.user!.orgId,
        id,
        new Date(scheduledAt),
        timezone,
      );
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
      const campaign = await sendCampaign(req.user!.orgId, id);

      // Enqueue the campaign splitter job
      // In production, this import would be lazy to avoid circular deps
      try {
        const { campaignSplitterQueue, PRIORITY } = await import(
          // @ts-expect-error — workers package
          '@forgemsg/workers/queues'
        ).catch(() => ({
          campaignSplitterQueue: null,
          PRIORITY: { CAMPAIGN: 3 },
        }));

        if (campaignSplitterQueue) {
          await campaignSplitterQueue.add(`campaign-${id}`, {
            campaignId: id,
            orgId: req.user!.orgId,
            listId: campaign.listId,
            segmentId: campaign.segmentId,
            excludeSegmentId: campaign.excludeSegmentId,
            content: campaign.content,
            subject: campaign.subject,
            preheader: campaign.preheader,
            fromName: campaign.fromName,
            fromEmail: campaign.fromEmail,
            replyTo: campaign.replyTo,
            priority: PRIORITY.CAMPAIGN,
          });
        }
      } catch {
        // Queue not available — campaign status was still updated
      }

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
}
