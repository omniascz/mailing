-- Migration 0009: Webhook system + API keys (task 6.2)

DO $$ BEGIN
  CREATE TYPE "webhook_delivery_status" AS ENUM ('pending', 'success', 'failed', 'retrying');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Webhook endpoint definitions
CREATE TABLE IF NOT EXISTS "webhooks" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"           uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "url"              varchar(2048) NOT NULL,
  "secret"           varchar(255) NOT NULL,
  "events"           text[] NOT NULL DEFAULT '{}',
  "description"      varchar(255),
  "active"           boolean NOT NULL DEFAULT true,
  "total_deliveries" integer NOT NULL DEFAULT 0,
  "failed_deliveries" integer NOT NULL DEFAULT 0,
  "last_delivered_at" timestamptz,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "webhooks_org_id_idx" ON "webhooks" ("org_id");
CREATE INDEX IF NOT EXISTS "webhooks_active_idx"  ON "webhooks" ("active");

-- Delivery audit log + retry queue
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "webhook_id"    uuid NOT NULL REFERENCES "webhooks"("id") ON DELETE CASCADE,
  "org_id"        uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "event"         varchar(100) NOT NULL,
  "payload"       jsonb NOT NULL,
  "status"        "webhook_delivery_status" NOT NULL DEFAULT 'pending',
  "status_code"   integer,
  "response_body" text,
  "attempts"      integer NOT NULL DEFAULT 0,
  "next_retry_at" timestamptz,
  "delivered_at"  timestamptz,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "webhook_deliveries_webhook_id_idx"    ON "webhook_deliveries" ("webhook_id");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_org_id_idx"        ON "webhook_deliveries" ("org_id");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_status_idx"        ON "webhook_deliveries" ("status");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_next_retry_at_idx" ON "webhook_deliveries" ("next_retry_at");

-- API keys (for public API + Zapier)
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"      uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id"     uuid,
  "name"        varchar(255) NOT NULL,
  "key_hash"    varchar(255) NOT NULL UNIQUE,
  "key_prefix"  varchar(16) NOT NULL,
  "scopes"      text[] NOT NULL DEFAULT '{}',
  "active"      boolean NOT NULL DEFAULT true,
  "last_used_at" timestamptz,
  "expires_at"  timestamptz,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "api_keys_org_id_idx"   ON "api_keys" ("org_id");
CREATE INDEX IF NOT EXISTS "api_keys_key_hash_idx" ON "api_keys" ("key_hash");
