-- Migration 0036: DMARC reports + Loyalty system
-- Covers tasks #233 (DMARC Digests), #235 (Loyalty enrollment),
-- #236 (Points ledger), #237 (Rewards catalog), #238 (Earning rules)

-- ── DMARC reports (#233) ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "dmarc_reports" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"          uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "report_id"       varchar(255) NOT NULL,
  "reporter_org"    varchar(255) NOT NULL,
  "domain"          varchar(253) NOT NULL,
  "date_begin"      timestamptz NOT NULL,
  "date_end"        timestamptz NOT NULL,
  "policy"          jsonb NOT NULL DEFAULT '{}',
  "records"         jsonb NOT NULL DEFAULT '[]',
  "total_messages"  integer NOT NULL DEFAULT 0,
  "pass_count"      integer NOT NULL DEFAULT 0,
  "fail_count"      integer NOT NULL DEFAULT 0,
  "received_at"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "dmarc_reports_org_domain_idx"
  ON "dmarc_reports"("org_id", "domain");

CREATE INDEX IF NOT EXISTS "dmarc_reports_date_end_idx"
  ON "dmarc_reports"("org_id", "date_end");

CREATE UNIQUE INDEX IF NOT EXISTS "dmarc_reports_org_reporter_id_idx"
  ON "dmarc_reports"("org_id", "reporter_org", "report_id");

-- ── Loyalty programs (#234/#235 foundation) ───────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "loyalty_point_expiry_type" AS ENUM ('never', 'rolling', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "loyalty_programs" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"              uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"                varchar(255) NOT NULL,
  "description"         text,
  "tiers"               jsonb NOT NULL DEFAULT '[]',
  "expiry_type"         "loyalty_point_expiry_type" NOT NULL DEFAULT 'never',
  "expiry_value"        varchar(10),
  "earning_enabled"     boolean NOT NULL DEFAULT true,
  "redemption_enabled"  boolean NOT NULL DEFAULT true,
  "active"              boolean NOT NULL DEFAULT true,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now(),
  "deleted_at"          timestamptz
);

CREATE INDEX IF NOT EXISTS "loyalty_programs_org_idx"
  ON "loyalty_programs"("org_id");

-- ── Loyalty members (#235) ────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "loyalty_member_status" AS ENUM ('active', 'suspended', 'opted_out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "loyalty_members" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"           uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "program_id"       uuid NOT NULL REFERENCES "loyalty_programs"("id") ON DELETE CASCADE,
  "contact_id"       uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "status"           "loyalty_member_status" NOT NULL DEFAULT 'active',
  "current_tier_id"  varchar(255),
  "point_balance"    integer NOT NULL DEFAULT 0,
  "lifetime_points"  integer NOT NULL DEFAULT 0,
  "enrolled_at"      timestamptz NOT NULL DEFAULT now(),
  "last_activity_at" timestamptz,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "loyalty_members_org_idx"
  ON "loyalty_members"("org_id");

CREATE INDEX IF NOT EXISTS "loyalty_members_program_idx"
  ON "loyalty_members"("program_id");

CREATE INDEX IF NOT EXISTS "loyalty_members_contact_idx"
  ON "loyalty_members"("contact_id");

CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_members_program_contact_idx"
  ON "loyalty_members"("program_id", "contact_id");

-- ── Loyalty points ledger (#236) ──────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "loyalty_point_tx_type" AS ENUM ('earn', 'redeem', 'expire', 'adjust', 'bonus', 'refund');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "loyalty_points" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "member_id"     uuid NOT NULL REFERENCES "loyalty_members"("id") ON DELETE CASCADE,
  "type"          "loyalty_point_tx_type" NOT NULL,
  "points"        integer NOT NULL,
  "balance_after" integer NOT NULL,
  "description"   varchar(255),
  "source_ref"    varchar(255),
  "actor_type"    varchar(50) NOT NULL DEFAULT 'system',
  "actor_id"      varchar(255),
  "expires_at"    timestamptz,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "loyalty_points_member_idx"
  ON "loyalty_points"("member_id");

CREATE INDEX IF NOT EXISTS "loyalty_points_org_idx"
  ON "loyalty_points"("org_id");

CREATE INDEX IF NOT EXISTS "loyalty_points_created_idx"
  ON "loyalty_points"("member_id", "created_at");

-- ── Loyalty rewards catalog (#237) ────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "loyalty_reward_type" AS ENUM ('discount_pct', 'discount_fixed', 'free_product', 'voucher', 'experience');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "loyalty_rewards" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"            uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "program_id"        uuid NOT NULL REFERENCES "loyalty_programs"("id") ON DELETE CASCADE,
  "name"              varchar(255) NOT NULL,
  "description"       text,
  "type"              "loyalty_reward_type" NOT NULL,
  "point_cost"        integer NOT NULL,
  "config"            jsonb NOT NULL DEFAULT '{}',
  "required_tier_ids" jsonb NOT NULL DEFAULT '[]',
  "max_redemptions"   integer,
  "max_per_member"    integer,
  "redemption_count"  integer NOT NULL DEFAULT 0,
  "active"            boolean NOT NULL DEFAULT true,
  "starts_at"         timestamptz,
  "ends_at"           timestamptz,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now(),
  "deleted_at"        timestamptz
);

CREATE INDEX IF NOT EXISTS "loyalty_rewards_org_program_idx"
  ON "loyalty_rewards"("org_id", "program_id");

CREATE TABLE IF NOT EXISTS "loyalty_redemptions" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"            uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "reward_id"         uuid NOT NULL REFERENCES "loyalty_rewards"("id") ON DELETE RESTRICT,
  "member_id"         uuid NOT NULL,
  "points_spent"      integer NOT NULL,
  "fulfillment_code"  varchar(255),
  "fulfilled_at"      timestamptz,
  "created_at"        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "loyalty_redemptions_member_idx"
  ON "loyalty_redemptions"("member_id");

CREATE INDEX IF NOT EXISTS "loyalty_redemptions_reward_idx"
  ON "loyalty_redemptions"("reward_id");

-- ── Loyalty earning rules (#238) ──────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "loyalty_earning_event" AS ENUM ('purchase', 'signup', 'birthday', 'referral', 'review', 'social_share', 'profile_complete', 'custom_event');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "loyalty_earning_rules" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"                uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "program_id"            uuid NOT NULL REFERENCES "loyalty_programs"("id") ON DELETE CASCADE,
  "name"                  varchar(255) NOT NULL,
  "description"           text,
  "event_type"            "loyalty_earning_event" NOT NULL,
  "custom_event_name"     varchar(255),
  "points_fixed"          integer,
  "points_per_currency"   numeric(10, 4),
  "currency_field"        varchar(100),
  "max_points_per_event"  integer,
  "max_lifetime_points"   integer,
  "max_points_per_period" integer,
  "period_days"           integer,
  "conditions"            jsonb,
  "active"                boolean NOT NULL DEFAULT true,
  "starts_at"             timestamptz,
  "ends_at"               timestamptz,
  "created_at"            timestamptz NOT NULL DEFAULT now(),
  "updated_at"            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "loyalty_earning_rules_org_program_idx"
  ON "loyalty_earning_rules"("org_id", "program_id");

CREATE INDEX IF NOT EXISTS "loyalty_earning_rules_event_idx"
  ON "loyalty_earning_rules"("program_id", "event_type");

-- ── Extend workflow trigger type enum (#239) ──────────────────────────────────

ALTER TYPE "workflow_trigger_type"
  ADD VALUE IF NOT EXISTS 'loyalty_points_earned';
ALTER TYPE "workflow_trigger_type"
  ADD VALUE IF NOT EXISTS 'loyalty_tier_up';
ALTER TYPE "workflow_trigger_type"
  ADD VALUE IF NOT EXISTS 'loyalty_reward_redeemed';
