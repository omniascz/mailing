-- Migration 0014: Mailchimp feature-parity additions.
-- Adds: media assets, surveys, groups, revenue attribution, product catalogue,
-- 2FA, OAuth 2.0, RSS campaigns, per-contact engagement profile.

-- ─── Media library ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "media_assets" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "folder"        VARCHAR(255) NOT NULL DEFAULT '/',
  "filename"      VARCHAR(255) NOT NULL,
  "mime_type"     VARCHAR(100) NOT NULL,
  "size_bytes"    INTEGER NOT NULL DEFAULT 0,
  "width"         INTEGER,
  "height"        INTEGER,
  "storage_url"   VARCHAR(1024) NOT NULL,
  "thumbnail_url" VARCHAR(1024),
  "alt_text"      VARCHAR(512),
  "tags"          JSONB NOT NULL DEFAULT '[]',
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at"    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "media_assets_org_idx"    ON "media_assets"("org_id");
CREATE INDEX IF NOT EXISTS "media_assets_folder_idx" ON "media_assets"("org_id", "folder");

-- ─── Surveys ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "surveys" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"         VARCHAR(255) NOT NULL,
  "description"  VARCHAR(1024),
  "questions"    JSONB NOT NULL DEFAULT '[]',
  "active"       BOOLEAN NOT NULL DEFAULT TRUE,
  "submit_count" INTEGER NOT NULL DEFAULT 0,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "surveys_org_idx" ON "surveys"("org_id");

CREATE TABLE IF NOT EXISTS "survey_responses" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "survey_id"    UUID NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id"   UUID REFERENCES "contacts"("id") ON DELETE SET NULL,
  "answers"      JSONB NOT NULL DEFAULT '{}',
  "nps_score"    INTEGER,
  "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "survey_responses_survey_idx"  ON "survey_responses"("survey_id");
CREATE INDEX IF NOT EXISTS "survey_responses_contact_idx" ON "survey_responses"("contact_id");

-- ─── Interest groups ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "group_categories" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"     UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"       VARCHAR(100) NOT NULL,
  "kind"       VARCHAR(20) NOT NULL DEFAULT 'checkboxes',
  "visible"    BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "group_categories_org_idx" ON "group_categories"("org_id");

CREATE TABLE IF NOT EXISTS "groups" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"      UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "category_id" UUID NOT NULL REFERENCES "group_categories"("id") ON DELETE CASCADE,
  "name"        VARCHAR(100) NOT NULL,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "groups_category_idx" ON "groups"("category_id");

