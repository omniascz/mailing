/**
 * Brand guidelines — store the org's brand style guide.
 * Used by AI brand consistency checker to flag off-brand emails.
 */
import { pgTable, uuid, text, timestamp, jsonb, boolean, index } from 'drizzle-orm/pg-core';

export interface BrandGuidelinesData {
  /** Approved tone descriptors: e.g. ["professional", "warm", "direct"] */
  toneDescriptors: string[];
  /** Forbidden words/phrases */
  forbiddenPhrases: string[];
  /** Required disclaimers or phrases */
  requiredPhrases: string[];
  /** Brand colors (hex) — for future HTML analysis */
  primaryColors: string[];
  /** Approved fonts */
  approvedFonts: string[];
  /** Max number of exclamation marks allowed per email */
  maxExclamationMarks: number;
  /** Whether emojis are allowed */
  emojisAllowed: boolean;
  /** Target reading level: 'basic' | 'intermediate' | 'advanced' */
  readingLevel: 'basic' | 'intermediate' | 'advanced';
  /** Brand voice description (free text, used as AI prompt context) */
  voiceDescription: string;
  /** Example approved emails (plain text snippets) */
  approvedExamples: string[];
}

export const brandGuidelines = pgTable(
  'brand_guidelines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    name: text('name').notNull().default('Default'),
    guidelines: jsonb('guidelines').$type<BrandGuidelinesData>().notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('brand_guidelines_org_idx').on(t.orgId),
  }),
);

export type BrandGuideline = typeof brandGuidelines.$inferSelect;
