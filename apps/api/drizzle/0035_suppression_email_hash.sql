-- Z145. An erased person stays suppressed, and the suppression blocks.
-- anonymizeContact writes a suppression with email NULL and the address's
-- SHA-256 in notes ('gdpr_anonymized:<hex>'), which no send decision read: the
-- same address created again got campaigns, flows and receipts (measured on
-- master by sending). The hash moves to a column every send decision matches
-- (services/suppressions/email.ts) and that DELETE /suppressions refuses.
--
-- Filled from the notes of the rows written before; notes stay as they are and
-- no row is deleted. The hash in notes is sha256(lower(trim(address))) in hex,
-- the same as suppressionEmailHash(), so it is copied, not recomputed.
--
-- IF NOT EXISTS: the integration test runs this file again over a row written
-- the pre-migration way, to prove the backfill matches it.
--
-- Locks: ADD COLUMN without a default is a catalogue change under
-- AccessExclusiveLock, the UPDATE takes RowExclusiveLock and CREATE INDEX a
-- ShareLock, all held to the end of the migration transaction — so reads of
-- suppressions (the send gates) wait for the whole of it. Measured on 120 000
-- rows (100 000 in one org): 0 erasure rows — ADD COLUMN 0.5 ms, UPDATE 8 ms,
-- CREATE INDEX 36 ms; 50 000 erasure rows — UPDATE 3.4 s, CREATE INDEX 224 ms.
-- lock_timeout makes the migration fail rather than queue behind a long
-- transaction and block every writer queued behind it.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "suppressions" ADD COLUMN IF NOT EXISTS "email_hash" text;--> statement-breakpoint
UPDATE "suppressions"
SET "email_hash" = substring("notes" from '^gdpr_anonymized:([0-9a-f]{64})$')
WHERE "email_hash" IS NULL AND "notes" ~ '^gdpr_anonymized:[0-9a-f]{64}$';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppressions_org_email_hash_idx" ON "suppressions" USING btree ("org_id","email_hash");--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;
