-- Z140. One ending per message and recipient: a delivery, a bounce said in
-- the SMTP session, or a failure — whichever came first, nothing after it. A
-- job processed again after a bounce found the address suppressed and stored
-- `failed` beside the bounce (measured on master), a second ending. A DSN
-- (metadata source 'verp') is said after the receiving server accepted the
-- message, so it is not an ending of the attempt: a delivery and then a DSN
-- bounce are both kept.
--
-- The type is tested through an IMMUTABLE function comparing text, for the
-- reason in 0031: 'failed' was added to the enum by 0010, and on a fresh
-- database every migration runs in one transaction.
CREATE OR REPLACE FUNCTION email_event_is_ending(t email_event_type) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT t::text IN ('deliver', 'bounce', 'failed') $$;--> statement-breakpoint
-- Second endings already stored (rows with a recipient, written since 0030):
-- keep the first, delete the rest, so the index can be built. Rows without a
-- recipient are not constrained (NULLs are distinct) and are left alone.
DELETE FROM "email_events" e
USING "email_events" k
WHERE email_event_is_ending(e."event_type") AND email_event_is_ending(k."event_type")
  AND coalesce(e."metadata"->>'source', '') <> 'verp'
  AND coalesce(k."metadata"->>'source', '') <> 'verp'
  AND e."org_id" = k."org_id" AND e."message_id" = k."message_id"
  AND e."recipient" = k."recipient"
  AND (k."created_at", k."id") < (e."created_at", e."id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_events_ending_uq" ON "email_events" USING btree ("org_id","message_id","recipient") WHERE email_event_is_ending("email_events"."event_type") AND coalesce("email_events"."metadata"->>'source', '') <> 'verp';
