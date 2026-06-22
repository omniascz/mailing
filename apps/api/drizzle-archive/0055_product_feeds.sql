-- #393 Product feed ingestion (Heureka, Zbozi.cz, Google Shopping)

DO $$ BEGIN
  CREATE TYPE "product_feed_format" AS ENUM ('heureka', 'zbozi', 'google_shopping', 'custom_xml');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "product_feeds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "format" "product_feed_format" NOT NULL,
  "url" text NOT NULL,
  "username" varchar(128),
  "password" text,
  "poll_interval_minutes" integer NOT NULL DEFAULT 60,
  "last_synced_at" timestamp with time zone,
  "last_error" text,
  "last_item_count" integer,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "product_feeds_org_url_uq" ON "product_feeds" ("org_id", "url");
CREATE INDEX IF NOT EXISTS "product_feeds_org_idx" ON "product_feeds" ("org_id");
CREATE INDEX IF NOT EXISTS "product_feeds_next_sync_idx" ON "product_feeds" ("last_synced_at");
