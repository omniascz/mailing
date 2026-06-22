-- Migration 0012: WhatsApp templates/consents/quality, Web Push, In-app messaging
-- Tasks 7.7–7.11

-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "wa_template_category" AS ENUM ('marketing', 'utility', 'authentication');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "wa_template_status" AS ENUM ('draft', 'pending', 'approved', 'rejected', 'paused', 'disabled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "wa_quality_rating" AS ENUM ('GREEN', 'YELLOW', 'RED', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "wa_conversation_category" AS ENUM ('marketing', 'utility', 'authentication', 'service');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "in_app_widget_type" AS ENUM ('banner', 'modal', 'slideout');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "in_app_position" AS ENUM ('top', 'bottom', 'center', 'left', 'right');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── WhatsApp templates (7.7) ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "whatsapp_templates" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"            uuid NOT NULL,
  "name"              text NOT NULL,
  "category"          wa_template_category NOT NULL DEFAULT 'utility',
  "language"          text NOT NULL DEFAULT 'en_US',
  "status"            wa_template_status NOT NULL DEFAULT 'draft',
  "components"        jsonb NOT NULL DEFAULT '[]',
  "meta_template_id"  text,
  "rejection_reason"  text,
  "usage_count"       integer NOT NULL DEFAULT 0,
  "submitted_at"      timestamptz,
  "approved_at"       timestamptz,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX        IF NOT EXISTS "wa_templates_org_idx"           ON "whatsapp_templates" ("org_id");
CREATE UNIQUE INDEX IF NOT EXISTS "wa_templates_org_name_lang_idx" ON "whatsapp_templates" ("org_id", "name", "language");
CREATE INDEX        IF NOT EXISTS "wa_templates_status_idx"        ON "whatsapp_templates" ("status");

-- ── WhatsApp consents (7.9) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "whatsapp_consents" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"           uuid NOT NULL,
  "phone"            text NOT NULL,
  "contact_id"       uuid,
  "consent_source"   text NOT NULL,
  "consent_context"  text,
  "consented_at"     timestamptz NOT NULL DEFAULT now(),
  "revoked_at"       timestamptz,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "wa_consents_org_phone_idx" ON "whatsapp_consents" ("org_id", "phone");

-- ── WhatsApp phone numbers + quality (7.9) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS "whatsapp_phone_numbers" (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"                 uuid NOT NULL,
  "phone_number_id"        text NOT NULL,
  "display_phone"          text,
  "quality_rating"         wa_quality_rating NOT NULL DEFAULT 'GREEN',
  "messaging_limit_tier"   text NOT NULL DEFAULT '1000',
  "conversations_last_24h" integer NOT NULL DEFAULT 0,
  "active"                 boolean NOT NULL DEFAULT true,
  "created_at"             timestamptz NOT NULL DEFAULT now(),
  "updated_at"             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX        IF NOT EXISTS "wa_phone_numbers_org_idx" ON "whatsapp_phone_numbers" ("org_id");
CREATE UNIQUE INDEX IF NOT EXISTS "wa_phone_numbers_id_idx"  ON "whatsapp_phone_numbers" ("org_id", "phone_number_id");

-- ── WhatsApp conversations (7.9) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "whatsapp_conversations" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"            uuid NOT NULL,
  "phone_number_id"   text NOT NULL,
  "contact_phone"     text NOT NULL,
  "contact_id"        uuid,
  "category"          wa_conversation_category NOT NULL DEFAULT 'utility',
  "window_expires_at" timestamptz,
  "message_count"     integer NOT NULL DEFAULT 0,
  "last_message_at"   timestamptz,
  "created_at"        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "wa_conversations_org_idx"     ON "whatsapp_conversations" ("org_id");
CREATE INDEX IF NOT EXISTS "wa_conversations_contact_idx" ON "whatsapp_conversations" ("org_id", "contact_phone");

-- ── VAPID keys + push subscriptions (7.10) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS "vapid_keys" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"      uuid NOT NULL,
  "public_key"  text NOT NULL,
  "private_key" text NOT NULL,
  "active"      boolean NOT NULL DEFAULT true,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "vapid_keys_org_idx" ON "vapid_keys" ("org_id") WHERE "active" = true;

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"           uuid NOT NULL,
  "contact_id"       uuid,
  "endpoint"         text NOT NULL,
  "p256dh"           text NOT NULL,
  "auth"             text NOT NULL,
  "user_agent"       text,
  "fcm_token"        text,
  "active"           boolean NOT NULL DEFAULT true,
  "unsubscribed_at"  timestamptz,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX        IF NOT EXISTS "push_subscriptions_org_idx"      ON "push_subscriptions" ("org_id");
CREATE INDEX        IF NOT EXISTS "push_subscriptions_contact_idx"  ON "push_subscriptions" ("contact_id");
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_idx" ON "push_subscriptions" ("endpoint");

CREATE TABLE IF NOT EXISTS "push_send_log" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"           uuid NOT NULL,
  "subscription_id"  uuid,
  "contact_id"       uuid,
  "title"            text NOT NULL,
  "body"             text NOT NULL,
  "url"              text,
  "status"           text NOT NULL DEFAULT 'queued',
  "error_code"       text,
  "error_message"    text,
  "campaign_id"      uuid,
  "clicked_at"       timestamptz,
  "sent_at"          timestamptz,
  "created_at"       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "push_send_log_org_idx"     ON "push_send_log" ("org_id");
CREATE INDEX IF NOT EXISTS "push_send_log_contact_idx" ON "push_send_log" ("contact_id");

-- ── In-app messages (7.11) ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "in_app_messages" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"              uuid NOT NULL,
  "name"                text NOT NULL,
  "widget_type"         in_app_widget_type NOT NULL DEFAULT 'banner',
  "position"            in_app_position NOT NULL DEFAULT 'bottom',
  "title"               text NOT NULL,
  "body"                text NOT NULL,
  "cta_label"           text,
  "cta_url"             text,
  "background_color"    text DEFAULT '#ffffff',
  "text_color"          text DEFAULT '#000000',
  "image_url"           text,
  "targeting_rules"     jsonb NOT NULL DEFAULT '[]',
  "max_per_session"     integer NOT NULL DEFAULT 1,
  "max_total"           integer NOT NULL DEFAULT 0,
  "auto_close_seconds"  integer NOT NULL DEFAULT 0,
  "active"              boolean NOT NULL DEFAULT true,
  "campaign_id"         uuid,
  "impressions"         integer NOT NULL DEFAULT 0,
  "clicks"              integer NOT NULL DEFAULT 0,
  "start_at"            timestamptz,
  "end_at"              timestamptz,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "in_app_messages_org_idx"        ON "in_app_messages" ("org_id");
CREATE INDEX IF NOT EXISTS "in_app_messages_org_active_idx" ON "in_app_messages" ("org_id", "active");

CREATE TABLE IF NOT EXISTS "in_app_impressions" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"      uuid NOT NULL,
  "message_id"  uuid NOT NULL,
  "contact_id"  uuid,
  "session_id"  text,
  "page_url"    text,
  "event_type"  text NOT NULL DEFAULT 'shown',
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "in_app_impressions_message_idx" ON "in_app_impressions" ("message_id");
CREATE INDEX IF NOT EXISTS "in_app_impressions_contact_idx" ON "in_app_impressions" ("contact_id");
CREATE INDEX IF NOT EXISTS "in_app_impressions_session_idx" ON "in_app_impressions" ("session_id");
