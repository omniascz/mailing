-- Migration 0037: HIPAA compliance mode + SAML 2.0 improvements
-- Covers tasks #231 (HIPAA mode) and #230 (SAML 2.0)

-- ── organizations: add hipaa_mode column ─────────────────────────────────────

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "hipaa_mode" boolean NOT NULL DEFAULT false;

-- ── BAA status enum ───────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "baa_status" AS ENUM ('pending', 'active', 'expired', 'terminated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Business Associate Agreements ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "business_associate_agreements" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"             uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "ba_name"            varchar(255) NOT NULL,
  "ba_email"           varchar(255),
  "ba_type"            varchar(100),
  "status"             "baa_status" NOT NULL DEFAULT 'pending',
  "effective_date"     timestamptz,
  "expiration_date"    timestamptz,
  "document_url"       varchar(1024),
  "signed_by_user_id"  uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "signed_at"          timestamptz,
  "notes"              text,
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "baa_org_idx" ON "business_associate_agreements"("org_id");
CREATE INDEX IF NOT EXISTS "baa_status_idx" ON "business_associate_agreements"("org_id", "status");

-- ── PHI field flags ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "phi_field_flags" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"               uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "field_key"            varchar(255) NOT NULL,
  "phi_category"         varchar(100) NOT NULL DEFAULT 'other',
  "encrypt_at_rest"      boolean NOT NULL DEFAULT false,
  "redact_in_logs"       boolean NOT NULL DEFAULT true,
  "created_by_user_id"   uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "phi_fields_org_idx" ON "phi_field_flags"("org_id");
CREATE UNIQUE INDEX IF NOT EXISTS "phi_fields_org_key_idx" ON "phi_field_flags"("org_id", "field_key");

-- ── HIPAA access log ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "hipaa_access_log" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"         uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id"        uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action"         varchar(100) NOT NULL,
  "resource"       varchar(100) NOT NULL,
  "resource_id"    varchar(255),
  "phi_field_keys" jsonb NOT NULL DEFAULT '[]',
  "ip_address"     varchar(45),
  "user_agent"     varchar(512),
  "created_at"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "hipaa_log_org_idx" ON "hipaa_access_log"("org_id");
CREATE INDEX IF NOT EXISTS "hipaa_log_created_idx" ON "hipaa_access_log"("org_id", "created_at");
CREATE INDEX IF NOT EXISTS "hipaa_log_user_idx" ON "hipaa_access_log"("org_id", "user_id");

-- ── SSO: no schema changes for SAML 2.0 (uses existing sso_configurations) ──
-- The SAML 2.0 improvements in #230 are pure service-layer; no DB changes.
-- Attribute mapping will be persisted in organizations.settings JSONB in a
-- follow-up when explicit columns are added.
