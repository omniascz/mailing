-- Migration 0011: SMS routing engine + compliance (tasks 7.3–7.5)
-- sms_routes, sms_send_log, sms_consents, sms_inbound

-- ── SMS provider routes ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "sms_routes" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        uuid NOT NULL,
  "country_code"  text NOT NULL,
  "provider"      text NOT NULL,
  "priority"      integer NOT NULL DEFAULT 1,
  "active"        boolean NOT NULL DEFAULT true,
  "cost_per_sms"  numeric(10, 6),
  "config"        jsonb NOT NULL DEFAULT '{}',
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sms_routes_org_country_idx"  ON "sms_routes" ("org_id", "country_code");
CREATE INDEX IF NOT EXISTS "sms_routes_priority_idx"     ON "sms_routes" ("org_id", "country_code", "priority");

-- ── SMS send log ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "sms_send_log" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"              uuid NOT NULL,
  "contact_id"          uuid,
  "phone"               text NOT NULL,
  "provider"            text NOT NULL,
  "provider_message_id" text,
  "status"              text NOT NULL DEFAULT 'queued',
  "segments"            integer NOT NULL DEFAULT 1,
  "cost_eur"            numeric(10, 6),
  "campaign_id"         uuid,
  "workflow_id"         uuid,
  "error_code"          text,
  "error_message"       text,
  "sent_at"             timestamptz,
  "delivered_at"        timestamptz,
  "created_at"          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sms_send_log_org_idx"          ON "sms_send_log" ("org_id");
CREATE INDEX IF NOT EXISTS "sms_send_log_contact_idx"      ON "sms_send_log" ("contact_id");
CREATE INDEX IF NOT EXISTS "sms_send_log_provider_msg_idx" ON "sms_send_log" ("provider_message_id");

-- ── SMS consents ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "sms_consents" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"              uuid NOT NULL,
  "phone"               text NOT NULL,
  "contact_id"          uuid,
  "consent_source"      text NOT NULL,
  "consent_context"     text,
  "consented_at"        timestamptz NOT NULL DEFAULT now(),
  "revoked_at"          timestamptz,
  "revoked_via_keyword" text,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "sms_consents_org_phone_idx"    ON "sms_consents" ("org_id", "phone");
CREATE INDEX        IF NOT EXISTS "sms_consents_org_contact_idx"  ON "sms_consents" ("org_id", "contact_id");

-- ── SMS inbound messages ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "sms_inbound" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"              uuid NOT NULL,
  "provider"            text NOT NULL,
  "provider_message_id" text,
  "from_phone"          text NOT NULL,
  "to_phone"            text NOT NULL,
  "body"                text NOT NULL,
  "contact_id"          uuid,
  "keyword_action"      text,
  "workflow_triggered"  boolean NOT NULL DEFAULT false,
  "received_at"         timestamptz NOT NULL DEFAULT now(),
  "created_at"          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sms_inbound_org_idx"          ON "sms_inbound" ("org_id");
CREATE INDEX IF NOT EXISTS "sms_inbound_from_phone_idx"   ON "sms_inbound" ("from_phone");
CREATE INDEX IF NOT EXISTS "sms_inbound_provider_msg_idx" ON "sms_inbound" ("provider_message_id");
