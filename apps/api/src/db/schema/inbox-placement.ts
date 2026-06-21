/**
 * Inbox placement test results — simulated seed-list testing.
 * Tracks predicted inbox/spam/promotions placement per email provider.
 */
import { pgTable, uuid, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';

export interface ProviderResult {
  provider: string;    // 'gmail' | 'outlook' | 'yahoo' | 'seznam' | 'apple_mail'
  prediction: 'inbox' | 'promotions' | 'spam' | 'updates';
  confidence: number;  // 0-1
  reasons: string[];
}

export const inboxPlacementTests = pgTable(
  'inbox_placement_tests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    campaignId: uuid('campaign_id'),
    subject: text('subject').notNull(),
    fromEmail: text('from_email').notNull(),
    /** Summary score 0-100 */
    overallScore: integer('overall_score').notNull(),
    /** Per-provider predictions */
    results: jsonb('results').$type<ProviderResult[]>().notNull().default([]),
    /** List of issues detected */
    issues: jsonb('issues').$type<string[]>().notNull().default([]),
    /** Recommendations */
    recommendations: jsonb('recommendations').$type<string[]>().notNull().default([]),
    testedAt: timestamp('tested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('inbox_placement_org_idx').on(t.orgId),
    campaignIdx: index('inbox_placement_campaign_idx').on(t.campaignId),
  }),
);

export type InboxPlacementTest = typeof inboxPlacementTests.$inferSelect;
