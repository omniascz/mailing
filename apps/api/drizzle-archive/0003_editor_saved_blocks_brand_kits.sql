CREATE TABLE "saved_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by" uuid,
	"name" varchar(255) NOT NULL,
	"category" varchar(100) DEFAULT 'uncategorized' NOT NULL,
	"block_data" jsonb NOT NULL,
	"thumbnail_url" varchar(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_kits" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"logo_url" varchar(1024),
	"primary_color" varchar(7) DEFAULT '#2563eb',
	"secondary_color" varchar(7) DEFAULT '#1e40af',
	"accent_color" varchar(7) DEFAULT '#f59e0b',
	"font_heading" varchar(100) DEFAULT 'Arial, Helvetica, sans-serif',
	"font_body" varchar(100) DEFAULT 'Arial, Helvetica, sans-serif',
	"footer_text" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_blocks" ADD CONSTRAINT "saved_blocks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_blocks" ADD CONSTRAINT "saved_blocks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_blocks_org_idx" ON "saved_blocks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "saved_blocks_org_category_idx" ON "saved_blocks" USING btree ("org_id","category");
