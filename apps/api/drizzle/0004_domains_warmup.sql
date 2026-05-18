CREATE TABLE "sending_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"domain" varchar(253) NOT NULL,
	"mail_subdomain" varchar(253),
	"dkim_selector" varchar(63) NOT NULL DEFAULT 'fm1',
	"dkim_private_key" text,
	"dkim_public_key" text,
	"dkim_verified" boolean NOT NULL DEFAULT false,
	"dkim_verified_at" timestamp with time zone,
	"spf_verified" boolean NOT NULL DEFAULT false,
	"spf_verified_at" timestamp with time zone,
	"dmarc_verified" boolean NOT NULL DEFAULT false,
	"dmarc_verified_at" timestamp with time zone,
	"return_path_verified" boolean NOT NULL DEFAULT false,
	"return_path_verified_at" timestamp with time zone,
	"is_verified" boolean NOT NULL DEFAULT false,
	"warmup_status" varchar(20) NOT NULL DEFAULT 'cold',
	"warmup_started_at" timestamp with time zone,
	"warmup_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warmup_ips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"ip_address" varchar(45) NOT NULL,
	"warmup_day" integer NOT NULL DEFAULT 0,
	"today_sent" integer NOT NULL DEFAULT 0,
	"current_date" varchar(10) NOT NULL DEFAULT '',
	"status" varchar(20) NOT NULL DEFAULT 'cold',
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sending_domains" ADD CONSTRAINT "sending_domains_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_ips" ADD CONSTRAINT "warmup_ips_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sending_domains_org_idx" ON "sending_domains" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sending_domains_org_domain_idx" ON "sending_domains" USING btree ("org_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "warmup_ips_ip_idx" ON "warmup_ips" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "warmup_ips_org_idx" ON "warmup_ips" USING btree ("org_id");
