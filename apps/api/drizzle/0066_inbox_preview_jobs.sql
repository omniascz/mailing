CREATE TABLE IF NOT EXISTS "inbox_preview_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "provider" varchar(32) NOT NULL,
  "provider_job_id" varchar(128),
  "subject" varchar(255),
  "html" text NOT NULL,
  "clients" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "results" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "inbox_preview_jobs_org_idx" ON "inbox_preview_jobs"("org_id");
CREATE INDEX IF NOT EXISTS "inbox_preview_jobs_campaign_idx" ON "inbox_preview_jobs"("campaign_id");
CREATE INDEX IF NOT EXISTS "inbox_preview_jobs_status_idx" ON "inbox_preview_jobs"("status");
