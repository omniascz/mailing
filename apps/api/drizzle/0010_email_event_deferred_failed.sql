-- Two new email_event_type values: 'deferred' and 'failed'.
--
--   deferred — an attempt failed and another is coming (a 4xx, or a transport
--              error). Written once per non-final attempt.
--   failed   — retries ran out without the far side ever answering: timeout,
--              DNS failure, unreachable host.
--
-- Neither is a bounce. Every deliverability consumer filters
-- `event_type = 'bounce'`, so recording a retry there made a greylisted
-- message look like six rejections, and the transport-error branch — which
-- wrote nothing at all — left network faults invisible.
--
-- Additive: no existing row changes, and no consumer counts a value it has
-- never seen. ClickHouse stores event_type as LowCardinality(String) rather
-- than an enum, so the replica needs no matching change.
--
-- IF NOT EXISTS on both, so re-running against a database where they were
-- added by hand is a no-op rather than an error.
ALTER TYPE "public"."email_event_type" ADD VALUE IF NOT EXISTS 'deferred';--> statement-breakpoint
ALTER TYPE "public"."email_event_type" ADD VALUE IF NOT EXISTS 'failed';
