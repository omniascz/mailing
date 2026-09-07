CREATE TABLE "ip_blacklist_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"zone" varchar(253) NOT NULL,
	"return_code" varchar(45),
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	"cleared_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ip_blacklist_events_open_idx" ON "ip_blacklist_events" USING btree ("ip_address","zone") WHERE cleared_at IS NULL;--> statement-breakpoint
CREATE INDEX "ip_blacklist_events_unnotified_idx" ON "ip_blacklist_events" USING btree ("notified_at") WHERE notified_at IS NULL AND cleared_at IS NULL;