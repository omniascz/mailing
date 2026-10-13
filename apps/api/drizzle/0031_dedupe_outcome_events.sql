-- Z138. The events that happen once to one delivery are stored once, as
-- `send` has been since 0030: `deliver`, `failed` and `complaint` per
-- (org, message id, recipient), `bounce` per bounce type as well. `deferred`,
-- `open`, `click` and `unsubscribe` repeat legitimately and stay unconstrained.
--
-- Rows written before 0030 carry no recipient, so the indexes below do not
-- constrain them (NULLs are distinct). Their duplicates are deleted where one
-- is certainly a duplicate: the same event type, message and contact (and
-- bounce type) twice — a stalled mta-sender job run again. A row with no
-- contact (a transactional message with no matching contact) cannot be told
-- from another recipient of the same message, so it is left as it is.
DELETE FROM "email_events" e
USING "email_events" k
WHERE e."event_type" IN ('deliver', 'failed', 'complaint', 'bounce')
  AND k."event_type" = e."event_type"
  AND e."org_id" = k."org_id"
  AND e."message_id" = k."message_id"
  AND e."contact_id" = k."contact_id"
  AND e."bounce_type" IS NOT DISTINCT FROM k."bounce_type"
  AND e."recipient" IS NULL AND k."recipient" IS NULL
  AND (k."created_at", k."id") < (e."created_at", e."id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_events_outcome_uq" ON "email_events" USING btree ("org_id","event_type","message_id","recipient") WHERE "email_events"."event_type" IN ('deliver', 'failed', 'complaint');--> statement-breakpoint
CREATE UNIQUE INDEX "email_events_bounce_uq" ON "email_events" USING btree ("org_id","message_id","recipient","bounce_type") WHERE "email_events"."event_type" = 'bounce';
