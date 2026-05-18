-- Migration 0007: Workflow engine tables (tasks 5.2, 5.3, 5.4)

DO $$ BEGIN
  CREATE TYPE "workflow_status" AS ENUM ('draft', 'active', 'inactive', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "workflow_run_status" AS ENUM ('pending', 'running', 'waiting', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "workflow_trigger_type" AS ENUM (
    'list_subscribe',
    'tag_added',
    'date_field',
    'api_event',
    'form_submit',
    'purchase_event',
    'phone_status_change',
    'manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Workflow definitions
CREATE TABLE IF NOT EXISTS "workflows" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"           uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"             varchar(255) NOT NULL,
  "description"      varchar(1024),
  "status"           "workflow_status" NOT NULL DEFAULT 'draft',
  "nodes"            jsonb NOT NULL DEFAULT '[]',
  "edges"            jsonb NOT NULL DEFAULT '[]',
  "trigger_type"     "workflow_trigger_type" NOT NULL DEFAULT 'manual',
  "trigger_config"   jsonb NOT NULL DEFAULT '{}',
  "total_runs"       integer NOT NULL DEFAULT 0,
  "completed_runs"   integer NOT NULL DEFAULT 0,
  "failed_runs"      integer NOT NULL DEFAULT 0,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now(),
  "deleted_at"       timestamptz
);

CREATE INDEX IF NOT EXISTS "workflows_org_id_idx"       ON "workflows" ("org_id");
CREATE INDEX IF NOT EXISTS "workflows_status_idx"        ON "workflows" ("status");
CREATE INDEX IF NOT EXISTS "workflows_trigger_type_idx"  ON "workflows" ("trigger_type");

-- Workflow runs (one per contact per workflow execution)
CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflow_id"         uuid NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
  "org_id"              uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id"          uuid REFERENCES "contacts"("id") ON DELETE CASCADE,
  "status"              "workflow_run_status" NOT NULL DEFAULT 'pending',
  "current_node_id"     varchar(255),
  "data"                jsonb NOT NULL DEFAULT '{}',
  "next_execution_at"   timestamptz,
  "error_message"       varchar(2048),
  "started_at"          timestamptz,
  "completed_at"        timestamptz,
  "created_at"          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "workflow_runs_workflow_id_idx"       ON "workflow_runs" ("workflow_id");
CREATE INDEX IF NOT EXISTS "workflow_runs_contact_id_idx"        ON "workflow_runs" ("contact_id");
CREATE INDEX IF NOT EXISTS "workflow_runs_status_idx"            ON "workflow_runs" ("status");
CREATE INDEX IF NOT EXISTS "workflow_runs_next_execution_at_idx" ON "workflow_runs" ("next_execution_at");
CREATE INDEX IF NOT EXISTS "workflow_runs_org_id_idx"            ON "workflow_runs" ("org_id");

-- Custom API events (trigger source for api_event trigger type)
CREATE TABLE IF NOT EXISTS "workflow_events" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"      uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id"  uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
  "event_name"  varchar(255) NOT NULL,
  "properties"  jsonb NOT NULL DEFAULT '{}',
  "processed"   boolean NOT NULL DEFAULT false,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "workflow_events_org_id_idx"     ON "workflow_events" ("org_id");
CREATE INDEX IF NOT EXISTS "workflow_events_contact_id_idx" ON "workflow_events" ("contact_id");
CREATE INDEX IF NOT EXISTS "workflow_events_event_name_idx" ON "workflow_events" ("event_name");
CREATE INDEX IF NOT EXISTS "workflow_events_processed_idx"  ON "workflow_events" ("processed");
CREATE INDEX IF NOT EXISTS "workflow_events_created_at_idx" ON "workflow_events" ("created_at");
