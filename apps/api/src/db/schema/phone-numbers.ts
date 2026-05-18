/**
 * Phone numbers management schema (#250).
 *
 * Tracks DID (Direct Inward Dialing) numbers provisioned via Twilio / Telnyx,
 * their assignment to users/departments, and porting requests.
 */

import { pgTable, uuid, varchar, boolean, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

export const phoneNumbers = pgTable(
  'phone_numbers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    /** E.164 number, e.g. +14155551234 */
    number: varchar('number', { length: 32 }).notNull(),
    /** twilio | telnyx */
    provider: varchar('provider', { length: 32 }).notNull().default('twilio'),
    /** Provider's resource SID / ID */
    providerSid: varchar('provider_sid', { length: 255 }),
    /** active | porting | suspended | released */
    status: varchar('status', { length: 32 }).notNull().default('active'),
    /** voice | sms | fax | all */
    capabilities: jsonb('capabilities').$type<string[]>().notNull().default(['voice', 'sms']),
    /** ISO-3166-1 alpha-2 */
    countryCode: varchar('country_code', { length: 2 }).notNull().default('US'),
    /** Friendly name shown in the UI */
    label: varchar('label', { length: 255 }),
    /** User assigned to this number for direct calls */
    assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** IVR menu or hunt group id that handles inbound on this number */
    routingTargetType: varchar('routing_target_type', { length: 32 }),
    routingTargetId: uuid('routing_target_id'),
    /** Whether recording is enabled for calls on this number */
    recordCalls: boolean('record_calls').notNull().default(false),
    monthlyRateUsd: varchar('monthly_rate_usd', { length: 16 }),
    provisionedAt: timestamp('provisioned_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('phone_numbers_number_uq').on(t.orgId, t.number),
    index('phone_numbers_org_idx').on(t.orgId, t.status),
    index('phone_numbers_user_idx').on(t.assignedUserId),
  ],
);

export const phoneNumberPortRequests = pgTable(
  'phone_number_port_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    numbers: jsonb('numbers').$type<string[]>().notNull(),
    losingCarrier: varchar('losing_carrier', { length: 255 }),
    accountNumber: varchar('account_number', { length: 255 }),
    /** pending | submitted | approved | rejected | completed */
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    targetDate: timestamp('target_date', { withTimezone: true }),
    notes: varchar('notes', { length: 2000 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('phone_port_requests_org_idx').on(t.orgId, t.status)],
);

export type PhoneNumber = typeof phoneNumbers.$inferSelect;
export type PhoneNumberPortRequest = typeof phoneNumberPortRequests.$inferSelect;
