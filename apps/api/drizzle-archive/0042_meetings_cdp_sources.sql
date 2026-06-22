-- Migration: booking pages, event types, round-robin state, CDP source connectors
-- Tasks: #256/#257 (meetings scheduler), #261 (round-robin), #263 (CDP sources)

-- ─── Event types (#257) ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "event_types" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"                UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "owner_user_id"         UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "slug"                  VARCHAR(128) NOT NULL,
  "name"                  VARCHAR(255) NOT NULL,
  "description"           TEXT,
  "duration_minutes"      INTEGER NOT NULL DEFAULT 30,
  "buffer_before_minutes" INTEGER NOT NULL DEFAULT 0,
  "buffer_after_minutes"  INTEGER NOT NULL DEFAULT 0,
  "min_notice_minutes"    INTEGER NOT NULL DEFAULT 60,
  "max_per_day"           INTEGER NOT NULL DEFAULT 0,
  "booking_window_days"   INTEGER NOT NULL DEFAULT 60,
  "location_type"         VARCHAR(32) NOT NULL DEFAULT 'google_meet',
  "location_value"        VARCHAR(512),
  "timezone"              VARCHAR(64) NOT NULL DEFAULT 'UTC',
  "questions"             JSONB NOT NULL DEFAULT '[]',
  "team_member_ids"       JSONB NOT NULL DEFAULT '[]',
  "scheduling_type"       VARCHAR(32) NOT NULL DEFAULT 'single',
  "color"                 VARCHAR(16),
  "is_active"             BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_types_owner_slug_uq"
  ON "event_types"("owner_user_id", "slug");

CREATE INDEX IF NOT EXISTS "event_types_org_idx"
  ON "event_types"("org_id");

-- ─── Booking pages (#256) ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "booking_pages" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"          UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "owner_user_id"   UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "slug"            VARCHAR(128) NOT NULL,
  "display_name"    VARCHAR(255) NOT NULL,
  "bio"             TEXT,
  "avatar_url"      VARCHAR(1024),
  "timezone"        VARCHAR(64) NOT NULL DEFAULT 'UTC',
  "is_active"       BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_pages_slug_uq"
  ON "booking_pages"("org_id", "slug");

CREATE INDEX IF NOT EXISTS "booking_pages_user_idx"
  ON "booking_pages"("owner_user_id");

-- ─── Booking availability ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "booking_availability" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"         UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id"        UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "schedule"       JSONB NOT NULL DEFAULT '[]',
  "timezone"       VARCHAR(64) NOT NULL DEFAULT 'UTC',
  "date_overrides" JSONB NOT NULL DEFAULT '[]',
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_availability_user_uq"
  ON "booking_availability"("org_id", "user_id");

-- ─── Round-robin state (#261) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "round_robin_state" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"           UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "event_type_id"    UUID NOT NULL,
  "user_id"          UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "assignment_count" INTEGER NOT NULL DEFAULT 0,
  "last_assigned_at" TIMESTAMPTZ,
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "round_robin_state_event_user_uq"
  ON "round_robin_state"("event_type_id", "user_id");

CREATE INDEX IF NOT EXISTS "round_robin_state_org_idx"
  ON "round_robin_state"("org_id", "event_type_id");

-- ─── CDP sources (#263) ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "cdp_sources" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"         VARCHAR(255) NOT NULL,
  "kind"         VARCHAR(64) NOT NULL,
  "direction"    VARCHAR(8) NOT NULL DEFAULT 'pull',
  "config"       JSONB NOT NULL DEFAULT '{}',
  "status"       VARCHAR(16) NOT NULL DEFAULT 'active',
  "sync_cron"    VARCHAR(64) NOT NULL DEFAULT '0 * * * *',
  "last_cursor"  TEXT,
  "last_sync_at" TIMESTAMPTZ,
  "last_error"   TEXT,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "cdp_sources_org_name_uq"
  ON "cdp_sources"("org_id", "name");

CREATE INDEX IF NOT EXISTS "cdp_sources_org_kind_idx"
  ON "cdp_sources"("org_id", "kind");

CREATE INDEX IF NOT EXISTS "cdp_sources_status_idx"
  ON "cdp_sources"("status");

-- ─── CDP sync runs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "cdp_sync_runs" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "source_id"     UUID NOT NULL REFERENCES "cdp_sources"("id") ON DELETE CASCADE,
  "status"        VARCHAR(16) NOT NULL DEFAULT 'pending',
  "rows_pulled"   INTEGER NOT NULL DEFAULT 0,
  "rows_upserted" INTEGER NOT NULL DEFAULT 0,
  "rows_skipped"  INTEGER NOT NULL DEFAULT 0,
  "rows_failed"   INTEGER NOT NULL DEFAULT 0,
  "error"         TEXT,
  "started_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "finished_at"   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "cdp_sync_runs_source_idx"
  ON "cdp_sync_runs"("source_id", "started_at");

CREATE INDEX IF NOT EXISTS "cdp_sync_runs_org_idx"
  ON "cdp_sync_runs"("org_id", "started_at");
