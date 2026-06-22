-- Migration 0030: Inbound email (#120) + SSO (#139) + SOC 2 compliance (#146).

-- Extend auth_provider enum to allow 'sso'.
DO $$ BEGIN
  ALTER TYPE "auth_provider" ADD VALUE IF NOT EXISTS 'sso';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- ─── Inbound email processing ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "inbound_emails" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id"   UUID REFERENCES "contacts"("id") ON DELETE SET NULL,
  "from_address" VARCHAR(512) NOT NULL,
  "to_address"   VARCHAR(512) NOT NULL,
  "subject"      VARCHAR(1024),
  "text_body"    TEXT,
  "html_body"    TEXT,
  "message_id"   VARCHAR(512),
  "in_reply_to"  VARCHAR(512),
  "headers"      JSONB NOT NULL DEFAULT '{}',
  "attachments"  JSONB NOT NULL DEFAULT '[]',
  "received_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "processed"    BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS "inbound_emails_org_idx"     ON "inbound_emails"("org_id", "received_at" DESC);
CREATE INDEX IF NOT EXISTS "inbound_emails_contact_idx" ON "inbound_emails"("contact_id");
CREATE INDEX IF NOT EXISTS "inbound_emails_msg_id_idx"  ON "inbound_emails"("message_id");

-- ─── SSO (SAML + OIDC) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sso_configurations" (
  "org_id"             UUID PRIMARY KEY REFERENCES "organizations"("id") ON DELETE CASCADE,
  "type"               VARCHAR(10) NOT NULL,
  "saml_entity_id"     VARCHAR(512),
  "saml_sso_url"       VARCHAR(1024),
  "saml_certificate"   TEXT,
  "oidc_issuer"        VARCHAR(512),
  "oidc_client_id"     VARCHAR(255),
  "oidc_client_secret" VARCHAR(512),
  "oidc_authorize_url" VARCHAR(1024),
  "oidc_token_url"     VARCHAR(1024),
  "oidc_jwks_uri"      VARCHAR(1024),
  "default_role"       VARCHAR(20) NOT NULL DEFAULT 'viewer',
  "enabled"            BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sso_login_states" (
  "state"        VARCHAR(64) PRIMARY KEY,
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "redirect_uri" VARCHAR(1024) NOT NULL,
  "expires_at"   TIMESTAMPTZ NOT NULL,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "sso_login_states_expires_idx" ON "sso_login_states"("expires_at");

-- ─── SOC 2 compliance ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "compliance_controls" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"           UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "control_id"       VARCHAR(50) NOT NULL,
  "category"         VARCHAR(50) NOT NULL,
  "title"            VARCHAR(255) NOT NULL,
  "description"      TEXT,
  "implemented"      BOOLEAN NOT NULL DEFAULT FALSE,
  "evidence_url"     VARCHAR(1024),
  "evidence_notes"   TEXT,
  "last_reviewed_at" TIMESTAMPTZ,
  "next_review_at"   TIMESTAMPTZ,
  "owner_user_id"    UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "compliance_controls_org_control_idx"
  ON "compliance_controls"("org_id", "control_id");

CREATE TABLE IF NOT EXISTS "access_reviews" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"           UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "reviewer_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "users_reviewed"   INTEGER NOT NULL DEFAULT 0,
  "users_revoked"    INTEGER NOT NULL DEFAULT 0,
  "findings"         TEXT,
  "report"           JSONB NOT NULL DEFAULT '{}',
  "reviewed_at"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "access_reviews_org_idx" ON "access_reviews"("org_id", "reviewed_at" DESC);

CREATE TABLE IF NOT EXISTS "data_retention_policies" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"           UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "resource"         VARCHAR(64) NOT NULL,
  "retention_days"   INTEGER NOT NULL,
  "last_enforced_at" TIMESTAMPTZ,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "retention_policies_org_resource_idx"
  ON "data_retention_policies"("org_id", "resource");
