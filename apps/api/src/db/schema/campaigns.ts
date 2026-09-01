import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
  text,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { lists } from './lists.js';
import { templates } from './templates.js';
import { processingPurposes } from './processing-purposes.js';
import { folders } from './folders.js';
import { campaignTypeEnum, campaignStatusEnum } from './enums.js';

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),
    type: campaignTypeEnum('type').notNull().default('email'),
    status: campaignStatusEnum('status').notNull().default('draft'),

    /**
     * Why the campaign is in `paused`, when we know. Two states that look
     * identical in `status` need opposite handling on resume:
     *
     *   'send_failed' — the dispatch threw after the flip to `sending` and was
     *                   rolled back. Nothing reached the queue, so resuming
     *                   means enqueueing.
     *   'operator'    — somebody pressed Pause. Batches may already be out, and
     *                   the dispatch ledger is scoped per enqueue attempt (see
     *                   campaign-dispatch-batches.ts), so a fresh enqueue would
     *                   deliberately re-send the whole audience.
     *
     * NULL is not a third case, it is the absence of an answer: rows written
     * before this column existed, and pauses from paths that do not set it
     * (ab-winner parks a campaign for review this way). Readers must treat NULL
     * as the conservative branch — never enqueue.
     *
     * Cleared on every transition into `sending`, so it can never outlive the
     * pause it describes and be read as the reason for a later one.
     */
    pausedReason: text('paused_reason'),

    /**
     * How many recipients the splitter actually planned for, written when it
     * knows the audience. Not `estimatedRecipients`, which is a guess made
     * while the campaign was still a draft and is never reconciled.
     *
     * NULL means "not recorded" — every campaign that ran before this column
     * existed. Readers must show that as unknown, never as zero: the history
     * is not being backfilled, because the data to backfill it from does not
     * exist (batch results lived in Redis and were evicted).
     */
    plannedRecipients: integer('planned_recipients'),

    /**
     * Batches still to report in, across every phase of the current send. The
     * splitter sets it to the number of batches it enqueued; each batch
     * decrements it on completion, success or permanent failure; the one that
     * takes it to zero closes the campaign — unless `awaitingAbWinner` says
     * more batches are still to come.
     *
     * This is the closing condition, deliberately not a count of per-recipient
     * events: a recipient can fail to produce any event at all, and a campaign
     * whose closure waits for one that never comes is exactly the stuck state
     * this model exists to remove.
     *
     * NULL means no dispatch is outstanding.
     */
    pendingBatches: integer('pending_batches'),

    /**
     * An A/B winner dispatch is still expected to add batches to the counter.
     *
     * An A/B test with a holdback sends in two phases: the variants go out
     * first, and the winning variant goes to the held-back remainder after the
     * test window. Both are batches of the same send, and both belong in the
     * same counter — but the counter reaching zero at the end of the first
     * phase does not mean the send is over, and closing there would report the
     * campaign `sent` with the holdback still unsent. That is what this flag
     * distinguishes: while it is true, zero means "phase one is done", not
     * "the campaign is done".
     *
     * The winner job clears it in the same statement that adds the holdback's
     * batches, which is what makes a replayed winner job unable to add them
     * twice: the add only happens when the flag is still true.
     *
     * False for everything else — an ordinary send, and an A/B test whose
     * variants cover the whole audience, which has no second phase.
     */
    awaitingAbWinner: boolean('awaiting_ab_winner').notNull().default(false),

    // Email-specific
    subject: varchar('subject', { length: 255 }),
    preheader: varchar('preheader', { length: 255 }),
    fromName: varchar('from_name', { length: 100 }),
    fromEmail: varchar('from_email', { length: 255 }),
    replyTo: varchar('reply_to', { length: 255 }),

    // Content (block JSON or template reference)
    templateId: uuid('template_id').references(() => templates.id),
    content: jsonb('content').$type<Record<string, unknown>>().notNull().default({}),

    // Audience
    listId: uuid('list_id').references(() => lists.id),
    segmentId: uuid('segment_id'),
    excludeSegmentId: uuid('exclude_segment_id'),
    estimatedRecipients: integer('estimated_recipients').default(0),

    // UTM auto-append config (applied to all links at render time)
    utmTracking: jsonb('utm_tracking').$type<{
      enabled: boolean;
      source?: string;
      medium?: string;
      campaign?: string;
      content?: string;
      term?: string;
    }>(),

    /**
     * Time-warp: deliver at the same LOCAL hour in each recipient's timezone.
     *
     * The whole machinery behind this already existed and could not be reached.
     * campaign-splitter forwards it to every batch job, batch-sender turns it
     * into a per-contact BullMQ `delay`, and the API has both an internal and
     * an authenticated scheduler endpoint — but nothing ever put a value on a
     * campaign, so the feature was unreachable from the product. Same shape as
     * utmTracking above before #56.
     *
     * Contacts whose timezone is unknown are sent at `localHour` in
     * `fallbackTimezone`. Nobody is dropped: see enqueueCampaignSend.
     */
    timewarp: jsonb('timewarp').$type<{
      enabled: boolean;
      localHour: number;
      fallbackTimezone?: string;
      skipHolidays?: boolean;
      holidayCountry?: 'cz' | 'sk';
    }>(),

    // A/B testing
    abConfig: jsonb('ab_config').$type<Record<string, unknown>>(),

    /** Configuration set name — applies its event dests + IP pool + TLS policy. */
    configurationSet: varchar('configuration_set', { length: 128 }),

    /** Category tag (SendGrid parity) — denormalised onto each email_event for
     *  category-level stats aggregation. */
    category: varchar('category', { length: 128 }),

    /**
     * GDPR processing purpose this campaign sends under. Nullable: orgs that
     * never configure purposes keep sending without one, and the consent
     * guardrail stays inert for them.
     *
     * ON DELETE SET NULL, deliberately not CASCADE — deleting a purpose must
     * orphan the reference, never delete the campaigns (and their send history)
     * that were sent under it.
     */
    processingPurposeId: uuid('processing_purpose_id').references(() => processingPurposes.id, {
      onDelete: 'set null',
    }),

    // Sprint E.1 — resend to non-openers. When parentCampaignId is set,
    // the audience is computed at send time as "contacts who received
    // the parent campaign but didn't open it" — not from list + segment.
    parentCampaignId: uuid('parent_campaign_id'),
    /** {delayHours, newSubject?, newPreheader?, includeBots?} */
    autoResendConfig: jsonb('auto_resend_config').$type<Record<string, unknown>>(),

    // Scheduling
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    timezone: varchar('timezone', { length: 100 }).notNull().default('UTC'),

    // Stats (denormalized for fast list views; full data in ClickHouse)
    totalSent: integer('total_sent').notNull().default(0),
    totalDelivered: integer('total_delivered').notNull().default(0),
    totalOpens: integer('total_opens').notNull().default(0),
    totalClicks: integer('total_clicks').notNull().default(0),
    totalBounces: integer('total_bounces').notNull().default(0),
    totalUnsubscribes: integer('total_unsubscribes').notNull().default(0),
    totalComplaints: integer('total_complaints').notNull().default(0),

    /**
     * Organising folder, or null for unfiled. SET NULL on delete: a folder is
     * a label, not an owner — throwing one away must never take the campaigns
     * with it.
     */
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),

    locale: varchar('locale', { length: 8 }).notNull().default('en'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('campaigns_org_id_idx').on(t.orgId),
    index('campaigns_status_idx').on(t.status),
    index('campaigns_scheduled_at_idx').on(t.scheduledAt),
    index('campaigns_org_status_idx').on(t.orgId, t.status),
    index('campaigns_org_folder_idx').on(t.orgId, t.folderId),
  ],
);

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
