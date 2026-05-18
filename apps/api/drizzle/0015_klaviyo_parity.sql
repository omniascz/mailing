-- Migration 0015: Klaviyo feature-parity additions.
-- Adds: multi-email profiles, RFM/next-order predictions, smart sending,
-- quiet hours, back-in-stock, price-drop, coupons, reviews, scheduled reports,
-- holdout groups, helpdesk, warehouse sync, SMS keywords, anonymous identity,
-- RCS messages.

-- ─── Multi-email profiles ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contact_emails" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id"   UUID NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "email"        VARCHAR(320) NOT NULL,
  "is_primary"   BOOLEAN NOT NULL DEFAULT FALSE,
  "consent"      VARCHAR(32) NOT NULL DEFAULT 'pending',
  "verified_at"  TIMESTAMPTZ,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "contact_emails_org_email_uq" ON "contact_emails"("org_id", LOWER("email"));
CREATE INDEX IF NOT EXISTS "contact_emails_contact_idx" ON "contact_emails"("contact_id");

-- ─── RFM + next-order predictions (extend contact_engagement) ───────────────
ALTER TABLE "contact_engagement"
  ADD COLUMN IF NOT EXISTS "rfm_recency"            INTEGER,
  ADD COLUMN IF NOT EXISTS "rfm_frequency"          INTEGER,
  ADD COLUMN IF NOT EXISTS "rfm_monetary"           INTEGER,
  ADD COLUMN IF NOT EXISTS "rfm_score"              INTEGER,
  ADD COLUMN IF NOT EXISTS "rfm_segment"            VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "predicted_next_order_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "avg_order_interval_days" INTEGER;

-- ─── Smart sending ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "smart_sending_rules" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"          UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "channel"         VARCHAR(32) NOT NULL,
  "max_per_day"     INTEGER NOT NULL DEFAULT 2,
  "max_per_week"    INTEGER NOT NULL DEFAULT 7,
  "cooldown_hours"  INTEGER NOT NULL DEFAULT 16,
  "enabled"         BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "smart_sending_rules_org_ch_uq" ON "smart_sending_rules"("org_id", "channel");

-- ─── Quiet hours ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "quiet_hours" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"     UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "channel"    VARCHAR(32) NOT NULL DEFAULT 'all',
  "start_hour" INTEGER NOT NULL DEFAULT 21,
  "end_hour"   INTEGER NOT NULL DEFAULT 8,
  "timezone"   VARCHAR(100) NOT NULL DEFAULT 'UTC',
  "enabled"    BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "quiet_hours_org_ch_uq" ON "quiet_hours"("org_id", "channel");

-- ─── Back-in-stock subscriptions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "back_in_stock_subscriptions" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id"   UUID NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "sku"          VARCHAR(128) NOT NULL,
  "channel"      VARCHAR(32) NOT NULL DEFAULT 'email',
  "notified_at"  TIMESTAMPTZ,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "back_in_stock_org_sku_idx" ON "back_in_stock_subscriptions"("org_id", "sku") WHERE "notified_at" IS NULL;

-- ─── Price-drop subscriptions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "price_drop_subscriptions" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"             UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id"         UUID NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "sku"                VARCHAR(128) NOT NULL,
  "channel"            VARCHAR(32) NOT NULL DEFAULT 'email',
  "price_at_subscribe" NUMERIC(12,2) NOT NULL,
  "notified_at"        TIMESTAMPTZ,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "price_drop_org_sku_idx" ON "price_drop_subscriptions"("org_id", "sku") WHERE "notified_at" IS NULL;

-- ─── Coupon batches + codes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "coupon_batches" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"          VARCHAR(255) NOT NULL,
  "code_prefix"   VARCHAR(32) NOT NULL DEFAULT '',
  "discount_type" VARCHAR(16) NOT NULL DEFAULT 'percent',
  "discount_value" NUMERIC(10,2) NOT NULL,
  "expires_at"    TIMESTAMPTZ,
  "total_codes"   INTEGER NOT NULL DEFAULT 0,
  "redeemed_count" INTEGER NOT NULL DEFAULT 0,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "coupon_batches_org_idx" ON "coupon_batches"("org_id");

CREATE TABLE IF NOT EXISTS "coupon_codes" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id"     UUID NOT NULL REFERENCES "coupon_batches"("id") ON DELETE CASCADE,
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "code"         VARCHAR(64) NOT NULL,
  "assigned_to"  UUID REFERENCES "contacts"("id") ON DELETE SET NULL,
  "assigned_at"  TIMESTAMPTZ,
  "redeemed_at"  TIMESTAMPTZ,
  "revenue"      NUMERIC(12,2),
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "coupon_codes_org_code_uq" ON "coupon_codes"("org_id", "code");
CREATE INDEX IF NOT EXISTS "coupon_codes_batch_idx" ON "coupon_codes"("batch_id");

-- ─── Product reviews ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "product_reviews" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "sku"          VARCHAR(128) NOT NULL,
  "contact_id"   UUID REFERENCES "contacts"("id") ON DELETE SET NULL,
  "rating"       INTEGER NOT NULL,
  "title"        VARCHAR(255),
  "body"         TEXT,
  "author_name"  VARCHAR(255),
  "photos"       JSONB NOT NULL DEFAULT '[]',
  "status"       VARCHAR(32) NOT NULL DEFAULT 'pending',
  "approved_at"  TIMESTAMPTZ,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "product_reviews_org_sku_idx" ON "product_reviews"("org_id", "sku");
CREATE INDEX IF NOT EXISTS "product_reviews_status_idx" ON "product_reviews"("org_id", "status");

