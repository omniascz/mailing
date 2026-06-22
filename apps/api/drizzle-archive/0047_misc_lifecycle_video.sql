-- Migration: Associations engine + lifecycle rules + 1:1 video messaging
-- Tasks: #319, #320, #325

-- ─── Lifecycle auto-advance rules (#319) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS "lifecycle_rules" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"               UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"                 VARCHAR(255) NOT NULL,
  "enabled"              BOOLEAN NOT NULL DEFAULT TRUE,
  "priority"             INTEGER NOT NULL DEFAULT 100,
  "from_stage"           VARCHAR(64),
  "to_stage"             VARCHAR(64) NOT NULL,
  "conditions"           JSONB NOT NULL DEFAULT '[]',
  "add_tags"             JSONB NOT NULL DEFAULT '[]',
  "trigger_workflow_id"  UUID,
  "evaluation_count"     INTEGER NOT NULL DEFAULT 0,
  "match_count"          INTEGER NOT NULL DEFAULT 0,
  "last_matched_at"      TIMESTAMPTZ,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "lifecycle_rules_org_idx"     ON "lifecycle_rules"("org_id");
CREATE INDEX IF NOT EXISTS "lifecycle_rules_enabled_idx" ON "lifecycle_rules"("org_id", "enabled");

-- ─── Generic associations (#320) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "associations" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"     UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "from_type"  VARCHAR(32) NOT NULL,
  "from_id"    UUID NOT NULL,
  "to_type"    VARCHAR(32) NOT NULL,
  "to_id"      UUID NOT NULL,
  "label"      VARCHAR(64),
  "metadata"   JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "associations_pair_uq"
  ON "associations"("org_id", "from_type", "from_id", "to_type", "to_id", "label");

CREATE INDEX IF NOT EXISTS "associations_from_idx" ON "associations"("org_id", "from_type", "from_id");
CREATE INDEX IF NOT EXISTS "associations_to_idx"   ON "associations"("org_id", "to_type",   "to_id");

-- ─── 1:1 Video messages (#325) ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "video_messages" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"              UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id"             UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "contact_id"          UUID REFERENCES "contacts"("id") ON DELETE SET NULL,
  "title"               VARCHAR(255),
  "share_token"         VARCHAR(64) NOT NULL UNIQUE,
  "original_object_key" TEXT NOT NULL,
  "hls_manifest_key"    TEXT,
  "thumbnail_key"       TEXT,
  "duration_seconds"    INTEGER,
  "size_bytes"          INTEGER,
  "mime_type"           VARCHAR(64),
  "status"              VARCHAR(32) NOT NULL DEFAULT 'pending_upload',
  "transcode_error"     TEXT,
  "play_count"          INTEGER NOT NULL DEFAULT 0,
  "completion_count"    INTEGER NOT NULL DEFAULT 0,
  "last_played_at"      TIMESTAMPTZ,
  "metadata"            JSONB NOT NULL DEFAULT '{}',
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at"          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "video_messages_org_idx"     ON "video_messages"("org_id");
CREATE INDEX IF NOT EXISTS "video_messages_user_idx"    ON "video_messages"("user_id");
CREATE INDEX IF NOT EXISTS "video_messages_contact_idx" ON "video_messages"("contact_id");
CREATE INDEX IF NOT EXISTS "video_messages_token_idx"   ON "video_messages"("share_token");
CREATE INDEX IF NOT EXISTS "video_messages_status_idx"  ON "video_messages"("status");

CREATE TABLE IF NOT EXISTS "video_play_events" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"            UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "video_id"          UUID NOT NULL REFERENCES "video_messages"("id") ON DELETE CASCADE,
  "event_type"        VARCHAR(16) NOT NULL,
  "position_seconds"  INTEGER NOT NULL DEFAULT 0,
  "ip_address"        VARCHAR(64),
  "user_agent"        TEXT,
  "referer"           TEXT,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "video_play_events_video_idx"   ON "video_play_events"("video_id");
CREATE INDEX IF NOT EXISTS "video_play_events_org_idx"     ON "video_play_events"("org_id");
CREATE INDEX IF NOT EXISTS "video_play_events_created_idx" ON "video_play_events"("created_at");

-- ─── Parent-child orgs (#273) ─────────────────────────────────────────────────
-- parent_org_id already added by migration 0043; ensure schema index exists.

CREATE INDEX IF NOT EXISTS "organizations_parent_idx" ON "organizations"("parent_org_id");
