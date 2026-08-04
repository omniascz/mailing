import { pgTable, uuid, text, timestamp, numeric, jsonb, index, pgEnum } from 'drizzle-orm/pg-core';

export const personaTypeEnum = pgEnum('persona_type', [
  'champion', // high engagement, advocate, buys premium
  'loyal', // regular buyer, consistent engagement
  'deal_hunter', // only buys on discount, price-sensitive
  'window_shopper', // opens but rarely clicks/buys
  'seasonal', // spikes around holidays/sales
  'at_risk', // declining engagement
  'dormant', // no engagement 90+ days
  'new_subscriber', // < 30 days
  'vip', // top 5% revenue
  'complainer', // high complaint rate
]);

export interface PersonaSignals {
  avgOpenRate: number;
  avgClickRate: number;
  purchaseFrequency: number;
  avgOrderValue: number;
  discountSensitivity: number; // 0-1: 1 = only buys with discount
  engagementTrend: 'rising' | 'stable' | 'declining';
  preferredChannel: string;
  bestSendDay: string;
  bestSendHour: number;
}

export const contactPersonas = pgTable(
  'contact_personas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    persona: personaTypeEnum('persona').notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull().default('0.5'),
    signals: jsonb('signals')
      .$type<PersonaSignals>()
      .notNull()
      .default({} as PersonaSignals),
    aiReasoning: text('ai_reasoning'),
    overriddenBy: uuid('overridden_by'),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    orgContactIdx: index('contact_personas_org_contact_idx').on(t.orgId, t.contactId),
    personaIdx: index('contact_personas_persona_idx').on(t.orgId, t.persona),
  }),
);

export type ContactPersona = typeof contactPersonas.$inferSelect;
