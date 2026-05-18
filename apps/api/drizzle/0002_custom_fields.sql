--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'number', 'date', 'select', 'boolean');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_field_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" varchar(100) NOT NULL,
  "key" varchar(100) NOT NULL,
  "field_type" "custom_field_type" NOT NULL,
  "options" jsonb,
  "required" boolean DEFAULT false NOT NULL,
  "default_value" varchar(1000),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "custom_field_defs_org_key_idx" ON "custom_field_definitions" ("org_id", "key");
