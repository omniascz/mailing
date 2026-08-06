CREATE TABLE "campaign_dispatch_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"dispatch_id" varchar(128) NOT NULL,
	"batch_key" varchar(128) NOT NULL,
	"enqueued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_dispatch_batches" ADD CONSTRAINT "campaign_dispatch_batches_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_dispatch_batches" ADD CONSTRAINT "campaign_dispatch_batches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_dispatch_batches_uidx" ON "campaign_dispatch_batches" USING btree ("dispatch_id","batch_key");--> statement-breakpoint
CREATE INDEX "campaign_dispatch_batches_campaign_idx" ON "campaign_dispatch_batches" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_dispatch_batches_org_idx" ON "campaign_dispatch_batches" USING btree ("org_id");