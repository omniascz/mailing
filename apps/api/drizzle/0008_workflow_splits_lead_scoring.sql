-- Migration 0008: A/B split columns on workflow_runs + lead scoring tables (tasks 5.7, 5.10)

-- Convert lead_score from varchar to integer for proper numeric operations.
-- Drop default first so the type-change USING cast doesn't stumble on the
-- old varchar default.
ALTER TABLE "contacts" ALTER COLUMN "lead_score" DROP DEFAULT;
ALTER TABLE "contacts" ALTER COLUMN "lead_score" TYPE integer USING ("lead_score"::integer);
ALTER TABLE "contacts" ALTER COLUMN "lead_score" SET DEFAULT 0;


-- Add A/B split and goal conversion columns to workflow_runs
ALTER TABLE "workflow_runs"
  ADD COLUMN IF NOT EXISTS "split_branch"  varchar(100),
  ADD COLUMN IF NOT EXISTS "converted"     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "converted_at"  timestamptz;

-- Lead score rules (per-org event point definitions)
CREATE TABLE IF NOT EXISTS "lead_score_rules" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "event_type"   varchar(100) NOT NULL,
  "points"       integer NOT NULL,
  "decay_days"   integer NOT NULL DEFAULT 90,
  "active"       boolean NOT NULL DEFAULT true,
  "description"  varchar(255),
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "lead_score_rules_org_id_idx"    ON "lead_score_rules" ("org_id");
CREATE INDEX IF NOT EXISTS "lead_score_rules_event_type_idx" ON "lead_score_rules" ("event_type");

-- Lead score events (audit trail per contact)
CREATE TABLE IF NOT EXISTS "lead_score_events" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id"    uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "event_type"    varchar(100) NOT NULL,
  "points_delta"  integer NOT NULL,
  "score_after"   integer NOT NULL,
  "metadata"      jsonb,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "lead_score_events_contact_id_idx" ON "lead_score_events" ("contact_id");
CREATE INDEX IF NOT EXISTS "lead_score_events_org_id_idx"     ON "lead_score_events" ("org_id");
CREATE INDEX IF NOT EXISTS "lead_score_events_created_at_idx" ON "lead_score_events" ("created_at");
