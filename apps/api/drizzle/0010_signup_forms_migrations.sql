-- Migration 0010: Signup forms + migration jobs (tasks 6.5, 6.7)

DO $$ BEGIN
  CREATE TYPE "embed_type" AS ENUM ('inline', 'popup', 'slide', 'floating');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "migration_job_status" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Signup form definitions
CREATE TABLE IF NOT EXISTS "signup_forms" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "list_id"      uuid,
  "name"         varchar(255) NOT NULL,
  "fields"       jsonb NOT NULL DEFAULT '[]',
  "embed_type"   "embed_type" NOT NULL DEFAULT 'inline',
  "config"       jsonb NOT NULL DEFAULT '{}',
  "active"       boolean NOT NULL DEFAULT true,
  "view_count"   integer NOT NULL DEFAULT 0,
  "submit_count" integer NOT NULL DEFAULT 0,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "signup_forms_org_id_idx" ON "signup_forms" ("org_id");
CREATE INDEX IF NOT EXISTS "signup_forms_active_idx"  ON "signup_forms" ("active");

-- Signup form submissions
CREATE TABLE IF NOT EXISTS "signup_form_submissions" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "form_id"      uuid NOT NULL REFERENCES "signup_forms"("id") ON DELETE CASCADE,
  "org_id"       uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id"   uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
  "data"         jsonb NOT NULL DEFAULT '{}',
  "ip_address"   varchar(45),
  "user_agent"   varchar(512),
  "submitted_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "signup_form_submissions_form_id_idx"    ON "signup_form_submissions" ("form_id");
CREATE INDEX IF NOT EXISTS "signup_form_submissions_org_id_idx"     ON "signup_form_submissions" ("org_id");
CREATE INDEX IF NOT EXISTS "signup_form_submissions_contact_id_idx" ON "signup_form_submissions" ("contact_id");

-- Migration jobs (Mailchimp, future providers)
CREATE TABLE IF NOT EXISTS "migration_jobs" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "type"          varchar(50) NOT NULL,
  "status"        "migration_job_status" NOT NULL DEFAULT 'pending',
  "progress"      jsonb NOT NULL DEFAULT '{}',
  "error_message" varchar(2048),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "completed_at"  timestamptz
);

CREATE INDEX IF NOT EXISTS "migration_jobs_org_id_idx" ON "migration_jobs" ("org_id");
CREATE INDEX IF NOT EXISTS "migration_jobs_status_idx" ON "migration_jobs" ("status");
