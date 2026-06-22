-- #343 Teams
CREATE TABLE IF NOT EXISTS "teams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "slug" varchar(128) NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "teams_org_slug_uq" ON "teams" ("org_id", "slug");
CREATE INDEX IF NOT EXISTS "teams_org_idx" ON "teams" ("org_id");

CREATE TABLE IF NOT EXISTS "team_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "team_role" varchar(32) NOT NULL DEFAULT 'member',
  "cross_team_access" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "team_members_team_user_uq" ON "team_members" ("team_id", "user_id");
CREATE INDEX IF NOT EXISTS "team_members_user_idx" ON "team_members" ("user_id");

-- Add team_id columns to entities we want to scope by team
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "team_id" uuid REFERENCES "teams"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "contacts_team_idx" ON "contacts" ("team_id");

ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "team_id" uuid REFERENCES "teams"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "deals_team_idx" ON "deals" ("team_id");

ALTER TABLE "helpdesk_tickets" ADD COLUMN IF NOT EXISTS "team_id" uuid REFERENCES "teams"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "helpdesk_tickets_team_idx" ON "helpdesk_tickets" ("team_id");

-- #344 Field-level permissions
CREATE TABLE IF NOT EXISTS "field_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "role" varchar(64) NOT NULL,
  "entity" varchar(64) NOT NULL,
  "readable" jsonb NOT NULL DEFAULT '["*"]'::jsonb,
  "hidden" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "writable" jsonb NOT NULL DEFAULT '["*"]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "field_permissions_org_role_entity_uq"
  ON "field_permissions" ("org_id", "role", "entity");

-- #347 Custom channels
CREATE TABLE IF NOT EXISTS "custom_channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "slug" varchar(64) NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text,
  "outbound_url" varchar(1024) NOT NULL,
  "shared_secret" varchar(128) NOT NULL,
  "message_schema" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "rate_limits" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "custom_channels_org_slug_uq"
  ON "custom_channels" ("org_id", "slug");
CREATE INDEX IF NOT EXISTS "custom_channels_org_idx" ON "custom_channels" ("org_id");

-- #350 Calculated properties
DO $$ BEGIN
  CREATE TYPE "calc_prop_entity" AS ENUM ('contact', 'deal', 'account');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE "calc_prop_result_type" AS ENUM ('number', 'string', 'boolean', 'date');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "calculated_properties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "entity" "calc_prop_entity" NOT NULL,
  "key" varchar(64) NOT NULL,
  "label" varchar(128) NOT NULL,
  "description" text,
  "result_type" "calc_prop_result_type" NOT NULL,
  "formula" jsonb NOT NULL,
  "cache_strategy" varchar(16) NOT NULL DEFAULT 'lazy',
  "cache_ttl_seconds" integer NOT NULL DEFAULT 3600,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "calc_props_org_entity_key_uq"
  ON "calculated_properties" ("org_id", "entity", "key");
CREATE INDEX IF NOT EXISTS "calc_props_org_idx" ON "calculated_properties" ("org_id");

CREATE TABLE IF NOT EXISTS "calculated_property_values" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "prop_id" uuid NOT NULL REFERENCES "calculated_properties"("id") ON DELETE CASCADE,
  "entity_id" uuid NOT NULL,
  "value" jsonb,
  "computed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "calc_prop_values_prop_entity_uq"
  ON "calculated_property_values" ("prop_id", "entity_id");
CREATE INDEX IF NOT EXISTS "calc_prop_values_org_idx" ON "calculated_property_values" ("org_id");

