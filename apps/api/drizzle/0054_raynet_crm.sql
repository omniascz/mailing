-- #391 Raynet CRM connection + external-id mappings

CREATE TABLE IF NOT EXISTS "raynet_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "instance_name" varchar(128) NOT NULL,
  "username" varchar(255) NOT NULL,
  "api_key" text NOT NULL,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "sync_contacts" boolean NOT NULL DEFAULT true,
  "sync_companies" boolean NOT NULL DEFAULT true,
  "sync_deals" boolean NOT NULL DEFAULT true,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "raynet_connections_org_uq" ON "raynet_connections" ("org_id");
CREATE INDEX IF NOT EXISTS "raynet_connections_instance_idx" ON "raynet_connections" ("instance_name");

CREATE TABLE IF NOT EXISTS "raynet_contact_map" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "raynet_contact_id" bigint NOT NULL,
  "synced_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "raynet_contact_map_contact_uq" ON "raynet_contact_map" ("org_id", "contact_id");
CREATE UNIQUE INDEX IF NOT EXISTS "raynet_contact_map_remote_uq" ON "raynet_contact_map" ("org_id", "raynet_contact_id");
CREATE INDEX IF NOT EXISTS "raynet_contact_map_org_idx" ON "raynet_contact_map" ("org_id");

CREATE TABLE IF NOT EXISTS "raynet_company_map" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "raynet_company_id" bigint NOT NULL,
  "synced_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "raynet_company_map_account_uq" ON "raynet_company_map" ("org_id", "account_id");
CREATE UNIQUE INDEX IF NOT EXISTS "raynet_company_map_remote_uq" ON "raynet_company_map" ("org_id", "raynet_company_id");
CREATE INDEX IF NOT EXISTS "raynet_company_map_org_idx" ON "raynet_company_map" ("org_id");

CREATE TABLE IF NOT EXISTS "raynet_deal_map" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "deal_id" uuid NOT NULL REFERENCES "deals"("id") ON DELETE CASCADE,
  "raynet_business_case_id" bigint NOT NULL,
  "synced_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "raynet_deal_map_deal_uq" ON "raynet_deal_map" ("org_id", "deal_id");
CREATE UNIQUE INDEX IF NOT EXISTS "raynet_deal_map_remote_uq" ON "raynet_deal_map" ("org_id", "raynet_business_case_id");
CREATE INDEX IF NOT EXISTS "raynet_deal_map_org_idx" ON "raynet_deal_map" ("org_id");
