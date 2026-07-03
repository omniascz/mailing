-- Per-domain open/click tracking defaults (Resend parity).
ALTER TABLE "sending_domains" ADD COLUMN IF NOT EXISTS "open_tracking" boolean DEFAULT true NOT NULL;
ALTER TABLE "sending_domains" ADD COLUMN IF NOT EXISTS "click_tracking" boolean DEFAULT true NOT NULL;
