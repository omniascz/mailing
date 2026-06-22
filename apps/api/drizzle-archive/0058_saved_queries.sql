-- #272/L4-4 Saved NL queries (Aura Analytics)

CREATE TABLE IF NOT EXISTS "saved_queries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "question" text NOT NULL,
  "visibility" varchar(16) NOT NULL DEFAULT 'org',
  "last_sql" text,
  "last_chart_type" varchar(32),
  "run_count" integer NOT NULL DEFAULT 0,
  "last_run_at" timestamp with time zone,
  "last_run_duration_ms" integer,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "saved_queries_org_idx" ON "saved_queries" ("org_id");
CREATE INDEX IF NOT EXISTS "saved_queries_owner_idx" ON "saved_queries" ("owner_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "saved_queries_org_name_uq" ON "saved_queries" ("org_id", "name");