CREATE TABLE IF NOT EXISTS "contact_groups" (
  "contact_id" UUID NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "group_id"   UUID NOT NULL REFERENCES "groups"("id")   ON DELETE CASCADE,
  "added_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "contact_groups_pk"        ON "contact_groups"("contact_id", "group_id");
CREATE INDEX        IF NOT EXISTS "contact_groups_group_idx" ON "contact_groups"("group_id");

-- ─── Revenue attribution ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "revenue_events" (
  "id"                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"                  UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id"              UUID REFERENCES "contacts"("id") ON DELETE SET NULL,
  "order_id"                VARCHAR(128),
  "amount"                  DECIMAL(14, 2) NOT NULL,
  "currency"                VARCHAR(3) NOT NULL DEFAULT 'USD',
  "items"                   JSONB NOT NULL DEFAULT '[]',
  "utm_source"              VARCHAR(100),
  "utm_medium"              VARCHAR(100),
  "utm_campaign"            VARCHAR(100),
  "attributed_campaign_id"  UUID REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "attribution_model"       VARCHAR(20),
  "occurred_at"             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "revenue_events_org_idx"      ON "revenue_events"("org_id");
CREATE INDEX IF NOT EXISTS "revenue_events_contact_idx"  ON "revenue_events"("contact_id");
CREATE INDEX IF NOT EXISTS "revenue_events_campaign_idx" ON "revenue_events"("attributed_campaign_id");
CREATE INDEX IF NOT EXISTS "revenue_events_order_idx"    ON "revenue_events"("order_id");

-- ─── Product catalogue ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "products" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"      UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "sku"         VARCHAR(128) NOT NULL,
  "name"        VARCHAR(255) NOT NULL,
  "description" VARCHAR(2048),
  "price"       DECIMAL(12, 2) NOT NULL,
  "currency"    VARCHAR(3) NOT NULL DEFAULT 'USD',
  "image_url"   VARCHAR(1024),
  "url"         VARCHAR(1024),
  "categories"  JSONB NOT NULL DEFAULT '[]',
  "tags"        JSONB NOT NULL DEFAULT '[]',
  "stock"       INTEGER,
  "active"      BOOLEAN NOT NULL DEFAULT TRUE,
  "metadata"    JSONB NOT NULL DEFAULT '{}',
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "products_org_idx" ON "products"("org_id");
CREATE INDEX IF NOT EXISTS "products_sku_idx" ON "products"("org_id", "sku");

-- ─── Two-factor authentication ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "two_factor_secrets" (
  "user_id"      UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "secret"       VARCHAR(64) NOT NULL,
  "backup_codes" JSONB NOT NULL DEFAULT '[]',
  "enabled"      BOOLEAN NOT NULL DEFAULT FALSE,
  "last_used_at" TIMESTAMPTZ,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── OAuth 2.0 ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "oauth_apps" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"               UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"                 VARCHAR(255) NOT NULL,
  "client_id"            VARCHAR(64) NOT NULL UNIQUE,
  "client_secret_hash"   VARCHAR(256) NOT NULL,
  "redirect_uris"        JSONB NOT NULL DEFAULT '[]',
  "scopes"               JSONB NOT NULL DEFAULT '[]',
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "oauth_apps_org_idx" ON "oauth_apps"("org_id");

CREATE TABLE IF NOT EXISTS "oauth_codes" (
  "code"         VARCHAR(64) PRIMARY KEY,
  "app_id"       UUID NOT NULL REFERENCES "oauth_apps"("id") ON DELETE CASCADE,
  "user_id"      UUID NOT NULL REFERENCES "users"("id")      ON DELETE CASCADE,
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "redirect_uri" VARCHAR(1024) NOT NULL,
  "scopes"       JSONB NOT NULL DEFAULT '[]',
  "expires_at"   TIMESTAMPTZ NOT NULL,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "oauth_tokens" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "token_hash"          VARCHAR(256) NOT NULL UNIQUE,
  "refresh_token_hash"  VARCHAR(256) UNIQUE,
  "app_id"              UUID NOT NULL REFERENCES "oauth_apps"("id") ON DELETE CASCADE,
  "user_id"             UUID NOT NULL REFERENCES "users"("id")      ON DELETE CASCADE,
  "org_id"              UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "scopes"              JSONB NOT NULL DEFAULT '[]',
  "expires_at"          TIMESTAMPTZ NOT NULL,
  "revoked_at"          TIMESTAMPTZ,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "oauth_tokens_user_idx" ON "oauth_tokens"("user_id");
CREATE INDEX IF NOT EXISTS "oauth_tokens_app_idx"  ON "oauth_tokens"("app_id");

-- ─── RSS campaigns ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "rss_campaigns" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"            UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"              VARCHAR(255) NOT NULL,
  "feed_url"          VARCHAR(1024) NOT NULL,
  "list_id"           UUID REFERENCES "lists"("id") ON DELETE SET NULL,
  "frequency"         VARCHAR(20) NOT NULL DEFAULT 'daily',
  "send_time"         VARCHAR(5) NOT NULL DEFAULT '09:00',
  "timezone"          VARCHAR(100) NOT NULL DEFAULT 'UTC',
  "from_name"         VARCHAR(100),
  "from_email"        VARCHAR(255),
  "subject_template"  VARCHAR(255) NOT NULL DEFAULT '{{rss.title}}',
  "active"            BOOLEAN NOT NULL DEFAULT TRUE,
  "last_seen_guids"   JSONB NOT NULL DEFAULT '[]',
  "last_sent_at"      TIMESTAMPTZ,
  "next_run_at"       TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "rss_campaigns_org_idx"      ON "rss_campaigns"("org_id");
CREATE INDEX IF NOT EXISTS "rss_campaigns_next_run_idx" ON "rss_campaigns"("next_run_at");

-- ─── Per-contact engagement profile ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "contact_engagement" (
  "contact_id"           UUID PRIMARY KEY REFERENCES "contacts"("id") ON DELETE CASCADE,
  "org_id"               UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "timezone"             VARCHAR(100),
  "open_hour_histogram"  JSONB NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]',
  "open_day_histogram"   JSONB NOT NULL DEFAULT '[0,0,0,0,0,0,0]',
  "total_opens"          INTEGER NOT NULL DEFAULT 0,
  "total_clicks"         INTEGER NOT NULL DEFAULT 0,
  "total_sends"          INTEGER NOT NULL DEFAULT 0,
  "total_orders"         INTEGER NOT NULL DEFAULT 0,
  "total_revenue"        DECIMAL(14, 2) NOT NULL DEFAULT 0,
  "last_order_at"        TIMESTAMPTZ,
  "first_order_at"       TIMESTAMPTZ,
  "predicted_clv"        DECIMAL(14, 2),
  "purchase_likelihood"  DECIMAL(4, 3),
  "churn_risk"           DECIMAL(4, 3),
  "predicted_at"         TIMESTAMPTZ,
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "contact_engagement_org_idx" ON "contact_engagement"("org_id");
