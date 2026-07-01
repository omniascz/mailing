ALTER TYPE "contact_status" ADD VALUE IF NOT EXISTS 'non_subscribed';--> statement-breakpoint
ALTER TYPE "contact_status" ADD VALUE IF NOT EXISTS 'archived';--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "is_vip" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "contacts_org_vip_idx" ON "contacts" USING btree ("org_id","is_vip");