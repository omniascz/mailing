import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  boolean,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

export interface SurveyQuestion {
  id: string;
  type: 'single' | 'multi' | 'scale' | 'text' | 'nps' | 'rating';
  label: string;
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
}

export const surveys = pgTable(
  'surveys',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 1024 }),
    questions: jsonb('questions').$type<SurveyQuestion[]>().notNull().default([]),
    active: boolean('active').notNull().default(true),
    submitCount: integer('submit_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('surveys_org_idx').on(t.orgId)],
);

export const surveyResponses = pgTable(
  'survey_responses',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    surveyId: uuid('survey_id')
      .notNull()
      .references(() => surveys.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    answers: jsonb('answers').$type<Record<string, unknown>>().notNull().default({}),
    npsScore: integer('nps_score'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('survey_responses_survey_idx').on(t.surveyId),
    index('survey_responses_contact_idx').on(t.contactId),
  ],
);

export type Survey = typeof surveys.$inferSelect;
export type SurveyResponse = typeof surveyResponses.$inferSelect;
