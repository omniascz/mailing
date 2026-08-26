ALTER TYPE "public"."campaign_status" ADD VALUE 'queueing';--> statement-breakpoint
ALTER TYPE "public"."campaign_status" ADD VALUE 'failed';--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "planned_recipients" integer;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "pending_batches" integer;--> statement-breakpoint
ALTER TABLE "campaign_dispatch_batches" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_dispatch_batches" ADD COLUMN "sent_count" integer;--> statement-breakpoint
ALTER TABLE "campaign_dispatch_batches" ADD COLUMN "skipped_count" integer;