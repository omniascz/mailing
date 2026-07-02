CREATE TABLE IF NOT EXISTS "mobile_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"platform" varchar(16) NOT NULL,
	"token" text NOT NULL,
	"app_id" varchar(255),
	"device_model" varchar(128),
	"os_version" varchar(64),
	"active" boolean DEFAULT true NOT NULL,
	"invalidated_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mobile_devices_org_idx" ON "mobile_devices" ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mobile_devices_contact_idx" ON "mobile_devices" ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mobile_devices_org_token_idx" ON "mobile_devices" ("org_id","token");
