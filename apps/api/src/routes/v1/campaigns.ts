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
import { createSchema, updateSchema } from './campaign-settings-schema.js';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/client.js';
import { campaigns, emailEvents } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';
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
  moveCampaignToFolder,
} from '../../services/campaigns/index.js';
import { assertFolderAssignable } from './folders.js';
import { defaultUtmFor, previewTaggedUrl, resolveUtm } from '../../services/campaigns/utm.js';
import { scheduleResend } from '../../services/campaigns/auto-resend.js';
import {
  enqueueCampaignSend,
  dispatchScheduledCampaigns,
  setCampaignStatusInternal,
} from '../../services/campaigns/dispatch.js';
import {
  computeAbWinner,
  getAbTestResult,
  getHoldbackCount,
  getHoldbackPage,
  markWinnerDispatched,
  storeHoldback,
} from '../../services/campaigns/ab-winner.js';
import { claimBatches, confirmBatches } from '../../services/campaigns/dispatch-ledger.js';
import {
  startDispatch,
  reportBatchCompletion,
  addWinnerPhase,
} from '../../services/campaigns/batch-completion.js';
import { sendTransactionalEmail } from '../../lib/queues.js';
import { renderEmail as renderBlocks, renderPlainText } from '@forgemsg/editor/render';
import { readCampaignContent } from '@forgemsg/editor/schema';
import { checkSendCapacity } from '../../services/billing/plan-enforcement.js';
import { AppError } from '../../lib/app-error.js';
import { assertCampaignPurpose } from '../../services/gdpr/campaign-purpose-check.js';
import { env } from '../../config/env.js';
import {
  validateOrgContent,
  extractTemplateText,
} from '../../services/editor/merge-tag-validation.js';

const idParam = z.object({ id: z.string().uuid() });

const campaignStatuses = [
  'draft',
  'scheduled',
  'queueing',
  'sending',
  'sent',
  'failed',
  'paused',
  'cancelled',
] as const;

/**
 * What PATCH /api/v1/internal/campaigns/:id/status is allowed to do.
 *
 * This is not the operator state machine (services/campaigns/index.ts owns
 * that, and it is untouched). It is the much smaller set of writes the two
 * workers that call this route actually perform, read off their call sites:
 *
 *   campaign-splitter.ts  → 'sending' once every batch is on the queue
 *                         → 'failed'  when the audience resolved to nobody, so
 *                                     no batch will ever close the campaign out
 *   ab-winner.ts          → 'sent'    after the winner is dispatched, and on a
 *                                     replay whose dispatch already happened
 *                         → 'paused'  when the test needs a human, carrying
 *                                     pausedReason 'ab_needs_review'
 *                         → 'failed'  via /ab-winner-failed, when the job has
 *                                     exhausted its attempts and nothing was sent
 *
 * The splitter now writes from `queueing`, which is where sendCampaign leaves
 * the campaign; ab-winner writes from `sending`, which is where the splitter
 * leaves an A/B campaign with a winner job pending. Same-state writes are a
 * no-op and are handled before this map is consulted.
 *
 * Not here, and not by accident: `sending` → `sent` for the ordinary path. A
 * campaign is closed out by its last batch reporting in, through
 * /batch-complete, not by anyone asserting a status over HTTP.
 *
 * Also deliberately absent: `paused` → anything. Pausing while the splitter is
 * still enqueueing is reachable, and letting the splitter's write land
 * afterwards erases a pause an operator or the anomaly detector applied on
 * purpose. Neither worker needs it. Such a campaign stays `paused` instead of
 * reporting itself `sent`, which is the less wrong of two wrong answers.
 */
const INTERNAL_STATUS_TRANSITIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  queueing: new Set(['sending', 'failed']),
  // `sending → failed` is the A/B winner job giving up for good: its dispatch
  // cannot be computed and no batch of that campaign sent anything, so nothing
  // else will ever close it. Without this the job's only honest exits were a
  // status the whitelist refused and no status at all.
  sending: new Set(['sent', 'paused', 'failed']),
};

/**
 * States this route must never move a campaign out of, checked separately from
 * the whitelist above so that adding an entry there cannot reopen the exit.
 */
const INTERNAL_STATUS_TERMINAL: ReadonlySet<string> = new Set(['sent', 'failed', 'cancelled']);

/** null means "take it out of whatever folder it is in". */
const moveSchema = z.object({ folderId: z.string().uuid().nullable() });

