import { pgTable, uuid, timestamp, numeric, jsonb, text, index } from 'drizzle-orm/pg-core';

export interface NbaBreakdown {
  recencyScore: number;
  engagementScore: number;
  intentScore: number;
  fatiguePenalty: number;
  channelScores: { email: number; sms: number; push: number; whatsapp: number };
}

export const nbaScores = pgTable(
  'nba_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    /** Recommended next action: 'email' | 'sms' | 'push' | 'whatsapp' | 'call' | 'wait' */
    recommendedChannel: text('recommended_channel').notNull(),
    /** Score 0–100 */
    score: numeric('score', { precision: 5, scale: 2 }).notNull(),
    breakdown: jsonb('breakdown').$type<NbaBreakdown>().notNull().default({} as NbaBreakdown),
    /** Best time window for the recommended action (hour 0-23, UTC) */
    bestSendHour: numeric('best_send_hour', { precision: 3, scale: 0 }),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    orgContactIdx: index('nba_scores_contact_idx').on(t.orgId, t.contactId),
    orgExpiresIdx: index('nba_scores_expires_idx').on(t.orgId, t.expiresAt),
  }),
);

export type NbaScore = typeof nbaScores.$inferSelect;
