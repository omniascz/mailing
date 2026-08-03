import { pgTable, text, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';

export const erpConnections = pgTable('erp_connections', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text('org_id').notNull(),
  type: text('type').notNull(), // pohoda | flexibee | money_s3
  name: text('name').notNull(),
  // Pohoda: XML API URL + credentials
  pohodaUrl: text('pohoda_url'),
  pohodaUsername: text('pohoda_username'),
  pohodaPassword: text('pohoda_password'),
  pohodaIco: text('pohoda_ico'),
  // FlexiBee / ABRA Flexi: REST API
  flexibeeUrl: text('flexibee_url'),
  flexibeeUsername: text('flexibee_username'),
  flexibeePassword: text('flexibee_password'),
  flexibeeCompany: text('flexibee_company'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  syncedContacts: integer('synced_contacts').default(0),
  syncedOrders: integer('synced_orders').default(0),
  syncedInvoices: integer('synced_invoices').default(0),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const erpSyncLog = pgTable('erp_sync_log', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  connectionId: text('connection_id').notNull(),
  orgId: text('org_id').notNull(),
  entity: text('entity').notNull(), // contacts | orders | invoices
  status: text('status').notNull(), // success | error
  recordsIn: integer('records_in').default(0),
  recordsOut: integer('records_out').default(0),
  error: text('error'),
  detail: jsonb('detail').$type<Record<string, unknown>>(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export type ErpConnection = typeof erpConnections.$inferSelect;
