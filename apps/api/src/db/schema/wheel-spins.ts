/**
 * Gamification — Wheel of Fortune spin tracking.
 *
 * Each spin is recorded here so we can:
 *  - Prevent duplicate prizes per email address
 *  - Enforce max-spins-per-email limits
 *  - Associate awarded coupons with spins for redemption tracking
 */

import { pgTable, uuid, varchar, boolean, timestamp, index, integer } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { signupForms } from './signup-forms.js';
import { contacts } from './contacts.js';

export const wheelSpins = pgTable(
  'wheel_spins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    formId: uuid('form_id')
      .notNull()
      .references(() => signupForms.id, { onDelete: 'cascade' }),
    /** Contact who spun — may be null for anonymous pre-email spins */
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    /** Email collected from the spin form (used to enforce dedup before contactId exists) */
    email: varchar('email', { length: 320 }).notNull(),
    /** Index of the prize slice (0-based, maps into WheelPrize[] config array) */
    prizeIndex: integer('prize_index').notNull(),
    prizeLabel: varchar('prize_label', { length: 255 }).notNull(),
    /** Coupon code awarded for this spin, if any */
    couponCode: varchar('coupon_code', { length: 128 }),
    /** Whether the visitor actually sees the result (confirmed = they submitted the form) */
    confirmed: boolean('confirmed').notNull().default(false),
    /** Visitor IP for fraud/abuse detection */
    ipAddress: varchar('ip_address', { length: 45 }),
    spunAt: timestamp('spun_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('wheel_spins_form_email_idx').on(t.formId, t.email),
    index('wheel_spins_org_form_idx').on(t.orgId, t.formId),
    index('wheel_spins_contact_idx').on(t.contactId),
  ],
);

export type WheelSpin = typeof wheelSpins.$inferSelect;
export type NewWheelSpin = typeof wheelSpins.$inferInsert;

// ─── Config types (stored as JSONB in signup_forms.config.wheelConfig) ────────

export interface WheelPrize {
  /** Slice label (e.g., "10% OFF", "Free Shipping", "No Prize") */
  label: string;
  /** Relative probability weight (e.g., [3, 2, 10] = 3/15, 2/15, 10/15) */
  weight: number;
  /** If set, a coupon from this pool is awarded */
  couponPoolId?: string;
  /** Static coupon code (alt. to couponPoolId) */
  couponCode?: string;
  /** Hex color for this wheel slice */
  color?: string;
  /** Whether this is a "no prize" slice (spin still counted, no reward) */
  noPrize?: boolean;
}

export interface WheelConfig {
  prizes: WheelPrize[];
  /** Max number of spins allowed per email address. Default = 1 */
  maxSpinsPerEmail?: number;
  /** Title shown above the wheel */
  title?: string;
  /** Subtitle / instructions */
  subtitle?: string;
  /** "Spin" button label */
  spinButtonText?: string;
  /** Primary brand color for the wheel frame */
  primaryColor?: string;
}
