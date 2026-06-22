import { pgTable, text, timestamp, integer, real } from 'drizzle-orm/pg-core';

export const contactSendTimePredictions = pgTable('contact_send_time_predictions', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId:        text('org_id').notNull(),
  contactId:    text('contact_id').notNull(),
  // Best hour (0-23 UTC) and confidence 0-1
  bestHourUtc:  integer('best_hour_utc').notNull(),
  secondBestHourUtc: integer('second_best_hour_utc'),
  confidence:   real('confidence').notNull().default(0),
  // Breakdown: open rate per hour slot (24 slots, comma-separated or stored as text)
  hourlyOpenRates: text('hourly_open_rates'), // JSON-encoded float[24]
  sampleSize:   integer('sample_size').notNull().default(0),
  computedAt:   timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ContactSendTimePrediction = typeof contactSendTimePredictions.$inferSelect;
