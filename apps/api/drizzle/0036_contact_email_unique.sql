-- Z146. One address, one contact.
-- contacts had only a plain (org_id, email) index and kept the address as it
-- was typed, so a contact could be created for an address the org already held:
-- active, beside the unsubscribed, pending, bounced or complained original, and
-- a campaign mailed it (measured on master by sending). The provider migrations
-- upserted on (org_id, email) and Postgres refused every insert — no index
-- matched the ON CONFLICT target.
--
-- Every address is stored as normalizeEmail() writes it (lib/email-address.ts:
-- trim + lower case), and a partial unique index allows one live contact per
-- address. Deleted (deleted_at) and anonymised (email NULL) contacts are left
-- out, so their address can be created again.
--
-- Nothing is deleted or merged. When normalising leaves two live contacts with
-- one address, the migration fails with the number of such groups and changes
-- nothing: which contact keeps the history, the lists and the events is a
-- decision of its own.
--
-- The new index serves every lookup by address (services/contacts/by-email.ts
-- always adds deleted_at IS NULL), so it replaces contacts_org_email_idx. The
-- DROP is last: it takes an AccessExclusiveLock on contacts, held to the end of
-- the migration transaction.
--
-- Locks: the UPDATE takes RowExclusiveLock, CREATE UNIQUE INDEX a ShareLock
-- (writes to contacts wait, reads do not), DROP INDEX an AccessExclusiveLock
-- (reads wait too, from there to the commit). lock_timeout makes the migration
-- fail rather than queue behind a long transaction.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
UPDATE "contacts" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"));--> statement-breakpoint
DO $$
DECLARE
  duplicate_groups integer;
BEGIN
  SELECT count(*) INTO duplicate_groups FROM (
    SELECT 1 FROM "contacts"
    WHERE "deleted_at" IS NULL AND "email" IS NOT NULL
    GROUP BY "org_id", "email"
    HAVING count(*) > 1
  ) AS d;
  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION 'contacts: % address group(s) belong to more than one live contact after normalising case and spaces; nothing was changed. Merge them, then run this migration again.', duplicate_groups;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_org_email_uq" ON "contacts" USING btree ("org_id","email") WHERE deleted_at IS NULL AND email IS NOT NULL;--> statement-breakpoint
DROP INDEX "contacts_org_email_idx";--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;
