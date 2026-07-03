CREATE TABLE IF NOT EXISTS "configuration_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"sending_enabled" boolean DEFAULT true NOT NULL,
	"options" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuration_sets_org_name_uq" UNIQUE("org_id","name")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "configuration_sets_org_idx" ON "configuration_sets" ("org_id");
