-- #356/L4-5 Data Sets — named parametrised queries (Data Hub)

DO $$ BEGIN
  CREATE TYPE "data_set_kind" AS ENUM ('sql', 'segment', 'aggregate');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "data_sets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "kind" "data_set_kind" NOT NULL DEFAULT 'sql',
  "parameters" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "definition" text NOT NULL,
  "columns" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "cache_ttl_seconds" integer NOT NULL DEFAULT 300,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "data_sets_org_name_uq" ON "data_sets" ("org_id", "name");
CREATE INDEX IF NOT EXISTS "data_sets_org_idx" ON "data_sets" ("org_id");
