-- Migration 0006: AI usage tracking table (task 4.11)

DO $$ BEGIN
  CREATE TYPE "ai_feature" AS ENUM (
    'segment_from_description',
    'generate_email',
    'subject_lines',
    'brand_voice',
    'campaign_summary',
    'translate',
    'html_to_blocks',
    'product_scraper',
    'accessibility_check',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ai_usage" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"          uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "model"           varchar(100) NOT NULL,
  "feature"         "ai_feature" NOT NULL DEFAULT 'other',
  "input_tokens"    integer NOT NULL DEFAULT 0,
  "output_tokens"   integer NOT NULL DEFAULT 0,
  "cost_usd"        numeric(10,6) NOT NULL DEFAULT 0,
  "cached"          varchar(5) NOT NULL DEFAULT 'false',
  "created_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ai_usage_org_id_idx"     ON "ai_usage" ("org_id");
CREATE INDEX IF NOT EXISTS "ai_usage_feature_idx"    ON "ai_usage" ("feature");
CREATE INDEX IF NOT EXISTS "ai_usage_created_at_idx" ON "ai_usage" ("created_at");
