ALTER TABLE "dkim_keys" ADD COLUMN "dek_wrapped" text;--> statement-breakpoint
ALTER TABLE "dkim_keys" ADD COLUMN "master_key_version" integer DEFAULT 1 NOT NULL;