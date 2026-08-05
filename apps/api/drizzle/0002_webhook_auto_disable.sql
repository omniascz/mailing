ALTER TABLE "webhooks" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "disabled_reason" varchar(255);--> statement-breakpoint
-- Reconcile the deliveries stranded by the old retry design.
--
-- deliverWebhook used to set status='retrying' with a nextRetryAt, and
-- processRetryQueue was supposed to pick those rows back up. It had no caller,
-- so every row that failed its first attempt stayed 'retrying' forever: not
-- delivered, not failed, not scheduled.
--
-- They are marked failed rather than re-queued on purpose. Re-queuing would
-- replay events that are potentially months old at a receiver that has long
-- since moved on, and a burst of stale events is worse for the customer than
-- the ones they already did not get. The status now reflects the truth.
UPDATE "webhook_deliveries"
SET status = 'failed',
    next_retry_at = NULL,
    response_body = COALESCE(response_body, '') ||
      ' [reconciled: stranded in retrying by a retry loop that had no runner]'
WHERE status = 'retrying';
