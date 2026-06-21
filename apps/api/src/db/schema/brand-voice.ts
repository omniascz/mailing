import { pgTable, text, uuid, timestamp, jsonb, boolean, index } from 'drizzle-orm/pg-core';

export interface BrandVoiceProfile {
  tone: string;
  vocabulary: { keyPhrases: string[]; readingLevel: 'basic' | 'intermediate' | 'advanced'; avgWordsPerSentence: number };
  ctaPatterns: { actionWords: string[]; urgencyLevel: 'low' | 'medium' | 'high' };
  emojiUsage: 'none' | 'rare' | 'moderate' | 'frequent';
  personalizationLevel: 'none' | 'basic' | 'advanced';
  brandValues: string[];
  summary: string;
}

export const brandVoiceProfiles = pgTable(
  'brand_voice_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    name: text('name').notNull(),
    profile: jsonb('profile').$type<BrandVoiceProfile>().notNull(),
    active: boolean('active').notNull().default(true),
    samplesUsed: jsonb('samples_used').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('brand_voice_org_idx').on(t.orgId),
    orgActiveIdx: index('brand_voice_org_active_idx').on(t.orgId, t.active),
  }),
);

export type BrandVoiceProfileRow = typeof brandVoiceProfiles.$inferSelect;
