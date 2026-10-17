-- Z180. An erasure keeps a fingerprint of the phone number too, and a
-- marketing SMS or WhatsApp to that number does not go. anonymizeContact kept
-- the e-mail address's fingerprint only (email_hash, 0035) and deleted the
-- number without one, so the same number on a contact created again got
-- campaigns and flows (measured on master by sending). phone_hash is
-- suppressionPhoneHash() (services/suppressions/phone.ts), an HMAC under
-- SUPPRESSION_HASH_KEY; only anonymizeContact writes it, on a 'manual' row of
-- its own (not the address's row, which a double opt-in confirmation deletes).
--
-- No backfill, and no row is changed: an erasure written before this has no
-- number left to take a fingerprint of.
--
-- Locks: ADD COLUMN without a default is a catalogue change, and CREATE INDEX
-- takes a ShareLock; both under the AccessExclusiveLock of the ALTER, held to
-- the end of the migration transaction — so reads of suppressions (the send
-- gates) wait for the whole of it. Measured in the reports of Z179/Z180 (empty table
-- and 50 000 rows). lock_timeout makes the migration fail rather than queue
-- behind a long transaction and block every reader queued behind it.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "suppressions" ADD COLUMN "phone_hash" text;--> statement-breakpoint
CREATE INDEX "suppressions_org_phone_hash_idx" ON "suppressions" USING btree ("org_id","phone_hash");--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;
