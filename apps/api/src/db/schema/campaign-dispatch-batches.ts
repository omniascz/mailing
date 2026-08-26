import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
  integer,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { campaigns } from './campaigns.js';

/**
 * Ledger of batch-sender jobs a dispatch has already handed to the queue.
 *
 * The campaign-splitter and ab-winner workers both end in
 * `batchSenderQueue.addBulk(...)`. Neither used to record that it had done so,
 * so a second run of the same job — a BullMQ retry after the enqueue
 * succeeded but something later in the handler threw — enqueued the whole set
 * again. Measured on a real worker: 2500 contacts split into 3 batches, run
 * twice, 6 batches in the queue. Every one of those contacts gets the campaign
 * twice.
 *
 * BullMQ's own deduplication is not enough on its own. A duplicate `jobId` is
 * silently ignored while the job is still in Redis (measured: the first add
 * wins and its data is not overwritten, and `addBulk` behaves the same way),
 * but `removeOnComplete` deletes the job once it finishes — after which the
 * same jobId runs again (measured). Retention is `{ count: 1000, age: 86400 }`,
 * so on a campaign of more than a thousand batches the earliest ones are
 * evicted while the send is still in progress. The queue therefore cannot be
 * the record of what has been sent; this table is.
 *
 * `dispatch_id` scopes the ledger to one attempt at sending, not to the
 * campaign. It is `${job.id}:${job.timestamp}` — both stable across retries of
 * a job and different for every fresh enqueue, so a retry is recognised while
 * a legitimate resend (or a second A/B winner dispatch) starts with an empty
 * ledger and is free to enqueue everything again.
 *
 * `batch_key` identifies a batch within the dispatch: `${index}` for a plain
 * split, `v${variantId}-${index}` for an A/B variant, `w${index}` for a winner
 * dispatch.
 *
 * `enqueued_at` is the confirmation. A row is claimed first and confirmed after
 * `addBulk` returns, so a claimed-but-unconfirmed row is one we cannot tell
 * either way about; those are re-enqueued rather than dropped, since the
 * deterministic jobId still covers the case where the job is in fact in flight.
 */
export const campaignDispatchBatches = pgTable(
  'campaign_dispatch_batches',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** One send attempt — `${job.id}:${job.timestamp}` of the producing job. */
    dispatchId: varchar('dispatch_id', { length: 128 }).notNull(),
    /** Batch within the dispatch. */
    batchKey: varchar('batch_key', { length: 128 }).notNull(),
    /** Set once `addBulk` has returned for this batch. */
    enqueuedAt: timestamp('enqueued_at', { withTimezone: true }),

    /**
     * Set once the batch-sender job for this batch has finished — whether it
     * sent anything or gave up. This is the row's completion flag, and the
     * campaign's pending-batch counter is only decremented on the write that
     * transitions it from NULL, so a job reported twice cannot decrement twice.
     */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /**
     * What the batch-sender returned. It has always computed these and always
     * thrown them away: the numbers went into the BullMQ job's return value,
     * which `removeOnComplete` deletes within the hour. They are the only
     * record of how much of a campaign actually went out, and the sent/failed
     * decision at the end of a dispatch reads them.
     */
    sentCount: integer('sent_count'),
    skippedCount: integer('skipped_count'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('campaign_dispatch_batches_uidx').on(t.dispatchId, t.batchKey),
    index('campaign_dispatch_batches_campaign_idx').on(t.campaignId),
    index('campaign_dispatch_batches_org_idx').on(t.orgId),
  ],
);
