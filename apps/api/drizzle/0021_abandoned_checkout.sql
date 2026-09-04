CREATE TABLE "ecommerce_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"external_checkout_id" varchar(128) NOT NULL,
	"token" varchar(191) NOT NULL,
	"contact_id" uuid,
	"customer_email" varchar(255),
	"total_amount" varchar(32),
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recovery_url" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_order_id" varchar(128),
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ecommerce_checkouts" ADD CONSTRAINT "ecommerce_checkouts_connection_id_ecommerce_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ecommerce_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecommerce_checkouts" ADD CONSTRAINT "ecommerce_checkouts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ecommerce_checkouts_token_uq" ON "ecommerce_checkouts" USING btree ("connection_id","token");--> statement-breakpoint
CREATE INDEX "ecommerce_checkouts_org_idx" ON "ecommerce_checkouts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ecommerce_checkouts_contact_idx" ON "ecommerce_checkouts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "ecommerce_checkouts_completed_idx" ON "ecommerce_checkouts" USING btree ("completed_at");