-- #355 Bi-directional CRM data sync
DO $$ BEGIN
  CREATE TYPE "crm_sync_provider" AS ENUM ('hubspot', 'salesforce', 'pipedrive');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE "crm_sync_entity" AS ENUM ('contact', 'deal', 'account');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE "crm_sync_direction" AS ENUM ('in', 'out', 'both');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "data_sync_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "provider" "crm_sync_provider" NOT NULL,
  "entity" "crm_sync_entity" NOT NULL,
  "direction" "crm_sync_direction" NOT NULL DEFAULT 'both',
  "field_map" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "pull_filter" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "enabled" boolean NOT NULL DEFAULT true,
  "last_full_sync_at" timestamp with time zone,
  "last_incremental_sync_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "data_sync_mappings_org_provider_entity_uq"
  ON "data_sync_mappings" ("org_id", "provider", "entity");
CREATE INDEX IF NOT EXISTS "data_sync_mappings_org_idx" ON "data_sync_mappings" ("org_id");

CREATE TABLE IF NOT EXISTS "data_sync_pairs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "provider" "crm_sync_provider" NOT NULL,
  "entity" "crm_sync_entity" NOT NULL,
  "local_id" uuid NOT NULL,
  "remote_id" varchar(128) NOT NULL,
  "remote_hash" varchar(64),
  "last_synced_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "data_sync_pairs_provider_entity_local_uq"
  ON "data_sync_pairs" ("provider", "entity", "local_id");
CREATE UNIQUE INDEX IF NOT EXISTS "data_sync_pairs_provider_entity_remote_uq"
  ON "data_sync_pairs" ("provider", "entity", "remote_id");
CREATE INDEX IF NOT EXISTS "data_sync_pairs_org_idx" ON "data_sync_pairs" ("org_id");

CREATE TABLE IF NOT EXISTS "data_sync_conflicts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "pair_id" uuid NOT NULL REFERENCES "data_sync_pairs"("id") ON DELETE CASCADE,
  "field" varchar(128) NOT NULL,
  "local_value" jsonb,
  "remote_value" jsonb,
  "resolved" boolean NOT NULL DEFAULT false,
  "resolution" varchar(32),
  "attempts" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "resolved_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "data_sync_conflicts_org_idx" ON "data_sync_conflicts" ("org_id");
CREATE INDEX IF NOT EXISTS "data_sync_conflicts_pair_idx" ON "data_sync_conflicts" ("pair_id");
CREATE INDEX IF NOT EXISTS "data_sync_conflicts_unresolved_idx" ON "data_sync_conflicts" ("org_id", "resolved");

-- #357 Programmable data pipelines
DO $$ BEGIN
  CREATE TYPE "data_pipeline_status" AS ENUM ('draft', 'active', 'inactive');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE "data_pipeline_source" AS ENUM ('contacts', 'email_events', 'deals', 'orders', 'cdp_events');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE "data_pipeline_trigger" AS ENUM ('manual', 'scheduled', 'event');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "data_pipelines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" varchar(128) NOT NULL,
  "description" text,
  "source" "data_pipeline_source" NOT NULL,
  "steps" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "trigger" "data_pipeline_trigger" NOT NULL DEFAULT 'manual',
  "schedule" varchar(64),
  "status" "data_pipeline_status" NOT NULL DEFAULT 'draft',
  "sink_webhook_url" varchar(1024),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "data_pipelines_org_name_uq"
  ON "data_pipelines" ("org_id", "name");
CREATE INDEX IF NOT EXISTS "data_pipelines_org_idx" ON "data_pipelines" ("org_id");
CREATE INDEX IF NOT EXISTS "data_pipelines_status_idx" ON "data_pipelines" ("status");

CREATE TABLE IF NOT EXISTS "data_pipeline_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "pipeline_id" uuid NOT NULL REFERENCES "data_pipelines"("id") ON DELETE CASCADE,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "input_count" varchar(16),
  "output_count" varchar(16),
  "error_message" text,
  "preview" jsonb,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "data_pipeline_runs_pipeline_idx" ON "data_pipeline_runs" ("pipeline_id");
CREATE INDEX IF NOT EXISTS "data_pipeline_runs_org_idx" ON "data_pipeline_runs" ("org_id");
