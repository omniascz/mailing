ALTER TABLE "coupon_batches" ADD COLUMN "store_platform" varchar(24);--> statement-breakpoint
ALTER TABLE "coupon_batches" ADD COLUMN "store_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "coupon_batches" ADD COLUMN "store_discount_id" varchar(128);--> statement-breakpoint
ALTER TABLE "coupon_batches" ADD COLUMN "store_synced_at" timestamp with time zone;
