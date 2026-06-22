-- Migration: cross-account access, consolidated billing, shared assets,
--            webhook batching, billing types, PAYG credits, product meters
-- Tasks: #274, #275, #276, #280, #281, #282, #283

-- ─── Parent-child org support (#273/#275) ─────────────────────────────────────

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "parent_org_id" UUID REFERENCES "organizations"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "organizations_parent_org_idx"
  ON "organizations"("parent_org_id") WHERE parent_org_id IS NOT NULL;

-- ─── Organization members (#274) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "organization_members" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"                UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id"               UUID REFERENCES "users"("id") ON DELETE CASCADE,
  "email"                 VARCHAR(255) NOT NULL,
  "role"                  VARCHAR(32) NOT NULL DEFAULT 'viewer',
  "status"                VARCHAR(16) NOT NULL DEFAULT 'pending',
  "invited_by_user_id"    UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "invitation_token"      TEXT,
  "invitation_expires_at" TIMESTAMPTZ,
  "accepted_at"           TIMESTAMPTZ,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_members_org_email_uq"
  ON "organization_members"("org_id", "email");

CREATE INDEX IF NOT EXISTS "org_members_user_idx"
  ON "organization_members"("user_id");

CREATE INDEX IF NOT EXISTS "org_members_org_status_idx"
  ON "organization_members"("org_id", "status");

CREATE INDEX IF NOT EXISTS "org_members_token_idx"
  ON "organization_members"("invitation_token") WHERE invitation_token IS NOT NULL;

-- ─── Webhook batching columns (#280) ─────────────────────────────────────────

ALTER TABLE "webhooks"
  ADD COLUMN IF NOT EXISTS "priority"             INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "batch_size"           INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "batch_flush_seconds"  INTEGER NOT NULL DEFAULT 30;

-- ─── Billing type enum & column (#281) ───────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE billing_type AS ENUM ('contact_based', 'send_based', 'payg');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "billing_subscriptions"
  ADD COLUMN IF NOT EXISTS "billing_type"    billing_type NOT NULL DEFAULT 'contact_based',
  ADD COLUMN IF NOT EXISTS "send_plan_tier"  VARCHAR(32);

-- ─── PAYG credit balances (#282) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "credit_balances" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"                UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "balance_cents"         NUMERIC(14,0) NOT NULL DEFAULT 0,
  "total_purchased_cents" NUMERIC(14,0) NOT NULL DEFAULT 0,
  "total_consumed_cents"  NUMERIC(14,0) NOT NULL DEFAULT 0,
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "credit_balances_org_uq"
  ON "credit_balances"("org_id");

CREATE TABLE IF NOT EXISTS "credit_transactions" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"             UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "type"               VARCHAR(16) NOT NULL,
  "amount_cents"       NUMERIC(14,0) NOT NULL,
  "balance_after_cents" NUMERIC(14,0) NOT NULL,
  "reference_id"       VARCHAR(255),
  "reference_type"     VARCHAR(64),
  "product"            VARCHAR(32),
  "description"        TEXT,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "credit_tx_org_idx"
  ON "credit_transactions"("org_id", "created_at");

CREATE INDEX IF NOT EXISTS "credit_tx_ref_idx"
  ON "credit_transactions"("reference_id") WHERE reference_id IS NOT NULL;

-- ─── Product usage meters (#283) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "product_usage_meters" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"           UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "product"          VARCHAR(32) NOT NULL,
  "period"           VARCHAR(7) NOT NULL,
  "units_used"       INTEGER NOT NULL DEFAULT 0,
  "billed_usd"       NUMERIC(10,4),
  "included_units"   INTEGER NOT NULL DEFAULT 0,
  "overage_rate_usd" NUMERIC(10,6) NOT NULL DEFAULT 0,
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_meters_org_product_period_uq"
  ON "product_usage_meters"("org_id", "product", "period");

CREATE INDEX IF NOT EXISTS "product_meters_org_period_idx"
  ON "product_usage_meters"("org_id", "period");

CREATE TABLE IF NOT EXISTS "product_meter_events" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"         UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "product"        VARCHAR(32) NOT NULL,
  "units"          INTEGER NOT NULL DEFAULT 1,
  "reference_id"   VARCHAR(255),
  "reference_type" VARCHAR(64),
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "meter_events_org_product_idx"
  ON "product_meter_events"("org_id", "product", "created_at");

CREATE INDEX IF NOT EXISTS "meter_events_ref_idx"
  ON "product_meter_events"("reference_id") WHERE reference_id IS NOT NULL;
