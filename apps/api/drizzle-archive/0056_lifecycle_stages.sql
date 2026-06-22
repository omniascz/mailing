-- #317/#394 Lifecycle stages + history

DO $$ BEGIN
  CREATE TYPE "lifecycle_stage" AS ENUM (
    'subscriber',
    'lead',
    'marketing_qualified_lead',
    'sales_qualified_lead',
    'opportunity',
    'customer',
    'evangelist',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "lifecycle_stage" "lifecycle_stage" NOT NULL DEFAULT 'subscriber';

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "lifecycle_stage_entered_at" timestamp with time zone NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS "contacts_lifecycle_stage_idx" ON "contacts" ("org_id", "lifecycle_stage");

CREATE TABLE IF NOT EXISTS "lifecycle_stage_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "from_stage" "lifecycle_stage",
  "to_stage" "lifecycle_stage" NOT NULL,
  "changed_by" uuid,
  "reason" varchar(255),
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "lifecycle_history_contact_idx" ON "lifecycle_stage_history" ("contact_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "lifecycle_history_org_idx" ON "lifecycle_stage_history" ("org_id", "occurred_at");

ALTER TYPE "workflow_trigger_type" ADD VALUE IF NOT EXISTS 'lifecycle_stage_changed';
