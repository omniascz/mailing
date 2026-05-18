-- Migration: phone numbers, helpdesk routing, calls table additions
-- Tasks: #245 (agent availability/routing), #250 (phone numbers), #253 (calls CRM columns)

-- ─── Agent availability ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "agent_availability" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"         UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id"        UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status"         VARCHAR(32) NOT NULL DEFAULT 'offline',
  "max_concurrent" INTEGER NOT NULL DEFAULT 5,
  "active_count"   INTEGER NOT NULL DEFAULT 0,
  "skills"         JSONB NOT NULL DEFAULT '[]',
  "channels"       JSONB NOT NULL DEFAULT '[]',
  "last_active_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_availability_user_uq"
  ON "agent_availability"("org_id", "user_id");

CREATE INDEX IF NOT EXISTS "agent_availability_org_status_idx"
  ON "agent_availability"("org_id", "status");

-- ─── Chat routing rules ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "chat_routing_rules" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"         UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"           VARCHAR(255) NOT NULL,
  "channel"        VARCHAR(64),
  "strategy"       VARCHAR(32) NOT NULL DEFAULT 'round-robin',
  "required_skill" VARCHAR(128),
  "agent_ids"      JSONB NOT NULL DEFAULT '[]',
  "priority"       INTEGER NOT NULL DEFAULT 5,
  "is_active"      BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "chat_routing_rules_org_idx"
  ON "chat_routing_rules"("org_id", "priority");

-- ─── Ticket assignments (audit log) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ticket_assignments" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"      UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "ticket_id"   UUID NOT NULL,
  "assigned_to" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "assigned_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "reason"      VARCHAR(64) NOT NULL DEFAULT 'manual',
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ticket_assignments_ticket_idx"
  ON "ticket_assignments"("ticket_id");

CREATE INDEX IF NOT EXISTS "ticket_assignments_org_agent_idx"
  ON "ticket_assignments"("org_id", "assigned_to");

-- ─── Phone numbers ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "phone_numbers" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"               UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "number"               VARCHAR(32) NOT NULL,
  "provider"             VARCHAR(32) NOT NULL DEFAULT 'twilio',
  "provider_sid"         VARCHAR(255),
  "status"               VARCHAR(32) NOT NULL DEFAULT 'active',
  "capabilities"         JSONB NOT NULL DEFAULT '["voice","sms"]',
  "country_code"         VARCHAR(2) NOT NULL DEFAULT 'US',
  "label"                VARCHAR(255),
  "assigned_user_id"     UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "routing_target_type"  VARCHAR(32),
  "routing_target_id"    UUID,
  "record_calls"         BOOLEAN NOT NULL DEFAULT FALSE,
  "monthly_rate_usd"     VARCHAR(16),
  "provisioned_at"       TIMESTAMPTZ,
  "released_at"          TIMESTAMPTZ,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "phone_numbers_number_uq"
  ON "phone_numbers"("org_id", "number");

CREATE INDEX IF NOT EXISTS "phone_numbers_org_idx"
  ON "phone_numbers"("org_id", "status");

CREATE INDEX IF NOT EXISTS "phone_numbers_user_idx"
  ON "phone_numbers"("assigned_user_id");

-- ─── Phone number port requests ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "phone_number_port_requests" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"         UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "numbers"        JSONB NOT NULL,
  "losing_carrier" VARCHAR(255),
  "account_number" VARCHAR(255),
  "status"         VARCHAR(32) NOT NULL DEFAULT 'pending',
  "target_date"    TIMESTAMPTZ,
  "notes"          VARCHAR(2000),
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "phone_port_requests_org_idx"
  ON "phone_number_port_requests"("org_id", "status");

-- ─── Calls table additions (#253) ────────────────────────────────────────────
-- (base calls table already exists from migration 0010_calls_table.sql)

ALTER TABLE "calls"
  ADD COLUMN IF NOT EXISTS "agent_id"             UUID REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "deal_id"              UUID,
  ADD COLUMN IF NOT EXISTS "direction"            VARCHAR(16) NOT NULL DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS "from_number"          VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "to_number"            VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "voicemail_url"        VARCHAR(1024),
  ADD COLUMN IF NOT EXISTS "voicemail_transcript" TEXT,
  ADD COLUMN IF NOT EXISTS "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS "calls_agent_id_idx"  ON "calls"("agent_id");
CREATE INDEX IF NOT EXISTS "calls_deal_id_idx"   ON "calls"("deal_id");
