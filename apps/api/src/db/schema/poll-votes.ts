import { pgTable, uuid, text, integer, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { campaigns } from './campaigns.js';
import { contacts } from './contacts.js';

/**
 * One row per recipient per poll: what they answered.
 *
 * ─── Why a table when the answer also goes on the contact ────────────────────
 *
 * The answer is written to `contacts.custom_fields` as well, because that is
 * what the segment builder reads (`services/segments/query-builder.ts:91`
 * emits `contacts.custom_fields ->> key`). But a custom field cannot do the
 * other two jobs:
 *
 *   - Counting. The report is "how many chose each answer, in this campaign".
 *     A contact carries its latest answer, not which campaign asked, and a
 *     contact that was sent two polls carries two unrelated keys.
 *   - Idempotency. Mail clients and antivirus scanners prefetch links; Outlook
 *     Safe Links fetches every URL in a message before the human sees it. A
 *     vote therefore has to be safe to record twice, and the only way to say
 *     "twice" is to have a row to conflict with.
 *
 * ─── The unique index is the whole mechanism ─────────────────────────────────
 *
 * (campaign_id, block_id, contact_id) — one answer per person per poll per
 * campaign. A second click, whether it is the same answer prefetched or a
 * different one clicked deliberately, hits the conflict and is ignored: first
 * vote wins. That is a decision, not an accident — see the route.
 *
 * `option_index` rather than the label: labels are user text and can be edited
 * after the send, which would silently rewrite history. The index is what the
 * link committed to and what the signature covers. `option_label` is stored
 * alongside as a snapshot so a report stays readable after an edit.
 */
export const pollVotes = pgTable(
  'poll_votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    /** The poll block's id inside the campaign schema. */
    blockId: text('block_id').notNull(),
    optionIndex: integer('option_index').notNull(),
    /** The label as it read at the moment of the vote. */
    optionLabel: text('option_label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oneVotePerContact: unique('poll_votes_one_per_contact').on(
      t.campaignId,
      t.blockId,
      t.contactId,
    ),
    byCampaign: index('poll_votes_campaign_idx').on(t.campaignId, t.blockId),
  }),
);

export type PollVote = typeof pollVotes.$inferSelect;
export type NewPollVote = typeof pollVotes.$inferInsert;
