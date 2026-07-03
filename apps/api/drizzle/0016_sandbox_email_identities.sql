ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sending_mode" varchar(16) DEFAULT 'production' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"token" varchar(64) NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_identities_org_email_uq" UNIQUE("org_id","email")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_identities_org_idx" ON "email_identities" ("org_id");
