/**
 * Cross-account user access (#274).
 *
 * A user's primary org is still users.org_id.
 * organization_members lets one user belong to N additional orgs
 * without duplicating the users row.
 *
 * Flow: owner/admin invites → pending row created → invitee accepts via token → active
 */

import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, varchar, timestamp, text, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),

    /** Email used for invitation (before the user accepts / account exists) */
    email: varchar('email', { length: 255 }).notNull(),

    /** owner | admin | editor | viewer */
    role: varchar('role', { length: 32 }).notNull().default('viewer'),

    /** pending | active | suspended | removed */
    status: varchar('status', { length: 16 }).notNull().default('pending'),

    invitedByUserId: uuid('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    invitationToken: text('invitation_token'),
    invitationExpiresAt: timestamp('invitation_expires_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('org_members_org_email_uq').on(t.orgId, t.email),
    index('org_members_user_idx').on(t.userId),
    index('org_members_org_status_idx').on(t.orgId, t.status),
    index('org_members_token_idx').on(t.invitationToken),
  ],
);

export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type NewOrganizationMember = typeof organizationMembers.$inferInsert;
