-- Z144. A suppression blocks an address whatever case it was written in.
-- Writers now store lower(trim(email)) and readers match lower() on both
-- sides (services/suppressions/email.ts); this lower-cases the rows written
-- before that, and indexes the lookup.
--
-- No row is deleted. If two rows of one org and reason differ only in case,
-- the UPDATE fails on suppressions_org_email_reason_idx and the whole
-- migration rolls back: merging them is a decision, not a migration (0 such
-- pairs in a clean or a seeded database, measured).
--
-- Locks, measured on 100 000 rows of one org (39 MB table): the UPDATE takes
-- RowExclusiveLock (29 ms with 0 rows to change, 917 ms with 50 000), the
-- CREATE INDEX ShareLock — writes to suppressions wait, reads do not — for
-- 194-341 ms. Both are held to the end of the migration transaction.
-- lock_timeout makes the migration fail rather than queue behind a long
-- transaction on suppressions and block every writer queued behind it.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
UPDATE "suppressions" SET "email" = lower("email") WHERE "email" <> lower("email");--> statement-breakpoint
CREATE INDEX "suppressions_org_lower_email_idx" ON "suppressions" USING btree ("org_id",lower("email"));--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;
