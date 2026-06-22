import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const packetaShipments = pgTable('packeta_shipments', {
  id:         text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId:      text('org_id').notNull(),
  contactId:  text('contact_id'),
  orderId:    text('order_id'),
  barcode:    text('barcode').notNull(),
  status:     text('status').notNull().default('pending'),
  trackingUrl: text('tracking_url'),
  recipientName: text('recipient_name'),
  recipientEmail: text('recipient_email'),
  recipientPhone: text('recipient_phone'),
  pickupPointId: text('pickup_point_id'),
  weight:     text('weight'),
  cod:        text('cod'),
  currency:   text('currency').default('CZK'),
  rawStatus:  jsonb('raw_status').$type<Record<string, unknown>>(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PacketaShipment = typeof packetaShipments.$inferSelect;
