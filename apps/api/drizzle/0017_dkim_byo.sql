ALTER TABLE "sending_domains" ADD COLUMN IF NOT EXISTS "dkim_byo" boolean DEFAULT false NOT NULL;
