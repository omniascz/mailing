CREATE TABLE IF NOT EXISTS "subscription_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"description" varchar(500),
	"default_status" varchar(16) DEFAULT 'opt_in' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_topics_org_name_uq" UNIQUE("org_id","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_topic_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"status" varchar(16) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_topic_subs_uq" UNIQUE("contact_id","topic_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_topics_org_idx" ON "subscription_topics" ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_topic_subs_contact_idx" ON "contact_topic_subscriptions" ("contact_id");