-- ─── Scheduled reports ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "scheduled_reports" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"         VARCHAR(255) NOT NULL,
  "report_type"  VARCHAR(64) NOT NULL,
  "params"       JSONB NOT NULL DEFAULT '{}',
  "recipients"   JSONB NOT NULL DEFAULT '[]',
  "frequency"    VARCHAR(16) NOT NULL DEFAULT 'weekly',
  "next_run_at"  TIMESTAMPTZ NOT NULL,
  "last_run_at"  TIMESTAMPTZ,
  "enabled"      BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "scheduled_reports_next_run_idx" ON "scheduled_reports"("next_run_at") WHERE "enabled";

-- ─── Holdout groups ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "holdout_groups" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"      UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"        VARCHAR(255) NOT NULL,
  "description" VARCHAR(1024),
  "percentage"  NUMERIC(5,2) NOT NULL DEFAULT 5.0,
  "active"      BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "holdout_groups_org_idx" ON "holdout_groups"("org_id");

CREATE TABLE IF NOT EXISTS "holdout_group_members" (
  "group_id"    UUID NOT NULL REFERENCES "holdout_groups"("id") ON DELETE CASCADE,
  "contact_id"  UUID NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "added_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("group_id", "contact_id")
);
CREATE INDEX IF NOT EXISTS "holdout_members_contact_idx" ON "holdout_group_members"("contact_id");

-- ─── Helpdesk tickets ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "helpdesk_tickets" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id"   UUID REFERENCES "contacts"("id") ON DELETE SET NULL,
  "subject"      VARCHAR(512) NOT NULL,
  "status"       VARCHAR(32) NOT NULL DEFAULT 'open',
  "priority"     VARCHAR(16) NOT NULL DEFAULT 'normal',
  "channel"      VARCHAR(32) NOT NULL DEFAULT 'email',
  "assigned_to"  UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "tags"         JSONB NOT NULL DEFAULT '[]',
  "closed_at"    TIMESTAMPTZ,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "helpdesk_tickets_org_status_idx" ON "helpdesk_tickets"("org_id", "status");
CREATE INDEX IF NOT EXISTS "helpdesk_tickets_contact_idx" ON "helpdesk_tickets"("contact_id") WHERE "status" <> 'closed';

CREATE TABLE IF NOT EXISTS "ticket_messages" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id"    UUID NOT NULL REFERENCES "helpdesk_tickets"("id") ON DELETE CASCADE,
  "sender"       VARCHAR(32) NOT NULL,
  "body"         TEXT NOT NULL,
  "attachments"  JSONB NOT NULL DEFAULT '[]',
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ticket_messages_ticket_idx" ON "ticket_messages"("ticket_id");

-- ─── Warehouse syncs (Snowflake/BigQuery/S3) ────────────────────────────────
CREATE TABLE IF NOT EXISTS "warehouse_syncs" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"          VARCHAR(255) NOT NULL,
  "destination"   VARCHAR(64) NOT NULL,
  "config"        JSONB NOT NULL DEFAULT '{}',
  "entities"      JSONB NOT NULL DEFAULT '[]',
  "frequency"     VARCHAR(16) NOT NULL DEFAULT 'daily',
  "last_sync_at"  TIMESTAMPTZ,
  "last_status"   VARCHAR(32),
  "last_error"    TEXT,
  "enabled"       BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "warehouse_syncs_org_idx" ON "warehouse_syncs"("org_id");

-- ─── SMS keyword opt-in ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sms_keywords" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"     UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "keyword"    VARCHAR(32) NOT NULL,
  "action"     VARCHAR(32) NOT NULL,
  "list_id"    UUID REFERENCES "lists"("id") ON DELETE SET NULL,
  "reply"      VARCHAR(1024),
  "enabled"    BOOLEAN NOT NULL DEFAULT TRUE,
  "hit_count"  INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "sms_keywords_org_kw_uq" ON "sms_keywords"("org_id", LOWER("keyword"));

-- ─── Anonymous profiles (identity merge) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "anonymous_profiles" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "visitor_id"   VARCHAR(128) NOT NULL,
  "device_id"    VARCHAR(128),
  "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_seen_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "merged_into"   UUID REFERENCES "contacts"("id") ON DELETE SET NULL,
  "merged_at"     TIMESTAMPTZ,
  "properties"    JSONB NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS "anon_profiles_org_visitor_uq" ON "anonymous_profiles"("org_id", "visitor_id");
CREATE INDEX IF NOT EXISTS "anon_profiles_merged_idx" ON "anonymous_profiles"("merged_into") WHERE "merged_into" IS NOT NULL;

-- ─── RCS messages (Rich Communication Services) ─────────────────────────────
CREATE TABLE IF NOT EXISTS "rcs_messages" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id"   UUID REFERENCES "contacts"("id") ON DELETE SET NULL,
  "phone"        VARCHAR(32) NOT NULL,
  "message_type" VARCHAR(32) NOT NULL DEFAULT 'text',
  "payload"      JSONB NOT NULL DEFAULT '{}',
  "status"       VARCHAR(32) NOT NULL DEFAULT 'queued',
  "provider"     VARCHAR(32),
  "provider_id"  VARCHAR(128),
  "error"        TEXT,
  "sent_at"      TIMESTAMPTZ,
  "delivered_at" TIMESTAMPTZ,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "rcs_messages_org_idx" ON "rcs_messages"("org_id", "created_at" DESC);

-- ─── Sending log (for smart-sending frequency cap) ─────────────────────────
CREATE TABLE IF NOT EXISTS "contact_send_log" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"     UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id" UUID NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "channel"    VARCHAR(32) NOT NULL,
  "sent_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "contact_send_log_recent_idx" ON "contact_send_log"("org_id", "contact_id", "channel", "sent_at" DESC);