const listQuerySchema = z.object({
  status: z.enum(campaignStatuses).optional(),
  /** A folder id, or the literal 'none' for the Unfiled drawer. */
  folderId: z.union([z.string().uuid(), z.literal('none')]).optional(),
  cursor: z.string().uuid().optional(),
  limit: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(100))
    .optional(),
});

/**
 * Merge tags in the parts of a campaign that get rendered. Subject, preheader
 * and body are validated together so a tag used in two of them is reported
 * once.
 */
async function mergeTagWarnings(
  orgId: string,
  body: { subject?: string; preheader?: string; content?: Record<string, unknown> },
) {
  return validateOrgContent(orgId, [
    body.subject,
    body.preheader,
    body.content ? extractTemplateText(body.content) : undefined,
  ]);
}

export default async function campaignRoutes(app: FastifyInstance) {
  /**
   * User auth for the customer-facing routes only.
   *
   * The internal endpoints at the bottom of this file are called by BullMQ
   * workers, which hold a shared secret and no session. A plugin-wide hook ran
   * for them too, so every call from the ab-winner worker was answered with
   * 401 "Authentication required" before it reached the handler — surfaced by
   * the idempotency integration tests, which could not get the worker to run
   * at all. They are not unprotected: the internal-auth plugin guards every
   * /api/v1/internal/* path with a timing-safe compare against
   * INTERNAL_API_SECRET.
   *
   * That was first patched by having the hook return early for the prefix,
   * which worked but left the guard attached to routes it had no business
   * touching — the exemption lived in the hook body, where nothing structural
   * enforced it. The routes that need a session are in a child context now, so
   * the guard reaches them and only them, and anything registered outside it
   * cannot inherit a credential its callers do not hold.
   */
  await app.register(async (scope) => {
    scope.addHook('preHandler', app.requireAuth);
    /**
     * GET /api/v1/campaigns
     * List campaigns for this org. Supports cursor pagination and status filter.
     *
     * Query: ?status=draft&cursor=<uuid>&limit=50
     */
    scope.get(
      '/api/v1/campaigns',
      { schema: { tags: ['Campaigns'], summary: 'List campaigns' } },
      async (req) => {
        const query = listQuerySchema.parse(req.query);
        const result = await listCampaigns({
          orgId: req.user!.orgId,
          status: query.status,
          folderId: query.folderId,
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
    scope.post(
      '/api/v1/campaigns',
      { schema: { tags: ['Campaigns'], summary: 'Create campaign' } },
      async (req, reply) => {
        const body = createSchema.parse(req.body);
        const campaign = await createCampaign({
          ...body,
          orgId: req.user!.orgId,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
        });
        // Warnings, never an error: a tag we cannot resolve today may be filled
        // in at run time from ctx.data, and refusing the save would block work
        // the customer is entitled to do. The pre-send panel gets the last word.
        const warnings = await mergeTagWarnings(req.user!.orgId, body);
        return reply.code(201).send({ data: campaign, ...(warnings.length ? { warnings } : {}) });
      },
    );

    /**
     * GET /api/v1/campaigns/:id
     * Get a single campaign.
     */
    scope.get(
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
    scope.put(
      '/api/v1/campaigns/:id',
      { schema: { tags: ['Campaigns'], summary: 'Update campaign' } },
      async (req) => {
        const { id } = idParam.parse(req.params);
        const body = updateSchema.parse(req.body);
        const campaign = await updateCampaign(req.user!.orgId, id, {
          ...body,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
        });
        const warnings = await mergeTagWarnings(req.user!.orgId, body);
        return { data: campaign, ...(warnings.length ? { warnings } : {}) };
      },
    );

    /**
     * DELETE /api/v1/campaigns/:id
     * Soft delete a campaign (cannot delete while sending).
     */
    scope.delete(
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
    scope.post(
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
     * PUT /api/v1/campaigns/:id/folder
     * File the campaign in a folder, or pass null to take it out of one.
     *
     * Its own endpoint rather than a field on PATCH /campaigns/:id, because that
     * route refuses anything that is not a draft — and a sent campaign is
     * exactly the kind that wants filing.
     */
    scope.put(
      '/api/v1/campaigns/:id/folder',
      { schema: { tags: ['Campaigns'], summary: 'Move campaign to a folder' } },
      async (req) => {
        const { id } = idParam.parse(req.params);
        const { folderId } = moveSchema.parse(req.body);
        // Checked before the write: the folder must exist, be this org's, and be
        // a campaign folder. Anything else answers 404 rather than filing the
        // campaign somewhere it can never be seen again.
        await assertFolderAssignable(req.user!.orgId, 'campaign', folderId);
        const campaign = await moveCampaignToFolder(req.user!.orgId, id, folderId);
        return { data: campaign };
      },
    );

    /**
     * GET /api/v1/campaigns/:id/utm
     * The UTM settings in effect, and what they do to a link.
     *
     * Answers "what would happen if I turned this on" without writing
     * anything: the defaults are computed the same way the send path computes
     * them, and the preview runs the same parse-and-set the renderer runs, so
     * a link that already carries a query string previews the way it will
     * actually send.
     */
    scope.get(
      '/api/v1/campaigns/:id/utm',
      { schema: { tags: ['Campaigns'], summary: 'UTM settings and a tagged-link preview' } },
      async (req) => {
        const { id } = idParam.parse(req.params);
        const { sampleUrl } = z
          .object({ sampleUrl: z.string().url().optional() })
          .parse(req.query ?? {});

        // Org-scoped: throws notFound for another organisation's campaign, and
        // it is the only lookup here.
        const campaign = await getCampaign(req.user!.orgId, id);
        const settings = resolveUtm(campaign, campaign.utmTracking);
        const sample = sampleUrl ?? 'https://example.com/produkt?id=7';

        return {
          data: {
            enabled: settings.enabled,
            effective: settings,
            defaults: defaultUtmFor(campaign),
            preview: {
              input: sample,
              output: previewTaggedUrl(sample, { ...settings, enabled: true }),
            },
            /** Links that never get tagged, whatever the settings say. */
            neverTagged: ['unsubscribe', 'preference centre', 'view in browser'],
          },
        };
      },
    );

    /**
     * POST /api/v1/campaigns/:id/send
     * Send a campaign immediately.
     *
     * This triggers the queue pipeline:
     *   campaign-splitter → batch-sender → mta-{isp}
     */
    scope.post(
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
    scope.post(
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
    scope.post(
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
    scope.post(
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
    scope.post(
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
    scope.post(
      '/api/v1/campaigns/:id/test',
      { schema: { tags: ['Campaigns'], summary: 'Send a test of this campaign' } },
      async (req, reply) => {
        const { id } = idParam.parse(req.params);
        const { to } = z.object({ to: z.string().email() }).parse(req.body);

        const campaign = await getCampaign(req.user!.orgId, id);

        // The test has to be a test OF THE CAMPAIGN, which means rendering it
        // the way the send path renders it. This route used to read
        // `content.html` directly, so for a campaign authored in the visual
        // editor it mailed the browser's save-time snapshot — rendered against
        // a hard-coded preview contact — and after that snapshot stopped being
        // stored it would have reported "no content" for the product's main
        // authoring path.
        const parsed = readCampaignContent(
          (campaign.content ?? {}) as Record<string, unknown>,
          campaign.preheader ?? undefined,
        );
        const legacy = (campaign.content ?? {}) as { html?: string; plainText?: string };
        const testHtml = parsed.schema ? renderBlocks(parsed.schema).html : legacy.html;
        const testText = parsed.schema ? renderPlainText(parsed.schema) : legacy.plainText;
        if (!testHtml && !testText) {
          throw AppError.badRequest(
            'Campaign has no content to test — add HTML or plain text first',
          );
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
            from: campaign.fromEmail ?? env.SYSTEM_EMAIL_FROM,
            fromName: campaign.fromName ?? undefined,
            replyTo: campaign.replyTo ?? undefined,
            subject: `[TEST] ${campaign.subject}`,
            html: testHtml ?? '',
            text: testText ?? undefined,
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
     * GET /api/v1/campaigns/:id/poll-results
     * Per-answer counts for every poll block in the campaign.
     *
     * Lives on the campaign rather than under analytics because a poll belongs
     * to one send: the question is stored in that campaign's schema and the
     * votes are counted against that campaign id.
     */
    scope.get(
      '/api/v1/campaigns/:id/poll-results',
      {
        preHandler: [app.authenticate],
        schema: { tags: ['Campaigns'], summary: 'Poll results for a campaign' },
      },
      async (req) => {
        const { id } = idParam.parse(req.params);
        const { pollResultsForCampaign } = await import('../../services/polls/index.js');
        return { data: await pollResultsForCampaign(req.user!.orgId, id) };
      },
    );

    /**
     * GET /api/v1/campaigns/:id/ab-result
     * Returns the stored A/B test result (winner, confidence, rankings) for a campaign.
     */
    scope.get(
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
  });

  // ── Internal endpoints (called by ab-winner BullMQ worker) ───────────────
  //
  // Auth here is the internal-auth plugin's onRequest hook: it covers every
  // /api/v1/internal/* path and compares the x-internal-secret header against
  // env.INTERNAL_API_SECRET in constant time.
  //
  // These handlers used to repeat that check by hand against the legacy
  // `INTERNAL_SECRET` env name, which is not what the API validates or the
  // deployment sets — so every one of them answered 401 with an empty body no
  // matter what the worker sent, and the ab-winner worker could never compute
  // a winner or read a holdback page. The duplicated check is gone rather than
  // corrected, so there is one place that decides whether an internal request
  // is authentic. Every other internal route in the codebase has since had the
  // same duplicate removed.

  /**
   * POST /api/v1/internal/campaigns/:id/ab-winner-compute
   * Computes the winning variant and stores the result. Idempotent.
   * Protected by x-internal-secret header.
   */
  app.post(
    '/api/v1/internal/campaigns/:id/ab-winner-compute',
    { schema: { tags: ['Internal'] } },
    async (req) => {
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
    async (req) => {
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
      const { id } = idParam.parse(req.params);
      const { orgId, contactIds } = z
        .object({ orgId: z.string().uuid(), contactIds: z.array(z.string().uuid()).max(100_000) })
        .parse(req.body);
      await storeHoldback(orgId, id, contactIds);
      return reply.code(201).send({ data: { stored: contactIds.length } });
    },
  );

  /**
   * POST /api/v1/internal/campaigns/:id/dispatch-batches/claim
   *
   * Reserve batch keys for one dispatch. The splitter and the ab-winner worker
   * call this before `addBulk` and enqueue only what comes back, which is what
   * stops a retried job from sending the campaign a second time.
   */
  app.post(
    '/api/v1/internal/campaigns/:id/dispatch-batches/claim',
    { schema: { tags: ['Internal'] } },
    // Auth is the internal-auth onRequest hook, which covers every
    // /api/v1/internal/* route with a timing-safe compare against
    // env.INTERNAL_API_SECRET.
    async (req) => {
      const { id } = idParam.parse(req.params);
      const { orgId, dispatchId, keys } = z
        .object({
          orgId: z.string().uuid(),
          dispatchId: z.string().min(1).max(128),
          keys: z.array(z.string().min(1).max(128)).max(10_000),
        })
        .parse(req.body);
      const result = await claimBatches(orgId, id, dispatchId, keys);
      return { data: result };
    },
  );

  /**
   * POST /api/v1/internal/campaigns/:id/dispatch-batches/confirm
   * Called once `addBulk` has returned, so the keys are known to be queued.
   */
  app.post(
    '/api/v1/internal/campaigns/:id/dispatch-batches/confirm',
    { schema: { tags: ['Internal'] } },
    async (req) => {
      idParam.parse(req.params);
      const { dispatchId, keys } = z
        .object({
          dispatchId: z.string().min(1).max(128),
          keys: z.array(z.string().min(1).max(128)).max(10_000),
        })
        .parse(req.body);
      await confirmBatches(dispatchId, keys);
      return { data: { confirmed: keys.length } };
    },
  );

  /**
   * POST /api/v1/internal/campaigns/:id/ab-winner-failed
   *
   * The A/B winner job has exhausted its attempts on an error that will not go
   * away. Nothing else can close an A/B campaign — it arms no batch counter and
   * the reaper skips it — so without this it stays in `sending` for good.
   *
   * The sent-or-failed verdict is decided here rather than in the worker,
   * because it is read from the dispatch ledger and the worker has no database.
   */
  app.post(
    '/api/v1/internal/campaigns/:id/ab-winner-failed',
    { schema: { tags: ['Internal'] } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const { orgId, reason } = z
        .object({ orgId: z.string().uuid(), reason: z.string().min(1).max(500) })
        .parse(req.body);
      const { closeAfterWinnerFailure } = await import('../../services/campaigns/ab-closing.js');
      const result = await closeAfterWinnerFailure(orgId, id, reason);
      return { data: result };
    },
  );

  /**
   * POST /api/v1/internal/campaigns/:id/ab-winner-dispatched
   * Called by the worker to mark the winner dispatch as completed.
   */
  app.post(
    '/api/v1/internal/campaigns/:id/ab-winner-dispatched',
    { schema: { tags: ['Internal'] } },
    async (req) => {
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
   *
   * The route validates, not the setter. `setCampaignStatusInternal` bypasses
   * `validateTransition` on purpose — the splitter legitimately performs writes
   * the operator-facing state machine does not allow — but "the setter may do
   * anything" was being read as "this route may do anything", and it could:
   * one PATCH took a campaign out of `sent` or `cancelled` and back into
   * `sending`, measured on a real database. So the narrowing lives here, where
   * the untrusted input arrives, and the setter is left alone.
   */
  app.patch(
    '/api/v1/internal/campaigns/:id/status',
    { schema: { tags: ['Internal'] } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      // An unrecognised status is a ZodError, which the error handler renders as
      // a 400 — not a 500, and not a write.
      //
      // 'failed' was missing from this enum while INTERNAL_STATUS_TRANSITIONS
      // above already declared `queueing → failed`. The splitter's empty-audience
      // branch ("no batches were enqueued — marking failed") therefore got a 400
      // on every call, and because that caller does not check `res.ok` the
      // refusal was swallowed: the campaign stayed in `queueing` for good.
      // Measured against a live API before this line changed.
      //
      // `pausedReason` travels with a pause so resume can tell the two apart.
      // Only the reason a worker is entitled to set is accepted here; the
      // others are written by API-side paths that call the setter directly.
      const { status, pausedReason } = z
        .object({
          status: z.enum(['sending', 'sent', 'paused', 'cancelled', 'failed']),
          pausedReason: z.literal('ab_needs_review').optional(),
        })
        .parse(req.body);

      const [current] = await db
        .select({ status: campaigns.status })
        .from(campaigns)
        .where(eq(campaigns.id, id))
        .limit(1);
      if (!current) throw AppError.notFound('Campaign');
      const from = current.status;

      // A no-op is not a transition. Both callers are best-effort and neither
      // acks its BullMQ job before this write, so a worker dying in between
      // replays the same PATCH on stalled-job recovery. Short-circuiting keeps
      // that off the refusal log — and skips the write, so the `campaign.sent`
      // webhook is not emitted a second time for the same campaign.
      if (from === status) return { data: { ok: true, noop: true } };

      // Terminal states are terminal, stated on its own rather than left to
      // fall out of the whitelist below — so that widening the whitelist later
      // cannot quietly reopen the way out of one.
      if (INTERNAL_STATUS_TERMINAL.has(from)) {
        req.log.warn(
          { campaignId: id, from, to: status },
          '[internal-status] refused: a terminal campaign status cannot be left through this route',
        );
        throw AppError.badRequest(
          `Campaign is ${from}, which is terminal — refusing to move it to ${status}`,
          { from, to: status },
        );
      }

      if (!INTERNAL_STATUS_TRANSITIONS[from]?.has(status)) {
        // Loudly, because neither caller looks at the response: ab-winner logs
        // the status code and moves on, and the splitter does not even check
        // `res.ok`. If this is not in our log it is nowhere.
        req.log.warn(
          { campaignId: id, from, to: status },
          '[internal-status] refused: transition is not one the splitter or winner worker performs',
        );
        throw AppError.badRequest(`Campaign status ${from} → ${status} is not allowed here`, {
          from,
          to: status,
        });
      }

      await setCampaignStatusInternal(id, status, pausedReason ?? null);
      return { data: { ok: true } };
    },
  );

  /**
   * GET /api/v1/internal/campaigns/:id/dispatch-state
   *
   * What a batch-sender job asks before it does any work: is this campaign
   * still one I should be sending? The route exists because until now nothing
   * in the send path read the campaign's status at all — pausing a campaign
   * changed a column and stopped nothing, and cancelling it stopped nothing
   * either.
   *
   * Deliberately not the PATCH route's twin. That one is a narrow whitelist of
   * writes; this is a read, it is called once per batch, and it returns the two
   * fields the brake needs and nothing else.
   */
  app.get(
    '/api/v1/internal/campaigns/:id/dispatch-state',
    { schema: { tags: ['Internal'] } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const [row] = await db
        .select({ status: campaigns.status, pausedReason: campaigns.pausedReason })
        .from(campaigns)
        .where(eq(campaigns.id, id))
        .limit(1);
      if (!row) throw AppError.notFound('Campaign');
      return { data: row };
    },
  );

  /**
   * POST /api/v1/internal/campaigns/:id/dispatch-start
   * The splitter, once it knows the audience and before it enqueues anything.
   * Arms the counter that the last batch will take to zero.
   */
  app.post(
    '/api/v1/internal/campaigns/:id/dispatch-start',
    { schema: { tags: ['Internal'] } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          orgId: z.string().uuid(),
          plannedRecipients: z.number().int().min(0),
          batchCount: z.number().int().min(0).nullable(),
          // An A/B test with a holdback: a winner dispatch will add more
          // batches to this counter later, so zero is not the end of the send.
          awaitingAbWinner: z.boolean().optional(),
        })
        .parse(req.body);
      await startDispatch({ campaignId: id, ...body });
      return { data: { ok: true } };
    },
  );

  /**
   * POST /api/v1/internal/campaigns/:id/ab-winner-phase-start
   *
   * The winner job, once it knows there is a winner to dispatch and before it
   * enqueues anything. Adds the holdback's batches to the counter the variants
   * already armed, and stops the campaign waiting for them.
   *
   * The batch count is computed here rather than sent by the worker, because it
   * comes from `ab_test_holdbacks` and the worker has no database. The worker
   * sends only its own batch size so the arithmetic matches the chunks it is
   * about to build, and checks afterwards that it produced exactly this many.
   */
  app.post(
    '/api/v1/internal/campaigns/:id/ab-winner-phase-start',
    { schema: { tags: ['Internal'] } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const { orgId, batchSize } = z
        .object({
          orgId: z.string().uuid(),
          batchSize: z.number().int().min(1).max(10_000),
        })
        .parse(req.body);

      const holdbackCount = await getHoldbackCount(id);
      const expectedBatches = Math.ceil(holdbackCount / batchSize);

      // Nothing to dispatch. Reported rather than armed: raising a counter by
      // zero and clearing the flag would leave a campaign whose variants have
      // all reported sitting at zero with nothing left to close it.
      if (expectedBatches === 0) {
        req.log.warn(
          { campaignId: id },
          '[ab-winner] a winner dispatch was requested but the holdback is empty',
        );
        return {
          data: { armed: false, reason: 'empty_holdback', expectedBatches: 0, holdbackCount },
        };
      }

      const result = await addWinnerPhase({ campaignId: id, orgId, batchCount: expectedBatches });
      return {
        data: {
          armed: result.armed,
          ...(result.armed ? {} : { reason: result.reason }),
          expectedBatches,
          holdbackCount,
        },
      };
    },
  );

  /**
   * POST /api/v1/internal/campaigns/:id/batch-complete
   * One batch-sender job reporting that it is finished — sent, skipped, or gave
   * up. The report that takes the counter to zero closes the campaign.
   */
  app.post(
    '/api/v1/internal/campaigns/:id/batch-complete',
    { schema: { tags: ['Internal'] } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          orgId: z.string().uuid(),
          dispatchId: z.string().min(1).max(128),
          batchKey: z.string().min(1).max(128),
          sent: z.number().int().min(0),
          skipped: z.number().int().min(0),
        })
        .parse(req.body);
      const result = await reportBatchCompletion({ campaignId: id, ...body });
      if (result.counted && result.closed) {
        req.log.info(
          { campaignId: id, dispatchId: body.dispatchId, outcome: result.closed },
          '[dispatch] campaign closed by its last batch',
        );
      }
      return { data: result };
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
    async () => {
      const result = await dispatchScheduledCampaigns();
      // Same tick also fires any due scheduled transactional batches.
      const { dispatchDueBatches } =
        await import('../../services/transactional/scheduled-batch.js');
      const batches = await dispatchDueBatches().catch(() => ({ dispatched: 0, errors: 0 }));
      return { data: { ...result, batches } };
    },
  );

  /**
   * POST /api/v1/internal/campaigns/reap-stalled
   * Hourly safety net: closes campaigns whose batches have stopped reporting.
   * Not the closing mechanism — see services/campaigns/dispatch-reaper.ts.
   */
  app.post(
    '/api/v1/internal/campaigns/reap-stalled',
    { schema: { tags: ['Internal'] } },
    async (req) => {
      const { reapStalledDispatches } = await import('../../services/campaigns/dispatch-reaper.js');
      const result = await reapStalledDispatches();
      if (result.examined > 0) {
        req.log.warn(result, '[dispatch-reaper] closed campaigns that stopped reporting');
      }
      return { data: result };
    },
  );
}
