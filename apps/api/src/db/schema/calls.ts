import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  integer,
  decimal,
  text,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { campaigns } from './campaigns.js';
import { contacts } from './contacts.js';
import { users } from './users.js';
import { callStatusEnum } from './enums.js';

export const calls = pgTable(
  'calls',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    // Campaign (optional — for voice campaigns)
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),

    // Contact
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),

    // Agent (#253) — the user who made/received the call
    agentId: uuid('agent_id').references(() => users.id, { onDelete: 'set null' }),

    // CRM deal association (#253)
    dealId: uuid('deal_id'),

    // Scenario (optional — for voice scenarios)
    scenarioId: uuid('scenario_id'),

    // Direction: inbound | outbound (#253)
    direction: varchar('direction', { length: 16 }).notNull().default('outbound'),

    // E.164 phone numbers
    fromNumber: varchar('from_number', { length: 32 }),
    toNumber: varchar('to_number', { length: 32 }),

    // Call status
    status: callStatusEnum('status').notNull(),

    // Call metadata
    durationSeconds: integer('duration_seconds').notNull().default(0),
    recordingUrl: varchar('recording_url', { length: 1024 }),
    transcript: text('transcript'),
    aiSummary: text('ai_summary'),

    // Structured outcome (JSON): {appointment_confirmed, preferred_time, sentiment, etc.}
    outcome: jsonb('outcome').$type<Record<string, unknown>>(),

    // Cost
    cost: decimal('cost', { precision: 10, scale: 4 }).notNull().default('0.00'),

    // Twilio metadata
    twilioCallSid: varchar('twilio_call_sid', { length: 255 }),
    twilioRecordingSid: varchar('twilio_recording_sid', { length: 255 }),

    // Voicemail (#254)
    voicemailUrl: varchar('voicemail_url', { length: 1024 }),
    voicemailTranscript: text('voicemail_transcript'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('calls_org_id_idx').on(t.orgId),
    index('calls_contact_id_idx').on(t.contactId),
    index('calls_campaign_id_idx').on(t.campaignId),
    index('calls_agent_id_idx').on(t.agentId),
    index('calls_deal_id_idx').on(t.dealId),
    index('calls_status_idx').on(t.status),
    index('calls_created_at_idx').on(t.createdAt),
    index('calls_org_contact_idx').on(t.orgId, t.contactId),
  ],
);

export type Call = typeof calls.$inferSelect;
export type NewCall = typeof calls.$inferInsert;
