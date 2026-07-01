CREATE TABLE IF NOT EXISTS "segment_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"segment_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "segment_members" ADD CONSTRAINT "segment_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_members" ADD CONSTRAINT "segment_members_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "segment_members_seg_contact_idx" ON "segment_members" USING btree ("segment_id","contact_id");--> statement-breakpoint
CREATE INDEX "segment_members_org_seg_idx" ON "segment_members" USING btree ("org_id","segment_id");--> statement-breakpoint
ALTER TYPE "workflow_trigger_type" ADD VALUE IF NOT EXISTS 'segment_entered';--> statement-breakpoint
ALTER TYPE "workflow_trigger_type" ADD VALUE IF NOT EXISTS 'segment_exited';--> statement-breakpoint
ALTER TABLE "segments" ADD COLUMN "last_membership_sync_at" timestamp with time zone;