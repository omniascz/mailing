-- Migration: Social media management + Ad platform integrations
-- Tasks: #293, #294, #295, #296, #297, #298, #301, #302

-- ─── Social accounts ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "social_accounts" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"              UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "platform"            VARCHAR(32) NOT NULL,
  "platform_user_id"    VARCHAR(255) NOT NULL,
  "platform_username"   VARCHAR(255),
  "display_name"        VARCHAR(255),
  "avatar_url"          TEXT,
  "access_token"        TEXT NOT NULL,
  "refresh_token"       TEXT,
  "token_expires_at"    TIMESTAMPTZ,
  "scopes"              TEXT,
  "active"              BOOLEAN NOT NULL DEFAULT TRUE,
  "metadata"            JSONB DEFAULT '{}',
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_accounts_org_platform_uq"
  ON "social_accounts"("org_id", "platform", "platform_user_id");

CREATE INDEX IF NOT EXISTS "social_accounts_org_active_idx"
  ON "social_accounts"("org_id", "active");

-- ─── OAuth state nonces (shared with ad accounts) ────────────────────────────

CREATE TABLE IF NOT EXISTS "social_oauth_states" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"     UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id"    UUID NOT NULL,
  "platform"   VARCHAR(64) NOT NULL,
  "state"      VARCHAR(128) NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_oauth_states_state_uq"
  ON "social_oauth_states"("state");

CREATE INDEX IF NOT EXISTS "social_oauth_states_exp_idx"
  ON "social_oauth_states"("expires_at");

-- ─── Social posts ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "social_posts" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "caption"      TEXT,
  "media_urls"   JSONB DEFAULT '[]',
  "link_url"     TEXT,
  "hashtags"     JSONB DEFAULT '[]',
  "account_ids"  JSONB NOT NULL DEFAULT '[]',
  "status"       VARCHAR(32) NOT NULL DEFAULT 'draft',
  "scheduled_at" TIMESTAMPTZ,
  "published_at" TIMESTAMPTZ,
  "results"      JSONB DEFAULT '[]',
  "impressions"  INTEGER NOT NULL DEFAULT 0,
  "engagements"  INTEGER NOT NULL DEFAULT 0,
  "likes"        INTEGER NOT NULL DEFAULT 0,
  "comments"     INTEGER NOT NULL DEFAULT 0,
  "shares"       INTEGER NOT NULL DEFAULT 0,
  "metadata"     JSONB DEFAULT '{}',
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "social_posts_org_status_idx"
  ON "social_posts"("org_id", "status");

CREATE INDEX IF NOT EXISTS "social_posts_org_schedule_idx"
  ON "social_posts"("org_id", "scheduled_at");

-- ─── Social mentions (#296) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "social_mentions" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"               UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "platform"             VARCHAR(32) NOT NULL,
  "platform_mention_id"  VARCHAR(255) NOT NULL,
  "type"                 VARCHAR(32) NOT NULL DEFAULT 'mention',
  "author_username"      VARCHAR(255),
  "author_id"            VARCHAR(255),
  "body"                 TEXT,
  "url"                  TEXT,
  "sentiment"            VARCHAR(16),
  "matched_keyword"      VARCHAR(255),
  "status"               VARCHAR(32) NOT NULL DEFAULT 'new',
  "raw_data"             JSONB DEFAULT '{}',
  "mentioned_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "social_mentions_uq_idx"
  ON "social_mentions"("org_id", "platform", "platform_mention_id");

CREATE INDEX IF NOT EXISTS "social_mentions_org_status_idx"
  ON "social_mentions"("org_id", "status");

CREATE INDEX IF NOT EXISTS "social_mentions_org_date_idx"
  ON "social_mentions"("org_id", "mentioned_at");

-- ─── Monitoring keywords ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "social_monitoring_keywords" (
  "id"        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"    UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "keyword"   VARCHAR(255) NOT NULL,
  "platforms" JSONB DEFAULT '[]',
  "active"    VARCHAR(8) NOT NULL DEFAULT 'true',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "social_monitoring_kw_org_idx"
  ON "social_monitoring_keywords"("org_id");

-- ─── Social analytics snapshots (#298) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS "social_analytics_snapshots" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"      UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "account_id"  UUID NOT NULL REFERENCES "social_accounts"("id") ON DELETE CASCADE,
  "date"        VARCHAR(10) NOT NULL,
  "followers"   INTEGER NOT NULL DEFAULT 0,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "reach"       INTEGER NOT NULL DEFAULT 0,
  "engagements" INTEGER NOT NULL DEFAULT 0,
  "raw_data"    JSONB DEFAULT '{}',
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "social_analytics_account_date_idx"
  ON "social_analytics_snapshots"("account_id", "date");

CREATE INDEX IF NOT EXISTS "social_analytics_org_date_idx"
  ON "social_analytics_snapshots"("org_id", "date");

-- ─── Ad accounts (#301) ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ad_accounts" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"               UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "platform"             VARCHAR(32) NOT NULL,
  "platform_account_id"  VARCHAR(255) NOT NULL,
  "account_name"         VARCHAR(255),
  "access_token"         TEXT NOT NULL,
  "refresh_token"        TEXT,
  "token_expires_at"     TIMESTAMPTZ,
  "active"               BOOLEAN NOT NULL DEFAULT TRUE,
  "metadata"             JSONB DEFAULT '{}',
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ad_accounts_org_platform_uq"
  ON "ad_accounts"("org_id", "platform", "platform_account_id");

CREATE INDEX IF NOT EXISTS "ad_accounts_org_active_idx"
  ON "ad_accounts"("org_id", "active");

-- ─── Audience syncs (#302) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ad_audience_syncs" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"                UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "ad_account_id"         UUID NOT NULL REFERENCES "ad_accounts"("id") ON DELETE CASCADE,
  "segment_id"            UUID,
  "list_id"               UUID,
  "audience_name"         VARCHAR(255) NOT NULL,
  "platform_audience_id"  VARCHAR(255),
  "status"                VARCHAR(32) NOT NULL DEFAULT 'pending',
  "contacts_uploaded"     JSONB DEFAULT '0',
  "last_sync_at"          TIMESTAMPTZ,
  "error_message"         TEXT,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ad_audience_syncs_org_idx"
  ON "ad_audience_syncs"("org_id");

CREATE INDEX IF NOT EXISTS "ad_audience_syncs_account_idx"
  ON "ad_audience_syncs"("ad_account_id");
