ALTER TABLE "media_assets" ADD COLUMN "derived_from_id" uuid;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "transform" jsonb;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_derived_from_id_media_assets_id_fk" FOREIGN KEY ("derived_from_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_derived_from_idx" ON "media_assets" USING btree ("derived_from_id");