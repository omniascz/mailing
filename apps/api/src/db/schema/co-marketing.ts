/**
 * Co-marketing campaigns — two orgs collaborate on a shared campaign.
 * Each org contributes their list segment; campaign runs in both orgs; shared analytics.
 */
import { pgTable, uuid, text, timestamp, numeric, jsonb, index, pgEnum } from 'drizzle-orm/pg-core';

export const coMarketingStatusEnum = pgEnum('co_marketing_status', [
  'draft',
  'invited',
  'accepted',
  'rejected',
  'active',
  'completed',
  'cancelled',
]);

export const coMarketingCampaigns = pgTable(
  'co_marketing_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Org that initiated the collaboration */
    initiatorOrgId: uuid('initiator_org_id').notNull(),
    /** Org invited to collaborate */
    partnerOrgId: uuid('partner_org_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: coMarketingStatusEnum('status').notNull().default('draft'),
    /** Campaign template HTML (shared) */
    templateHtml: text('template_html'),
    /** Initiator's list / segment ID */
    initiatorListId: uuid('initiator_list_id'),
    /** Partner's list / segment ID */
    partnerListId: uuid('partner_list_id'),
    /** Cost split: initiator_share + partner_share = 100 */
    initiatorCostShare: numeric('initiator_cost_share', { precision: 5, scale: 2 })
      .notNull()
      .default('50'),
    partnerCostShare: numeric('partner_cost_share', { precision: 5, scale: 2 })
      .notNull()
      .default('50'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /** Combined metrics */
    combinedMetrics: jsonb('combined_metrics').$type<{
      totalSent?: number;
      initiatorSent?: number;
      partnerSent?: number;
      opens?: number;
      clicks?: number;
      conversions?: number;
    }>(),
    inviteToken: text('invite_token'),
    inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    initiatorIdx: index('co_marketing_initiator_idx').on(t.initiatorOrgId),
    partnerIdx: index('co_marketing_partner_idx').on(t.partnerOrgId),
    statusIdx: index('co_marketing_status_idx').on(t.status),
  }),
);

export type CoMarketingCampaign = typeof coMarketingCampaigns.$inferSelect;
