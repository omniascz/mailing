-- Real seed-list inbox placement testing (ground truth vs the heuristic sim).
DO $$ BEGIN
  CREATE TYPE "seed_placement" AS ENUM ('inbox','spam','promotions','updates','social','missing');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "seed_addresses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "provider" varchar(40) NOT NULL,
  "email" varchar(255) NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "seed_addresses_org_idx" ON "seed_addresses" ("org_id","active");

CREATE TABLE IF NOT EXISTS "seed_tests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE set null,
  "subject" varchar(255),
  "status" varchar(20) DEFAULT 'sent' NOT NULL,
  "sent_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "seed_tests_org_idx" ON "seed_tests" ("org_id","created_at");

CREATE TABLE IF NOT EXISTS "seed_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "test_id" uuid NOT NULL REFERENCES "seed_tests"("id") ON DELETE cascade,
  "provider" varchar(40) NOT NULL,
  "email" varchar(255) NOT NULL,
  "message_id" varchar(255),
  "placement" "seed_placement",
  "arrived" boolean,
  "reported_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "seed_results_test_idx" ON "seed_results" ("test_id");
CREATE INDEX IF NOT EXISTS "seed_results_org_idx" ON "seed_results" ("org_id");
