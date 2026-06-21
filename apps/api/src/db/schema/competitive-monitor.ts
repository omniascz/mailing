/**
 * Competitive email monitoring — track competitor email programs.
 * Org subscribes (via a ForgeMsg inbox) to competitor lists,
 * we store + analyze their emails: frequency, subject lines, send times, offers.
 */
import {
  pgTable, uuid, text, timestamp, integer, boolean, jsonb, index,
} from 'drizzle-orm/pg-core';

export const competitorWatchlist = pgTable(
  'competitor_watchlist',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    competitorName: text('competitor_name').notNull(),
    competitorDomain: text('competitor_domain').notNull(),
    /** ForgeMsg-assigned inbox address for subscribing to competitor list */
    monitorEmail: text('monitor_email').notNull(),
    active: boolean('active').notNull().default(true),
    totalEmailsReceived: integer('total_emails_received').notNull().default(0),
    lastEmailReceivedAt: timestamp('last_email_received_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('competitor_watchlist_org_idx').on(t.orgId),
    emailIdx: index('competitor_watchlist_email_idx').on(t.monitorEmail),
  }),
);

export interface EmailAnalysis {
  fromName: string;
  fromEmail: string;
  subjectLine: string;
  preheader: string;
  sendDayOfWeek: number;
  sendHour: number;
  hasPromotion: boolean;
  discountPercent?: number;
  primaryCta?: string;
  estimatedSendFrequencyDays?: number;
  sentimentScore?: number; // -1 to 1
  topics?: string[];
}

export const competitorEmails = pgTable(
  'competitor_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    watchlistId: uuid('watchlist_id').notNull(),
    subjectLine: text('subject_line').notNull(),
    fromName: text('from_name'),
    fromEmail: text('from_email'),
    /** Raw HTML of the email */
    bodyHtml: text('body_html'),
    preheader: text('preheader'),
    analysis: jsonb('analysis').$type<EmailAnalysis>(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    watchlistIdx: index('competitor_emails_watchlist_idx').on(t.watchlistId),
    orgIdx: index('competitor_emails_org_idx').on(t.orgId),
    receivedIdx: index('competitor_emails_received_idx').on(t.orgId, t.receivedAt),
  }),
);

export type CompetitorWatchlistEntry = typeof competitorWatchlist.$inferSelect;
export type CompetitorEmail = typeof competitorEmails.$inferSelect;
