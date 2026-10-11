ALTER TABLE "api_keys" ADD COLUMN "role" varchar(16);--> statement-breakpoint
-- Z130: every existing key acted as admin. From here a key acts with its
-- creator's role in the key's organisation, never more. Backfill that role the
-- way /me/orgs/switch resolves it (primary org from users.role, any other org
-- from an active organization_members row), capped at owner: a platform
-- system_admin's key is an owner's key, not a platform one. Keys whose creator
-- is not a member of the key's organisation stay NULL and act as viewer
-- (lookupApiKey in services/webhooks/index.ts).
UPDATE "api_keys" AS k
SET "role" = CASE WHEN r."role" = 'system_admin' THEN 'owner' ELSE r."role" END
FROM (
  SELECT k2."id" AS "key_id",
         COALESCE(
           (SELECT u."role"::text FROM "users" AS u WHERE u."id" = k2."user_id" AND u."org_id" = k2."org_id"),
           (SELECT m."role" FROM "organization_members" AS m
             WHERE m."user_id" = k2."user_id" AND m."org_id" = k2."org_id" AND m."status" = 'active'
             LIMIT 1)
         ) AS "role"
  FROM "api_keys" AS k2
  WHERE k2."role" IS NULL
) AS r
WHERE k."id" = r."key_id" AND r."role" IS NOT NULL;
