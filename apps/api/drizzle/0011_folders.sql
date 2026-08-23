CREATE TYPE "public"."folder_kind" AS ENUM('campaign', 'template');--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "folder_kind" NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "folders_org_kind_name_idx" ON "folders" USING btree ("org_id","kind","name");--> statement-breakpoint
CREATE INDEX "folders_org_kind_idx" ON "folders" USING btree ("org_id","kind");--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "templates_org_folder_idx" ON "templates" USING btree ("org_id","folder_id");--> statement-breakpoint
CREATE INDEX "campaigns_org_folder_idx" ON "campaigns" USING btree ("org_id","folder_id");